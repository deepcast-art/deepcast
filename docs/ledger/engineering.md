# Ledger — Engineering: stack, git workflow, testing, environment, notes

> Moved verbatim out of CLAUDE.md on 2026-09-16 (the split). Tech stack, the tiered push policy, testing and CI details, code style, environment, auth, important notes, known limitations, password reset. Read when setting up, running gates, or touching CI/auth/config. Read by grep + the section you need, never whole.

## Tech stack

- **Frontend:** React 19 + Vite 7, Tailwind CSS 4, React Router 7
- **Backend:** Express 5 (`server/index.js`), Supabase (auth + Postgres), Mux (video), Resend (email)
- **Deployment:** Vercel (frontend) + Render (API at `deepcast-virginia.onrender.com` — the Virginia service, live since 2026-07-23; `vercel.json` rewrites `/api/*` to it). The old Oregon service (`deepcast.onrender.com`) is **SUSPENDED** (founder-executed 2026-08-06 after a read-only audit confirmed nothing points at it; verified answering 503 — config preserved, resumable in the Render dashboard for a rollback only).

## Git & deploy workflow

- **Push policy is TIERED — read `docs/SHIP-PROTOCOL.md` (founder decision 2026-09-03; supersedes "commit only, never push" wherever it still appears in this file).** Tier 1 (docs, tests, tooling, creator/admin-only surfaces and routes): commit on `main` and PUSH after green gates. Tier 2 (anything a real viewer touches, the shared `src/lib` rules, the claim/link/create-link routes, deletion/protection modules, founder copy): build on a branch, run the red-team review subagent from the protocol's checklist, full e2e on all three engines, push the branch, open a PR — the founder merges only after the independent verifier (Claude in Cowork) has walked the Vercel preview and run the production invariants. Tier 3 (migrations, data scripts, film-row edits, env/auth config): founder executes, always, after a backup. Production auto-deploys from `main` (Vercel frontend, Render API). **GitHub CI** (`.github/workflows/ci.yml`, since 2026-09-03: lint, unit, build, e2e on chromium/webkit/firefox) runs on every push and PR; `main` is deliberately NOT branch-protected (that would block Tier 1 pushes) — a red CI run on `main` is automatically the next task: fix or revert, never ignore.
- One commit per phase/feature, with a plain-English commit message.
- The owner is **non-technical**: final reports, commit summaries, and anything they will read must be plain English, not jargon.

## Testing

- **Unit tests:** `*.test.js` colocated with modules, uses Vitest. Run with `npm run test:unit`.
- **E2E tests:** `e2e/*.spec.js`, uses Playwright on **all three browser engines** — chromium, webkit (Safari), firefox. Run with `npm run test:e2e`.
  - **Every commit that touches user-facing flows must have a green e2e run on all three engines** (or on every engine that can be installed, with the gap named in the final report).
  - **Playwright's browser installer hangs on this machine** (downloads reach 100%, then its extractor stalls at ~15 MB — do NOT keep retrying `npx playwright install`). Manual install works instantly: download the build zip with `curl` from `https://cdn.playwright.dev` (paths/revisions in `node_modules/playwright-core/browsers.json` + `lib/server/registry/index.js`), `unzip` it into `~/Library/Caches/ms-playwright/<browser>-<revision>/`, then `touch INSTALLATION_COMPLETE` in that directory. Also beware: a partial `npx playwright install` run may garbage-collect existing browser builds it thinks are stale.
  - `npx playwright test --config playwright.local.config.js` (local-only file, not committed) is the fallback that launches full Chromium instead of headless-shell.
  - **THE SHARED HARNESS (2026-09-03): every spec imports `test`/`expect` (and `pushJsError`) from `e2e/fixtures/test.js`, never from `@playwright/test` directly.** It (1) answers every Mux Data analytics beacon (hosts under `litix.io` — measured on webkit as plain POST fetches, interceptable) with an empty 204 that carries CORS headers — on the GitHub runner WebKit failed the beacon "due to access control checks" in CI run #1 (the runner's network blocks the host) AND in run #2 (a fulfilled cross-origin reply WITHOUT `Access-Control-Allow-Origin` fails the same check — the root cause); (2) provides `pushJsError`, the one page-error collector every spec uses, which drops ONLY errors naming a Mux Data host (the backstop for keepalive/sendBeacon traffic Playwright cannot always intercept in WebKit) — nothing of ours is ever filtered; (3) pins `reducedMotion: 'no-preference'` on every engine (the reduced-motion tests set `'reduce'` themselves at page level). `e2e/environment.spec.js` is a permanent one-test-per-engine probe that logs each engine's NATIVE media values (emulation off) into every run's log; CI's reporter includes `line` so the probe is readable there. **Runner truth from run #3: WebKit on the GitHub runner reports `prefersReducedMotion: false`** — so the reduced-motion hypothesis for run #2's resume-spec timeout is NOT confirmed; that failure is filed under the flake investigation. A spec's own route for the same host registers later and wins, as before. **Never edit any file while a suite is running** — a mid-run edit of the harness produced three chromium page-reload failures on 2026-09-03 that vanished on a clean rerun.
  - **CI (`.github/workflows/ci.yml`, 2026-09-03):** node 22; `node_modules` and the Playwright browsers cached by lockfile hash; the e2e jobs run with PLACEHOLDER env values only (the suite mocks all API/Supabase traffic in the browser; the API merely has to boot, verified locally with every `.env` name overridden) — no repository secret exists or is needed; failed e2e jobs upload `playwright-report-<engine>`. The old `test.yml` (chromium only, no env) was retired with it; `keepalive.yml` was re-pointed from the SUSPENDED Oregon URL to `deepcast-virginia.onrender.com` (it had failed every ten minutes since 2026-08-06). Repo-wide `npm run lint` is a CI gate and reads 0 errors (the Playwright configs got Node globals, underscore-prefixed parameters are exempt like underscore variables, and the hot-reload export rule is a warning). Runs are public-readable through the GitHub API (`/repos/deepcast-art/deepcast/actions/runs`); job LOGS need a signed-in browser. Runs so far: #1 (`5dc8860`, two webkit findings), #2 (`33710598946`, the same beacon message + a resume timeout), #3 (`33711774502`, all four jobs green, webkit `77 passed`).
- Build includes unit tests: `npm run build` runs `vitest run && vite build`.
- Local dev: Vite on port **3000**, Express API on port **3001** (Vite proxies `/api/*` to 3001). `npm run dev` starts both.
- **Fresh manual-test links:** `node server/reset-test-data.js` (dry-run BY DEFAULT since 2026-07-17; `--execute` + typed phrase to write) deletes ONLY the allowlisted test emails' data and mints five fresh, unopened filmmaker invites — one per allowlisted email. **Its delete-set is collected by those emails across ALL films** (not film-scoped), which is why the five test emails must never touch Circles or A Sacred Pause — and since 2026-08-06 it hard-aborts if any collected row belongs to a protected film (`PROTECTED_FILM_IDS`). These are the five standard scenarios used to manually walk the invite → watch → pass-it-on → dashboard journey from five separate identities (including the already-signed-in relink case and the R5 no-relink case).
- **Email rendering:** `node server/preview-email.js` writes `server/email-preview.html` to inspect the invite email without sending anything.
- **Playback measurement (2026-09-15):** `node scripts/measure-playback.mjs` (headed system Chrome, DPR 2 by default) opens the real watch page against a LOCAL server with the link route mocked to the live public playback id — never claims, never mints; `--url` accepts ONLY a film-mode page — and prints stall events with buffer-ahead, level switches, dropped frames and long tasks per run, classified A/B/C. **Measure against the BUILT bundle (`npx vite build`, then `vite preview` on 4173 — the `deepcast-dist` launch entry), not the Vite dev server: Vite full-reloads the page on ANY file change under the repo root, including `docs/` and `scripts/`, which lost two runs on 2026-09-15.** `--burst hi,lo,seconds` alternates a CDP throttle (a constant throttle never starves a rendition); Playwright's default DPR 1 holds the 744px player at 720p, so DPR 2 is the founder's machine.
- **Read-only database inspection:** ALL read-only inspection (checking, comparing, verifying data) must go through `node server/db-read.js "select ..."` — never the Supabase MCP connection — so the owner is only ever prompted for genuine database WRITES. The script rejects anything that isn't a single SELECT / WITH...SELECT at the code level (tested in `server/db-read.test.js`), and the backing `db_read` Postgres function runs in a READ ONLY transaction as a second layer.
- Setup for new clone: `npm install && npx playwright install chromium webkit firefox` (on this machine, use the manual curl+unzip install above instead).

## Code style

- ESLint flat config with React Hooks + React Refresh plugins.
- `no-unused-vars` errors, but vars starting with uppercase or `_` are ignored (`varsIgnorePattern: '^[A-Z_]'`).
- JSX files use `.jsx` extension. ES modules throughout (`"type": "module"`).
- Tailwind CSS 4 with custom design tokens in `src/index.css` and `src/styles/deepcast-branding-tokens.css`.
- Component classes use `dc-*` prefix for project-specific utilities.

## Environment

- Local dev uses `.env` (never committed). See `.env.example` for all variables.
- Key services: Supabase (URL + service role key), Resend (email), Mux (video), invite context encryption (AES-256).
- `VITE_*` prefixed vars are exposed to the client bundle. Service keys stay server-side only.

## Auth & roles

- Supabase Auth with profiles table. Roles: `creator`, `team_member`, `viewer`.
- `creator` can upload films. Protected routes enforce role checks in `App.jsx`.
- Invite screening flow at `/i/:token` — public route, no auth required.

## Important notes

- `server/index.js` shares utility code from `src/lib/` (e.g., `httpsUrl.js`, `graphLayout.js`).
- **The brand serif renders at its native angle ONLY — synthetic italic is disabled by construction (owner decision 2026-07-21).** 'Garamond Premier Pro Italic' is a single already-italic cut registered in `src/fonts.css` under BOTH `font-style: normal` AND `font-style: italic` (same file), so `italic`/`font-style: italic` on any element resolves to the real face and the browser can never skew the glyphs a second time. Never remove the italic registration; the pre-fix double slant (≈30° effective instead of the honest −18°) was the "slant too aggressive" complaint. Comparison sheet that settled it: `docs/font-candidates/`.
- Supabase migrations are in `supabase/migrations/` — apply in order.
- Landing page is currently disabled (Login is the home page at `/`).
- **Link-preview card (Open Graph, shipped 2026-07-21):** the social meta tags live in ONE delimited block in `index.html` (`<!-- og-tags:start -->` … `<!-- og-tags:end -->`) — "You’ve been gifted a film." (og:title + twitter:title since 2026-09-09; was "You’ve been given a ticket") / "A film, passed to you by someone who thought of you." (unchanged) / absolute `https://deepcast.art/og-card.png` (the approved 1200×630 "Admit One" ticket image in `public/`). The block is written to be find-and-replaced per ticket link by a FUTURE (scoped, not approved) Vercel function, with this block as its untouched fallback — keep the markers intact. Unpicked candidates + editable sources: `docs/og-card-candidates/`.
- **The API server refuses to start on port 3000** (`server/apiPort.js`, unit-tested): port 3000 belongs to Vite, and a preview launcher once injected PORT=3000 into `npm run dev`, splitting localhost between two servers (the "Cannot GET /{slug}" incident, 2026-07-21). The refusal prints a plain-English explanation and exits.
- **The MVP version label has exactly two definitions:** the shared `MvpVersionLabel` component (`src/components/MvpVersionLabel.jsx` — used on the landing page, both dashboard views, and the network map) and the "© deepcast — MVP v1.0" email footer line (invite email HTML + plain text, sign-in email, and `server/preview-email.js`). When the version changes, update the component and the footers — nowhere else.
- A used/expired magic link is captured at boot (`src/lib/authLinkError.js`, called from `main.jsx` before any redirect strips the URL hash) and explained on the login page — never a silent bare login form.
- **One app-wide error boundary, by design (2026-07-31):** `ChunkErrorBoundary` wraps the router in `main.jsx` — the ONLY boundary, so there is one recovery rule for every lazily-loaded chunk (pages and the Mux player alike). Chunk failures self-heal with one reload; everything else gets the error screen. Do not add nested boundaries without a reason recorded here; see `src/lib/chunkReloadGuard.js` for the classification and loop guard.

## Known limitations (MVP) & deferred work

- **Safari private-browsing skip-to-post-film: likely resolved, needs re-testing — do NOT declare fixed.** The June 2026 iOS playback-denial fix (a denied autoplay attempt fires play→pause with zero progress; that phantom pause must never read as a user pause — see `e2e/ios-denied-autoplay.spec.js`) almost certainly covers this same family. Re-test on a real device in private browsing before closing.
- ~~**`NetworkMap.jsx` has 5 React Compiler lint errors hidden behind its declaration-order error.**~~ RESOLVED 2026-09-03 by deletion: the Network map page, its `/network` route, and its sidebar link were removed when the creator dashboard's per-film "See network graph" modal (the VIEWER constellation) replaced it. `NetworkGraph.jsx` and `graphLayout.js` stay — the legacy `/i/:token` screening surfaces, the Profile page's film previews, the team-member "Network impact" block, and `server/index.js` still import them.
- **Invite expiry** is deliberately disabled (see Standing product rules); reintroducing it post-MVP is a one-function decision in `server/inviteValidation.js`.


## Auth — password reset

- `resetPassword(email)` in `src/lib/auth.jsx` resolves the `redirectTo` URL in priority order:
  1. Caller-supplied `redirectTo` argument
  2. `VITE_PASSWORD_RESET_REDIRECT_URL` env var (set this in Vercel for production)
  3. `window.location.origin + /reset-password` (local dev fallback)
- The production URL must also be added to **Supabase → Auth → URL Configuration → Redirect URLs** or Supabase will reject it.
