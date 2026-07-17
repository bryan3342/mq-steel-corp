# Admin Assistant (Read-Only Copilot) — Design

**Date:** 2026-07-17
**Status:** Approved — ready for implementation planning
**Scope:** Add a read-only AI copilot to the admin console (`admin/`) that answers
questions and drafts replies over the requests, backed by an app-level company
memory. Free, no-training model via a Cloudflare Worker proxy.

---

## 1. Goal

Give admins an in-console assistant that can:
- Summarize and answer questions about incoming requests ("how many welding
  requests this month?", "which open leads look highest priority?").
- Draft a reply to a specific request.
- Surface insights/patterns about the business over time.

It must be **read-only** (never mutates `submissions`), **free** to run,
**privacy-preserving** (customer PII never leaves the browser un-redacted, and the
model provider does not train on the data), and **modular / air-tight**.

## 2. Non-goals (v1)

- No agent write-actions on submissions (no auto status changes, no auto-send email).
- No autonomous background processing (no Cron Worker, no service-account key).
  Memory is built client-side, admin-gated. (A future "complex memory" phase can
  add embeddings/retrieval + a scheduled worker without schema changes.)
- No changes to the public marketing site or the existing submission flow.
- No new framework/build step — vanilla ES modules, matching the current admin app.

## 3. Architecture

```
Admin browser (authenticated admin)        Cloudflare Worker              Workers AI
─────────────────────────────────         ────────────────────          ────────────
copilot.js (new module)                    POST /chat                    Llama 3.3 70B
 • reads submissionsCache (already loaded) 1. verify Firebase ID token   (via AI binding;
 • reads companyMemory (Firestore)            (sig, aud, exp, verified)   no API key;
 • redact() PII                            2. verify App Check token       Cloudflare does
 • assemble context (memory + question)    3. re-check /admins allowlist   not train on
 • fetch(Worker, {Authorization, tokens})  4. per-admin rate limit          inputs)
 • render answer via textContent           5. callModel(system, context) ─▶
                                           6. return text (stores nothing)
Firestore (project mq-steel-corp)
 • submissions      — raw requests, source of truth (UNCHANGED)
 • companyMemory    — NEW: PII-safe agent memory
 • admins           — allowlist (UNCHANGED)
```

Data flow: everything the model sees is assembled client-side and **redacted**
before it leaves the browser. The Worker is a stateless auth gate + model call.

## 4. Backend — Cloudflare Worker (`worker/`)

A standalone service (own directory + `wrangler.jsonc`), deployed to Cloudflare
(free plan, no card). Single endpoint `POST /chat`.

**Responsibilities (in order):**
1. **CORS** — allow only the admin origin(s) (e.g. `https://mq-steel-admin.web.app`
   + the admin `*.firebaseapp.com`); reject others. Handle `OPTIONS` preflight.
2. **Firebase ID token verification** — read `Authorization: Bearer <idToken>`;
   verify the RS256 JWT against Google's public certs
   (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`,
   cached per `Cache-Control`); assert `aud == "mq-steel-corp"`,
   `iss == "https://securetoken.google.com/mq-steel-corp"`, `exp` valid, and
   `email_verified == true`.
3. **App Check token verification** — read `X-Firebase-AppCheck`; verify against
   the project's App Check public JWKS. (Defense in depth alongside the ID token.)
4. **Allowlist re-check** — confirm the caller's email is an admin: a Firestore
   REST `GET /admins/{email}` **forwarding the caller's ID token** (the existing
   rule `allow get if request.auth.token.email == adminEmail` gates it). No
   service account needed. Cache briefly per email.
5. **Rate limit** — per-admin (by email/uid) fixed-window counter in Workers KV
   (e.g. 30 requests / 5 min); return 429 when exceeded.
6. **Model call** — `callModel({ system, messages })` wrapping
   `env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages })`.
   `callModel` is the single swappable seam (Workers AI ↔ Groq ↔ Gemini).
7. **Response** — return `{ text }`. The Worker stores nothing; logs are
   metadata-only (no prompt/PII content).

**Secrets/config:** none required for Workers AI (uses the `AI` binding). KV
namespace binding for rate limiting. `ALLOWED_ORIGINS` and `FIREBASE_PROJECT_ID`
as `vars`.

**Request contract:**
```
POST /chat
Authorization: Bearer <Firebase ID token>
X-Firebase-AppCheck: <App Check token>
Body: { "question": string, "context": { facts: [...], insights: [...],
        patterns: [...], requests: [redacted...], focusRequest?: redacted } }
→ 200 { "text": string } | 401 | 403 | 429 | 500 { "error": string }
```

## 5. Frontend — `admin/assets/js/copilot.js` (new module)

Self-contained; touches `app.js` only through a tiny read accessor for the
current submissions (no coupling to internal render logic).

- **UI:** a new **"Assistant"** entry in the existing `dash-nav`; selecting it
  shows a chat panel (message list + input). Reuses existing styles/tokens.
- **Context assembly:** pulls `companyMemory` (facts/insights/patterns/requests)
  + optionally a focused request the admin selected; caps total size to fit the
  model context (v1: send all, capped with a documented truncation + a visible
  "showing N of M" note — no silent drop).
- **Redaction:** every request/field is passed through `redact()` before it is
  put into `context`. Business/company names are **kept**; personal names,
  emails, and phone-like patterns are removed.
- **Auth:** attaches `await auth.currentUser.getIdToken()` and the App Check
  token to the fetch.
- **Rendering:** assistant replies rendered with `textContent` or a minimal,
  allow-list markdown-to-DOM (bold/lists/paragraphs only) — **never** `innerHTML`
  with model output. Matches the app's stored-XSS discipline.
- **States:** loading, error (network/401/403/429 → friendly messages), empty.

## 6. Memory model — `companyMemory` collection

One collection, typed docs, **all PII-safe** (redacted at write time), so the
agent only ever reads safe data.

| type | fields | how it grows |
|------|--------|--------------|
| `fact` | `text`, `createdBy`, `createdAt` | Admin-curated in a small "Company facts" editor; scaffolded with clearly-marked placeholders. |
| `insight` | `text`, `confirmedBy`, `createdAt` | Agent proposes → admin **confirms** → saved. |
| `pattern` | `text`, `window`, `generatedAt` | Auto-captured: the redacted request corpus is distilled via the Worker and stored; re-generated on "Refresh insights". |
| `request` | `refId` (submission id), `category`, `serviceSummary` (redacted), `company`, `status`, `submittedAt` | Auto: idempotent upsert (keyed by `refId`) as requests come in. This is "all requests stored to memory," redacted. |

**Enrichment (v1, client-side, admin-gated):** while an admin is in the console,
the app redacts any submissions lacking a `request` memory doc and upserts them;
a "Refresh insights" action calls the Worker to (re)derive `pattern`/`insight`
candidates from the redacted corpus, which the admin can confirm. All writes go
through Auth + rules + App Check (no service account).

## 7. Redaction — pure `redact()` module (`admin/assets/js/redact.js`)

- Input: a submission (or free text). Output: redacted copy.
- Removes: the `name` field; the `email` field; email addresses and phone-like
  digit sequences embedded in free text (`service`, notes).
- Keeps: `company`, `service` (with inline PII scrubbed), `status`, dates,
  derived `category`.
- Pure and deterministic → unit-testable in isolation.

## 8. Firestore rules (add `companyMemory`)

```
match /companyMemory/{id} {
  allow read:   if isAdmin();
  allow create, update: if isAdmin()
                        && request.resource.data.type in ['fact','insight','pattern','request'];
  allow delete: if isAdmin();
}
```
(Reuses the existing `isAdmin()` helper. `submissions`/`admins` rules unchanged.)
Rules are deployed separately (`firebase deploy --only firestore:rules`); note in
the plan that this deploy is required for the memory to work.

## 9. Security posture (air-tight checklist)

- Worker verifies **Firebase ID token + App Check token + `/admins` allowlist**
  before any model call. Non-admins get 401/403.
- **No secrets in the browser**; Workers AI needs no key.
- **PII redacted before egress** and before any `companyMemory` write.
- **Provider does not train** on inputs (Workers AI).
- **Per-admin rate limiting** (KV) guards cost/abuse.
- **Read-only**: agent has no tools; cannot write `submissions`.
- **Untrusted output** rendered as text; **submission text treated as data, not
  instructions** (prompt-injection hygiene in the system prompt + delimiters).
- CORS locked to the admin origin(s).
- Worker logs contain no prompt/PII content.

## 10. Modularity / files

- `worker/` — `src/index.js` (router + auth + rate limit), `src/verify.js`
  (token verification), `src/model.js` (`callModel`), `wrangler.jsonc`, `README.md`.
- `admin/assets/js/redact.js` — pure redaction.
- `admin/assets/js/memory.js` — `companyMemory` read/upsert/enrichment.
- `admin/assets/js/copilot.js` — chat UI + orchestration.
- `admin/index.html` / `admin/assets/css/styles.css` — Assistant nav item + panel.
- `firestore.rules` — add `companyMemory`.

## 11. Verification

- Worker: unit-test token verification (valid/expired/wrong-aud/non-admin → reject)
  and rate limit; a local `wrangler dev` smoke test with a mock token.
- `redact()`: unit tests (name/email/phone removed; company/service kept).
- Frontend: drive the admin console (demo mode) → open Assistant → ask a question
  → assert a rendered answer and that outgoing context contains no PII.
- End-to-end on the deployed Worker with a real admin token (manual, owner).

## 12. Build phases

1. **Worker** — auth verification + `callModel` (Workers AI) + rate limit + CORS;
   deploy; `wrangler dev` + unit tests.
2. **Memory + redaction** — `redact.js`, `memory.js`, `companyMemory` rules,
   enrichment; unit tests.
3. **Copilot UI** — `copilot.js` chat panel + Assistant nav + wiring + safe render.
4. **Integration & verification** — demo-mode drive, PII-leak check, polish.

## 13. Open items

- **Seeded facts:** owner will provide real starter facts over time; v1 scaffolds
  placeholder `fact` docs + the facts editor.
- **Model provider:** default Workers AI Llama 3.3 70B; `callModel` seam allows
  swapping to Groq/Gemini later.
- **Cloudflare account:** owner creates a free Cloudflare account; Worker deploy
  needs `wrangler login` (owner action, noted in the plan).
