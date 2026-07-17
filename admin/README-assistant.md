# MQ Steel Assistant — Admin Copilot

A **read-only** chat assistant built into the admin portal (the "Assistant" nav item
in `admin/index.html`). It answers staff questions about requests, drafts reply text,
and (in a separate `analyze` mode) proposes candidate business patterns/insights —
using **only** company data as context. It never writes to Firestore, never touches
submissions, and never sees raw customer PII.

## How it works

- **Frontend** (`admin/assets/js/copilot.js`): on submit, it reads the admin's cached
  submissions (`window.__getSubmissions()`, exposed by `app.js`) and the shared
  `companyMemory` docs (`admin/assets/js/memory.js` → `loadMemory()`), **redacts** every
  submission through `admin/assets/js/redact.js` (`redact()`/`scrubText()` strip name,
  email, and phone — company + service text + status survive), and POSTs
  `{ question, context }` to the Worker with the admin's Firebase ID token and App
  Check token as headers. The reply renders with `textContent` only — never
  `innerHTML`/`insertAdjacentHTML` — so nothing the model (or an attacker's injected
  text) returns can execute as HTML.
- **Backend** (`worker/`): a Cloudflare Worker (`worker/src/index.js`) that verifies
  the caller (`worker/src/verify.js` — Firebase ID token + App Check token, both
  signature-verified against Google's JWKS, plus an allowlist check against the
  `admins` Firestore collection), rate-limits per admin via a KV namespace (30
  requests / 5 minutes, `worker/src/index.js`), builds a grounded prompt
  (`worker/src/prompt.js` — treats all context as **data, not instructions**, and
  explicitly tells the model not to invent names/emails/phones), and calls
  **Cloudflare Workers AI's free Llama 3.3 70B instruct model**
  (`worker/src/model.js`, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) via the `AI`
  binding. There is no other AI provider and no separate API key to manage.
- **Data source**: an app-level `companyMemory` Firestore collection (rules in the
  repo-root `firestore.rules`, schema/writers in `admin/assets/js/memory.js`) holding
  four doc `type`s: `fact`, `insight`, `pattern`, `request`. This is the assistant's
  only "memory" — it is not a vector store or embeddings index (see v1 follow-ups
  below).
- **Provider data use**: Cloudflare Workers AI does not use your inputs/outputs to
  train models. Requests only ever leave the browser for two places: Cloudflare's
  Worker (redacted context) and Cloudflare Workers AI (same redacted context, on
  Cloudflare's infrastructure) — no third-party LLM vendor is involved.

## Owner setup checklist

These are the deploy actions that could not be completed in the development
environment (no Cloudflare account, no live Firebase deploy access). Do them in
order — later steps depend on earlier ones.

1. **Cloudflare account + CLI login**
   ```bash
   cd worker
   npm install
   npx wrangler login
   ```
   Create a free Cloudflare account first if you don't have one. Workers AI is
   available on the free tier.

2. **Create the rate-limit KV namespace**
   ```bash
   npx wrangler kv namespace create RATE
   ```
   Copy the returned namespace `id` into `worker/wrangler.jsonc` →
   `kv_namespaces[0].id`, replacing the placeholder `REPLACE_AFTER_KV_CREATE`.

3. **Confirm config, then deploy the Worker**
   In `worker/wrangler.jsonc`, confirm `vars.ALLOWED_ORIGINS` lists the exact admin
   Hosting origin(s) (currently `https://mq-steel-admin.web.app` — check
   `admin/README.md` / `.firebaserc` if this ever changes) and `vars.FIREBASE_PROJECT_ID`
   matches the project (`mq-steel-corp`). Then:
   ```bash
   npx wrangler deploy
   ```
   Copy the deployed `*.workers.dev` URL from the output.

4. **Point the frontend at the deployed Worker**
   In `admin/assets/js/copilot.js`, replace:
   ```js
   const WORKER_URL = 'https://mq-steel-assistant.REPLACE.workers.dev/chat';
   ```
   with the real deployed URL + `/chat` (keep the `/chat` path — that's the Worker's
   only route).

5. **Deploy the Firestore rules** (adds the `companyMemory` collection rules —
   admin-only read/write, `type` restricted to `fact|insight|pattern|request`):
   ```bash
   firebase deploy --only firestore:rules
   ```

6. **Register the admin domain for App Check** (same gotcha as the public contact
   form): add the admin Hosting domain (`mq-steel-admin.web.app`, plus any custom
   admin domain) to the reCAPTCHA v3 site key's allowed domains, and confirm the app
   is registered under Firebase Console → App Check. Without this, the Worker's App
   Check verification (`worker/src/verify.js`) will reject every request with 401,
   even from a legitimate signed-in admin.

Once all six steps are done, reload the admin portal on the live admin domain,
sign in as an allowlisted admin, open **Assistant**, and ask a question.

## How to add company facts

`companyMemory` `fact` docs are the assistant's ground truth about the business
(services offered, pricing policy, turnaround times, service area, etc. — anything
you want the model to answer from directly instead of guessing). There is no
authoring UI yet in v1; add facts either:

- **Programmatically**, via the exported helper in `admin/assets/js/memory.js`:
  ```js
  import { saveFact } from './memory.js';
  await saveFact('MQ Steel Corp typically responds to new quotes within 1 business day.', adminEmail);
  ```
  (Call this from the browser console while signed in as an admin, or wire it into a
  small future admin UI — see v1 follow-ups.)
- **Directly in the Firebase Console** → Firestore → `companyMemory` collection →
  add a document with `{ type: 'fact', text: '<the fact>', createdBy: '<admin email>',
  createdAt: <timestamp> }`.

Facts are expected to be **seeded over time** as the owner/staff notice things worth
telling the assistant — there's no bulk-import step required before first use; the
assistant works (with a thinner knowledge base) even with zero facts seeded.

`insight` and `pattern` docs are written by `saveInsight()` / `savePatterns()` in the
same module, intended for confirmed observations and Worker-proposed patterns
(`analyze` mode) respectively — same manual/console path today.

## Security notes

- **Auth is verified in the Worker, not trusted from the client.** Every `/chat`
  request must carry a valid Firebase ID token (`Authorization: Bearer …`) *and* a
  valid Firebase App Check token (`X-Firebase-AppCheck`). Both are cryptographically
  verified against Google's JWKS in `worker/src/verify.js` — the Worker does not just
  read claims off an unverified JWT.
- **Allowlist enforced server-side.** After token verification, the Worker checks the
  caller's (lower-cased) email against the `admins` Firestore collection using the
  caller's own tokens (no service account needed) — matching the same `isAdmin()`
  gate the rest of the admin portal uses.
- **PII is redacted before it ever leaves the browser.** `redact()` /`scrubText()`
  (`admin/assets/js/redact.js`) strip email and phone patterns and omit `name`/`email`
  entirely from every submission before it's added to the outgoing `context`; only
  `company`, a scrubbed `service` string, `status`, and `submittedAt` survive. Static
  verification for this task confirmed: no `name`/`email` fields, no email/phone
  strings reach the request body — see Step 4/report.
- **Read-only, end to end.** `copilot.js` contains no Firestore write calls
  (`setDoc`/`addDoc`/`updateDoc`) — confirmed by grep. The assistant can only read
  cached submissions and `companyMemory`; it cannot change submission status, notes,
  or anything else in Firestore.
- **Per-admin rate limiting.** The Worker caps each admin to 30 requests per 5-minute
  window via the `RATE` KV namespace, keyed by the verified admin email (not by IP,
  which is easily rotated) — a 429 response maps to a friendly "slow down" message in
  the UI.
- **Safe rendering.** Assistant replies (and echoed context) are rendered with
  `textContent`, never `innerHTML`/`insertAdjacentHTML` — model output cannot execute
  as HTML/script even if it contains injected markup.
- **Prompt-injection resistance.** The system prompt (`worker/src/prompt.js`)
  explicitly instructs the model to treat all context (facts/insights/patterns/redacted
  requests) as *data, not instructions*, and never to invent PII — mitigating "ignore
  previous instructions" style content hidden inside a submission's `service` field.
- **CORS + origin allowlisting.** The Worker only answers preflight/POST requests from
  origins listed in `ALLOWED_ORIGINS`; anything else gets a 403.

## v1 follow-ups (known scope cuts)

- **Auto-enrichment isn't wired to the chat UI yet.** `memory.js` exports
  `upsertRequestEntries()` (turns submissions into redacted `companyMemory` `request`
  docs), `saveInsight()`, and `savePatterns()`, but there's no "Refresh insights"
  button or scheduled job calling them yet — they're available to call manually/from
  the console today.
- **The chat rebuilds `requests` context live from the in-memory submissions cache**
  (`window.__getSubmissions()`) on every question, capped at 200 — it does **not**
  currently read back the `companyMemory` `request` docs that `upsertRequestEntries()`
  writes. Those docs exist (once enrichment is wired up) but aren't consumed by the
  chat context yet.
- **No retrieval/embeddings.** The "complex memory" phase (semantic search over a
  large/growing `companyMemory` via Vectorize or similar, plus a Cron trigger to keep
  `insight`/`pattern` docs fresh automatically) is intentionally deferred — v1 sends
  the full (capped, redacted) context on every request, which is fine at current data
  volume.
- **The question box itself is not redacted.** `redact()` is only applied to
  submissions going into `context`; if a staff member types a customer's name/email
  directly into the assistant's input field, that text goes to the Worker (and the
  model) as-is. Advise staff not to paste raw customer PII into the question box.
