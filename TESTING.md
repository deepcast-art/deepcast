# Testing

Run these checks before merging to `main` / deploying (staging or production).

## What runs

| Command | What it does |
|--------|----------------|
| `npm run test:unit` | **Vitest** — fast unit tests (graph layout helpers, pure logic). No browser, no API server. |
| `npm run test:e2e` | **Playwright** — smoke tests: `/api/health`, public pages load (landing, login, signup, reset password, unsubscribe). Starts `npm run dev` automatically unless you opt out (see below). |
| `npm test` | Unit tests, then E2E (full suite). |
| `npm run test:deploy` | Production **build** (`vite build`), then unit tests, then E2E. Use before a release to ensure the bundle builds and smoke tests pass. |

Interactive debugging: `npm run test:e2e:ui` (Playwright UI).

## One-time setup (new clone)

```bash
npm install
npx playwright install chromium
```

Installs the Chromium browser Playwright uses. CI workflows run `npx playwright install --with-deps chromium` so agents have system libraries.

## Local E2E against an already-running dev server

If `npm run dev` is already running in another terminal:

```bash
PLAYWRIGHT_NO_WEBSERVER=1 npm run test:e2e
```

Uses `PLAYWRIGHT_BASE_URL` if set (default `http://localhost:3000`).

## Pointing at a deployed URL

Smoke-test staging or production (no local server):

```bash
PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=https://your-app.example.com npm run test:e2e
```

The app must expose `GET /api/health` (same origin as the frontend, or configure CORS for API-only hosts). Vercel rewrites `/api` to Render in production.

## CI

GitHub Actions runs on push and pull requests to `main` and `staging`: install deps, install Playwright Chromium, `npm run build`, `npm run test:unit`, `npm run test:e2e` (with `CI` set so the dev server is started once).

## Adding tests

- **Unit:** add `*.test.js` next to the module or under `tests/unit/`, import from `vitest`.
- **E2E:** add `*.spec.js` under `e2e/`. Prefer stable selectors (`getByRole`, `getByLabel`). Avoid testing third-party UIs (Mux, Supabase auth flows) unless you use dedicated test accounts and fixtures.

## API health

`GET /api/health` returns `{ ok: true, service: "deepcast-api", timestamp: "..." }` for load balancers and deploy verification. It does not check the database or Mux.
