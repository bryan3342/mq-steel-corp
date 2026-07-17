# MQ Steel Assistant Worker

A Cloudflare Worker that provides an authenticated chat endpoint proxying to
Workers AI (Llama 3.3 70B), grounded on admin-supplied context.

## `POST /chat`

**Request** — headers:
- `Authorization: Bearer <Firebase ID token>` (required)
- `X-Firebase-AppCheck: <App Check token>` (required)
- `content-type: application/json`

Body:
```json
{ "question": "string", "context": { "...": "..." }, "mode": "analyze (optional)" }
```

`mode` is optional; omit it for a normal Q&A answer, or set it to `"analyze"` to
have the model propose business patterns/insights from `context` as a JSON array
instead.

**Response**
- `200` — `{ "text": "..." }`
- `401` — missing/invalid ID token or App Check token
- `403` — origin not allowed, email not verified, or caller not in the `admins`
  Firestore allowlist
- `429` — per-admin rate limit exceeded (30 requests / 5 minutes)
- `500` — unexpected server/model error

## Implemented

- **Auth** (`src/verify.js`): the Firebase ID token and App Check token are both
  signature-verified against Google's JWKS (RS256 pinned explicitly), then the
  caller's email is checked against the `admins` Firestore collection using the
  caller's own tokens (no service account needed).
- **Rate limiting** (`src/index.js`): per-admin KV-backed limiter, 30 requests per
  5-minute window, keyed by verified email. Fails open (skips limiting, logs) if
  the KV binding errors, so a KV outage never locks out an already-authenticated
  admin.
- **Grounded prompt** (`src/prompt.js`): the system prompt frames all context as
  data, not instructions, to resist prompt injection from submission text, and
  builds either the default Q&A message or the `analyze` mode message.
- **CORS**: only origins listed in `ALLOWED_ORIGINS` get a non-403 preflight/response.

## Development

### Prerequisites
- Node.js (16+)
- Cloudflare Wrangler CLI
- A Cloudflare account with Workers and Workers AI enabled

### Local Setup

```bash
cd worker
npm install
```

### Testing

```bash
node --test ../test/redact.test.mjs ../test/prompt.test.mjs
```

An unauthenticated request (no `Authorization`/`X-Firebase-AppCheck` headers)
correctly returns **401 by design** — there is no unauthenticated smoke-test path.

```bash
npm run dev   # starts a dev server at http://localhost:8787
npm run deploy
```

## Configuration

- **ALLOWED_ORIGINS** (env var): comma-separated list of allowed CORS origins
- **FIREBASE_PROJECT_ID** (env var): project ID used for ID-token/App-Check
  audience/issuer checks and the `admins` allowlist lookup
- **AI binding**: Workers AI service (Llama 3.3 70B instruct)
- **RATE binding**: KV namespace for per-admin rate limiting

## Owner setup / deploy

For the full owner setup checklist (KV namespace creation, deploy, wiring the
frontend `WORKER_URL`, Firestore rules deploy, App Check domain registration)
see **`admin/README-assistant.md`** — that document is the authoritative
setup/deploy guide for this project.
