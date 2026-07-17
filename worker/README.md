# MQ Steel Assistant Worker

A Cloudflare Worker that provides a chat endpoint proxying to Workers AI (Llama 3.3 70B).

## Features

- **CORS support** for frontend requests from allowed origins (mq-steel-admin.web.app, mq-steel-corp.firebaseapp.com)
- **POST /chat** endpoint accepting `{ question: string }` and returning `{ text: string }`
- **callModel** module for single-point model configuration (swappable AI backend)
- **Router & error handling** with OPTIONS preflight support
- **KV namespace** binding for rate-limiting (configured but not yet wired in Task 2)

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

### Owner Deploy Steps (Required before first deployment)

1. Create a KV namespace for rate-limiting:
   ```bash
   npx wrangler kv namespace create RATE
   ```

2. Copy the returned namespace ID into `wrangler.jsonc` at `kv_namespaces[0].id` (replacing `REPLACE_AFTER_KV_CREATE`)

3. Deploy to Cloudflare:
   ```bash
   npm run deploy
   ```

4. For local development/testing:
   ```bash
   npm run dev
   ```
   This starts a dev server at `http://localhost:8787`

### Testing

Test the `/chat` endpoint locally (after `npm run dev`):

```bash
curl -X POST http://localhost:8787/chat \
  -H 'Origin: https://mq-steel-admin.web.app' \
  -H 'content-type: application/json' \
  -d '{"question":"say hi in 3 words"}'
```

Expected response: `{"text":"..."}`

## Configuration

- **ALLOWED_ORIGINS** (env var): Comma-separated list of allowed CORS origins
- **FIREBASE_PROJECT_ID** (env var): Project ID for future auth integration
- **AI binding**: Workers AI service (Llama 3.3 70B instruct)
- **RATE binding**: KV namespace for rate-limiting (Tasks 3+)

## Roadmap

- **Task 2**: Auth verification + allowlist enforcement
- **Task 3**: Rate limiting via KV
- **Task 4**: Enhanced prompt routing and validation

See `.superpowers/sdd/` for full task specifications.
