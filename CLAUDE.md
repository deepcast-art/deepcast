# CLAUDE.md

## Project overview

Deepcast is an invite-based social network for sharing films through word of mouth. Users receive screening invites, watch films, and pass invitations along to others, forming a network graph.

## ⚠️ PRODUCTION HAS REAL USERS (June 2026)

**The database is no longer disposable.** Trace Bell (`contact@tracebelll.com`) is a real user — he must NEVER be deleted or modified destructively by any cleanup, reset, or migration, in any table. The filmmaker account (`filmmaker@gmail.com`) was always protected; Trace now is too.

- `server/reset-test-data.js` enforces this in code: real users live in its `PROTECTED_EMAILS` list and the script refuses to run if its allowlist ever includes one. **Every future data script must follow the same pattern** — explicit allowlists only (never pattern matches), real users in a hard-refusal guard, dry-run by default.
- Before ANY production deletion: SELECT and show the owner the exact rows first. No exceptions.
- The 50 seeded demo graph nodes (invites with `recipient_email LIKE '%@demo.invalid'`) are intentional and stay.

## Platform principles (use these when writing any user-facing copy or making product decisions)

- Deepcast is private, human-to-human film sharing. No algorithms, no feed, no AI curation. Films travel person to person, by invitation only — "the modern-day version of storytelling around the fire."
- The core idea: going from broadcasting to deepcasting. Millions of views mean nothing without resonance. We optimize for humanity and substance, never for attention, virality, extraction, polarization, or spectacle.
- Origin: the founder (Ien Chi) is a lifelong filmmaker; at Jubilee he helped grow a YouTube channel to 5M subscribers / 1B+ views and watched platform incentives push everything toward clickbait. Deepcast is the counter-bet — preserving real human curation and connection in the age of AI slop.
- Deepcast is NOT: a gatekeeper, a content factory, a quantity play, or an attention business.
- It's for people who live for higher ideals — artists, creators, mission-driven people — and for filmmakers making bold, substantive work that might not survive gatekeepers: "ideas like mustard seeds" that grow once championed.
- The network graph exists so people FEEL their impact: connected to everyone who led a film to them, and everyone who'll receive it because of them. A movement, not a passive audience.
- A share is a gift — chosen for one specific person (their values, their time of life), not broadcast to everyone.
- Long-term vision: the home for substantive filmmakers and audiences; a place where great IP is born.
- This is an early MVP built by Ien. We actively want filmmakers, collaborators, advisors, investors, engineers with taste, designers, curators, and community builders to reach out: ien.chi96@gmail.com.

## Voice and copy rules

- All user-facing copy is written in Ien's founder voice: personal, heartfelt, direct, human. Never corporate, never marketing-speak.
- It speaks to the heart, not the mind — but stays simple, crystal clear, and concise. Short sharp answers over long explanations.
- Copy approved by Ien is verbatim-only. Never rewrite, expand, or "improve" approved copy without his explicit approval. The current text in src/pages/About.jsx is founder-approved canonical copy.

## Tech stack

- **Frontend:** React 19 + Vite 7, Tailwind CSS 4, React Router 7
- **Backend:** Express 5 (`server/index.js`), Supabase (auth + Postgres), Mux (video), Resend (email)
- **Deployment:** Vercel (frontend) + Render (API at `deepcast.onrender.com`). `vercel.json` rewrites `/api/*` to Render.

## Project structure

```
deepcast/
├── server/index.js          # Express API (Mux, Resend, Supabase service-role)
├── src/
│   ├── App.jsx              # Routes + auth guards
│   ├── pages/               # Page components (Dashboard, InviteScreening, Login, etc.)
│   ├── pages/screening/     # Desktop/Mobile screening sub-views
│   ├── components/          # Shared components (DeepcastLogo, FilmForm, NetworkGraph, etc.)
│   ├── lib/                 # Utilities (api.js, auth.jsx, supabase.js, graphLayout.js, etc.)
│   ├── styles/              # Branding tokens CSS
│   ├── index.css            # Design tokens + .dc-* utilities
│   └── fonts.css            # Font-face declarations
├── public/                  # Static assets (logo, fonts, vite.svg)
├── e2e/                     # Playwright smoke tests
├── supabase/migrations/     # SQL migrations
├── scripts/                 # Utility scripts (DNS check, DB reset)
└── docs/                    # Internal docs (invite flow, staging deploy)
```

## Key commands

```bash
npm run dev              # Start Express API + Vite dev server
npm run dev:client       # Vite only (no API)
npm run dev:server       # Express only
npm run build            # Run unit tests + Vite build
npm run lint             # ESLint
npm run test:unit        # Vitest (fast, no browser)
npm run test:e2e         # Playwright smoke tests (starts dev server automatically)
npm test                 # Unit + E2E
```

## Git & deploy workflow

- **Work directly on `main`. COMMIT ONLY — never push.** The owner pushes manually; production auto-deploys from `main` (Vercel frontend, Render API).
- One commit per phase/feature, with a plain-English commit message.
- The owner is **non-technical**: final reports, commit summaries, and anything they will read must be plain English, not jargon.

## Testing

- **Unit tests:** `*.test.js` colocated with modules, uses Vitest. Run with `npm run test:unit`.
- **E2E tests:** `e2e/*.spec.js`, uses Playwright on **all three browser engines** — chromium, webkit (Safari), firefox. Run with `npm run test:e2e`.
  - **Every commit that touches user-facing flows must have a green e2e run on all three engines** (or on every engine that can be installed, with the gap named in the final report).
  - **Playwright's browser installer hangs on this machine** (downloads reach 100%, then its extractor stalls at ~15 MB — do NOT keep retrying `npx playwright install`). Manual install works instantly: download the build zip with `curl` from `https://cdn.playwright.dev` (paths/revisions in `node_modules/playwright-core/browsers.json` + `lib/server/registry/index.js`), `unzip` it into `~/Library/Caches/ms-playwright/<browser>-<revision>/`, then `touch INSTALLATION_COMPLETE` in that directory. Also beware: a partial `npx playwright install` run may garbage-collect existing browser builds it thinks are stale.
  - `npx playwright test --config playwright.local.config.js` (local-only file, not committed) is the fallback that launches full Chromium instead of headless-shell.
- Build includes unit tests: `npm run build` runs `vitest run && vite build`.
- Local dev: Vite on port **3000**, Express API on port **3001** (Vite proxies `/api/*` to 3001). `npm run dev` starts both.
- **Fresh manual-test links:** `node server/reset-test-data.js` (dry-run first with `--dry-run`) deletes ONLY the allowlisted test emails' data and mints five fresh, unopened filmmaker invites — one per allowlisted email. These are the five standard scenarios used to manually walk the invite → watch → pass-it-on → dashboard journey from five separate identities (including the already-signed-in relink case and the R5 no-relink case).
- **Email rendering:** `node server/preview-email.js` writes `server/email-preview.html` to inspect the invite email without sending anything.
- **Read-only database inspection:** ALL read-only inspection (checking, comparing, verifying data) must go through `node server/db-read.js "select ..."` — never the Supabase MCP connection — so the owner is only ever prompted for genuine database WRITES. The script rejects anything that isn't a single SELECT / WITH...SELECT at the code level (tested in `server/db-read.test.js`), and the backing `db_read` Postgres function runs in a READ ONLY transaction as a second layer.
- Setup for new clone: `npm install && npx playwright install chromium webkit firefox` (on this machine, use the manual curl+unzip install above instead).

## Standing doctrine (every session)

- **Plan before editing.** Read the relevant files and write a short plan (files per phase, order, risks) before changing anything.
- **Diagnose root cause before fixing.** Never patch a symptom; explain the cause, then fix it at the source.
- **One commit per phase.** After each phase run unit tests, `npm run build`, and the e2e suite, and fix any regression *before* committing.
- **Never trust comments over code.** Verify behaviour in the code itself; comments may be stale.
- The screening page mounts desktop AND mobile sub-views simultaneously (src/pages/screening/DesktopPassItOn.jsx, MobilePassItOn.jsx) with unused variants hidden — the same copy can exist in 3+ styled variants at once. When matching or measuring styles, always identify the variant actually visible at the target viewport by rendering the live app, never by searching the code alone.
- **Destructive-data rule:** any script that writes to or deletes production data must default to dry-run and require an owner-run `--execute` (with typed confirmation) — never execute such an operation yourself. (`server/reset-test-data.js` is the scoped, allowlisted exception used for test links; still dry-run it first.)
- **Prefer single simple commands** over compound shell chains (`;`, `&&`, `|`) when feasible, so permission prompts stay rare.
- **Prefer allowlisted read-only routes over approval-prompting tools.** For any read-only action use what's already allowed: `node server/db-read.js` for database reads, `grep`/`cat`/`git diff` for code, `npx eslint` for lint, and the allowlisted read-only MCP tools (Supabase/Vercel `list_*`/`get_*`/`search_docs` in `.claude/settings.local.json`) for infra inspection. Never reach for a tool that can write when a read-only route answers the question.
- **Pre-existing lint never blocks work.** Verify a lint issue pre-dates your changes (e.g. lint the file at HEAD), report it in the final summary, and move on — fix it only if asked.
- **All browser storage access goes through `src/lib/safeStorage.js`** (`safeLocalStorage` / `safeSessionStorage`) — never raw `localStorage`/`sessionStorage` calls, never at module scope, in render, or mid-handler. Safari can block storage entirely (SecurityError on access) or fail every write (private-mode QuotaExceededError); the helper feature-detects per call and falls back to in-memory state for the visit, so a storage failure can never crash a screen or change what the user sees.
- **New code that touches storage must include a restricted-storage test:** unit coverage against the missing / access-throws / write-throws modes (see `src/lib/safeStorage.test.js`) and, for user-visible flows, an e2e case in `e2e/storage-restricted.spec.js` (which runs both Safari restriction modes on all three engines).

## Security doctrine — privileged endpoints

- **The verified-session pattern is REQUIRED for every privileged endpoint:** read the `Authorization: Bearer` token, verify it cryptographically with `supabase.auth.getUser(jwt)`, and take the caller's identity ONLY from the verified token. **Never trust a client-sent user/creator ID** — that was the old `/api/team/remove-member` hole, closed June 2026. Reference implementations: `/api/invites/relink`, `/api/team/remove-member`, and the `/api/admin/*` endpoints.
- Authorization decisions live in small unit-tested modules (`server/adminAuth.js`, `server/teamRules.js`) so every rejection path has a test.
- **Owner-only admin endpoints** (`/api/admin/unlimited-shares` + `/status`) are pinned to the `ADMIN_USER_ID` env var — an exact user-ID match against Ien's account, NOT a role check (a hypothetical second creator must be rejected; role is belt-and-suspenders only). They **fail closed**: when `ADMIN_USER_ID` is unset, everyone gets 503, including a valid creator session. The variable must be set in Render's environment and local `.env`.

## Email-sending doctrine

- **Every outgoing email goes through the one dispatcher** (`deliverEmail` in `server/index.js`, built on `server/emailDelivery.js`): sends are strictly sequential and throttled below Resend's rate limit, and each send is automatically retried with backoff before giving up. Never call Resend directly from a route.
- **Acceptance is verified, per recipient.** The dispatcher resolves only once Resend confirmed it accepted the email. `/api/invites/send` awaits this before answering; on permanent failure it rolls back the invite row and the allocation and returns an error, so a retry starts clean (not blocked by the duplicate-invite check).
- **The UI never claims success for a recipient whose email was not confirmed accepted.** Multi-recipient sends report per-recipient truth: failures are shown clearly and the failed recipients stay in the form for retry (`handleSendLetter` in `InviteScreening.jsx`, `InviteForm.jsx`). `server/emailDelivery.test.js` proves the throttling, the retry, and the honest-failure behaviour.
- The Resend API key is **send-only** — it cannot read send history, so past sends can't be audited through the API. Acceptance must be captured at send time: the `emailId` in the `/api/invites/send` response and the `[email] Resend accepted` server log line.

## Standing product rules

- **`users.unlimited_shares` is the ONLY mechanism for per-user unlimited shares — and it is quota-only by design.** It removes the share cap (no allocation check, no decrement, every quota UI shows "unlimited" via `isUnlimitedSharer`) while changing NOTHING else: same viewer role, same dashboard, same ViewerShareGate, and the user's sent invites still record `parent_invite_id`. **NEVER use `team_creator_id` to grant quota** — team linkage suppresses parent-link recording on sends (part of the phantom-node fix), which silently breaks the word-of-mouth chain, reach stats, and the graph for that user. Grant/revoke happens through the owner-only admin toggle on the creator dashboard's invite chain (revoke = back to the standard allocation).
- **Invites to the film creator's email are refused server-side — by design; don't "fix" it.** The rule lives in `server/shareRules.js` and runs in `/api/invites/send` before anything is written or emailed. The message is predicate-style because both share forms render failures as "<first name> <reason>".
- **Invite links do not expire in the MVP.** The server never rejects a film invite on `expires_at` — the single gate for invite usability is `isInviteUsable` in `server/inviteValidation.js` (unit-tested with past-dated rows) — and the frontend has no "expired" state, copy, or 410 handling anywhere. The `invites.expires_at` column is retained and still written (far-future, default 3650 days via `INVITE_EXPIRY_DAYS`) so expiration can be reintroduced post-MVP; reintroducing it is a deliberate product decision to be made in that one function, updating its tests and `e2e/invite-never-expires.spec.js`. (Team-invite links — teammate account creation — are a separate feature and still expire after 14 days; Supabase magic sign-in links also expire shortly. Both are auth links, not invite links.)
- **Personal notes are MANDATORY and never hidden.** Wherever sharing happens — the share prompt, the dashboard invite form, any future surface — every recipient shows a visible personal-note field by default, for normal and unlimited users alike, and a send is refused (with a gentle inline message) if any recipient's note is empty or whitespace-only. Never label the note "optional", and never collapse it behind a link, icon, or toggle; the note is the gift, not the link.
- **Every recipient is an identical letter block.** On the share prompt, each recipient renders as the same full letter — "Dear [First Name]," + the note-writing area + "Deliver To [email]" — with a subtle brand divider between consecutive letters. No compact/abbreviated rows for added recipients.
- **User-facing naming is first-name-only, and labeled as such wherever it appears.** Users edit only their first name; every label, placeholder, and helper around it must say "first name" explicitly (dashboard: "Edit your first name" → a "First name" field with the helper "This is how your name appears on the network."). Saving propagates to the profile, sent-invite sender labels, and received-invite recipient labels (graph nodes) — see `handleSaveName` in `Dashboard.jsx`.
- **The share prompt shows ONE static invitations line** — "You have N invitations" (or "You have unlimited invitations"), where N comes from `invitationsRemaining(profile)` in `src/lib/shares.js`. It sits beneath the letter block(s), above the share button, and never live-subtracts as recipient rows are added. The cap still applies: the form never allows more recipient letters than the remaining allocation.

## About page (added June 2026)

- Route: /about, content in src/pages/About.jsx. FAQ format.
- Requires login, but is DELIBERATELY not wrapped in ViewerShareGate — any signed-in user can view it regardless of role or share status. Do not add it to the gate.
- Dashboard entry points: viewer sidebar (button directly above the name-edit button) and filmmaker/team sidebar (link above Sign out). Keep both when modifying sidebars.
- Contact email on the page (ien.chi96@gmail.com) is a mailto link and must stay one.

## Canonical displayed stats — one shared computation per stat

**Standing rule:** every number displayed anywhere in the app must have exactly ONE shared, unit-tested computation in `src/lib/` used by every surface that shows it. Never write an inline calculation in a page component; two paths for one stat is exactly the class of bug these modules exist to prevent.

- **Reach** (`src/lib/reach.js`): a user's reach = the number of people in their downstream branch who have **OPENED** their invite (status `opened` / `watched` / `signed_up`) — *not* merely received one. Use `computeUserReach`, `reachBelowInvite`, `isInviteOpened`. Shown as "People you've reached" / per-invitee "People they've reached" on the dashboard.
- **Invitations remaining** (`src/lib/shares.js`): the server-enforced `users.invite_allocation` (decremented by one on every successful send), never below zero; **Infinity** for unlimited sharers. `isUnlimitedSharer(profile)` = creator, team member, team-linked viewer, or `unlimited_shares === true` — the exact rule `/api/invites/send` enforces. Use `invitationsRemaining(profile)` everywhere ("Shares left" on the dashboard, the share-prompt label, the Profile invites stat, `InviteForm`'s `maxInvites` prop). Never hardcode a cap (the old `min(5, allocation)` bug). `InviteForm` freezes the quota at mount and subtracts its own session sends, so a parent refetching the profile can't double-count.
- **Per-film invite stats** (`src/lib/filmStats.js`): `computeFilmStats(invites)` → `sent` (all invites), `opened` (`opened`/`watched`/`signed_up` — shares the status list with reach), `watched` (`watched`/`signed_up`), `signedUp` (`signed_up`). Statuses are cumulative. Used by the creator dashboard's Invited/Opened/Watched/Signed-up panel and the network map's "N watched".
- **Shares used** (dashboard) = the viewer's sent-invite rows for the selected film (list length — counts the same rows the sent-list shows). **Films / N invites / Show more (N remaining)** are plain lengths of the displayed lists themselves.

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
- Supabase migrations are in `supabase/migrations/` — apply in order.
- Landing page is currently disabled (Login is the home page at `/`).
- **The MVP version label has exactly two definitions:** the shared `MvpVersionLabel` component (`src/components/MvpVersionLabel.jsx` — used on the landing page, both dashboard views, and the network map) and the "© deepcast — MVP v1.0" email footer line (invite email HTML + plain text, sign-in email, and `server/preview-email.js`). When the version changes, update the component and the footers — nowhere else.
- A used/expired magic link is captured at boot (`src/lib/authLinkError.js`, called from `main.jsx` before any redirect strips the URL hash) and explained on the login page — never a silent bare login form.

## Known limitations (MVP) & deferred work

- **Safari private-browsing skip-to-post-film: likely resolved, needs re-testing — do NOT declare fixed.** The June 2026 iOS playback-denial fix (a denied autoplay attempt fires play→pause with zero progress; that phantom pause must never read as a user pause — see `e2e/ios-denied-autoplay.spec.js`) almost certainly covers this same family. Re-test on a real device in private browsing before closing.
- **`NetworkMap.jsx` has 5 React Compiler lint errors hidden behind its declaration-order error.** Fixing the visible "Cannot access variable before it is declared" un-bails the compiler and surfaces setState-in-effect and memoization issues that require restructuring the component's effects. This needs its own task with testing — it is NOT a lint-only fix; do not paper over it with suppressions.
- **Render region migration** (API is far from the Seoul-based owner and the us-east-1 DB) — runbook in `docs/render-migration-runbook.md`; awaiting an owner decision.
- **Invite expiry** is deliberately disabled (see Standing product rules); reintroducing it post-MVP is a one-function decision in `server/inviteValidation.js`.

## Dashboard behaviour (viewer role)

### Resume & return flow
- The "Resume / Watch again" button on each film card uses React Router `navigate()` — not `window.location.href` — so the SPA stays alive and auth state is preserved.
- When a logged-in viewer pauses the screening (`?play=1` flow), `InviteScreening` saves the playback position to `localStorage` under the key `screening_position_<token>` and navigates to `/dashboard` with `location.state.screeningToken = token`.
- **Resume-position rules live in `src/lib/resumePosition.js`, with ONE completion-zone constant (`RESUME_COMPLETION_FRACTION`, final 5%) shared by both sides.** Every save goes through `resumePositionToSave` — inside the completion zone the stored position is ERASED, never updated — and on `canplay` a start position inside the zone self-heals to 0. **Never reintroduce a raw near-end save** (a stored position in the final seconds resumes BEHIND the opaque prologue, fires `ended` invisibly, and skips the viewer straight to pass-it-on — the June 2026 mobile skip bug, pinned by `e2e/resume-skip-regression.spec.js`).
- `loadViewerDashboard` reads `location.state.screeningToken` on mount and selects the matching film as the active film, so the same film the user clicked Resume on is highlighted when they return.
- `viewerInviteToken` is set to `tokenByFilmId[filmId]` (the token for the currently selected film), not always `uniqueRecvd[0]?.token`.

### Mobile sidebar (viewer)
- On mobile (`< lg`), the viewer dashboard has a collapsible sidebar toggled by a hamburger button in the top bar.
- Sidebar defaults to **open** on first visit (so sign-out and stats are always accessible). The open/closed state persists in `sessionStorage` under `dash_viewer_sidebar` and is restored when the user returns from a screening.
- On desktop (`lg:`), the sidebar is always visible as a left column.

### Mobile sidebar (creator / team_member)
- The creator/team_member sidebar open/closed state persists in `sessionStorage` under `dash_creator_sidebar` and is restored across navigation.

### Network graph (viewer)
- The "My network impact" graph feeds `buildGraphLayout` with **all** invites for the selected film (`viewerFilmInvites`), not just the viewer's ancestor/descendant chain. This matches the Network Map page and produces the full circular graph with the viewer's path highlighted in amber against a faded background.
- `viewerRecipientKey` and `viewerFocusInviteId` come from the shared `resolveViewerFocus` helper (graphLayout.js) — every graph surface uses the same resolution (email match → invite token → common parent of sent invites) so highlighting can never drift between pages.
- After a viewer sends an invite, the graph scrolls to centre the newly created node. `loadViewerDashboard` returns the newest sent invite ID; the Dashboard passes it as `focusNodeId` to `NetworkGraph`, which smoothly pans to that node.

### Canonical graph model (`buildGraphLayout` in `src/lib/graphLayout.js`)
- The filmmaker IS the central film node — there is never a separate filmmaker user node. Any invite **sent by** the film's creator (`creatorId`) attaches its recipient directly to the central node, regardless of the stored `parent_invite_id` (self-healing against historical bad parents).
- Team members (unlimited-share users) render as their own ring-1 nodes (`type: 'member'`); their invitees attach beneath them. Pass `teamMemberIds` where available; senders that can't be placed are derived structurally.
- Everyone else chains to whoever shared with them: `parent_invite_id` first, then an email-match repair (the invite through which the sender's email received the film).
- Server-side, `/api/invites/send` never records a `parent_invite_id` for unlimited senders (creator/team) — this is what permanently prevents the phantom-intermediate-node bug.
- `/api/invites/validate` returns `creatorId` + `teamMemberIds` for the screening surfaces; the dashboard/network-map/profile pass `films.creator_id` from their own queries (films are publicly readable; users rows are NOT readable cross-role under RLS — use `maybeSingle()` for creator-name lookups).
- The central node displays the filmmaker's name with "(filmmaker)" beneath it: `buildGraphLayout` sets `creatorLabel` on the root node (caller-supplied `creatorName`, falling back to the `sender_name` on a creator-sent invite when RLS hides the users row), and `FilmNode` renders it below the camera icon on every surface.

## Network graph component (`src/components/NetworkGraph.jsx`)

- `focusNodeId` prop: when changed to a new value, the graph smoothly scrolls to centre that node in the pan container. Uses a `lastFocusedNodeId` ref so it only fires once per new value.
- Scroll math: `scale = graphPx.w * zoom / vbW`; offset from viewBox centre `(vbW/2, viewBoxH/2)` converted to scroll pixels, added to the centred scroll position.

## Auth — password reset

- `resetPassword(email)` in `src/lib/auth.jsx` resolves the `redirectTo` URL in priority order:
  1. Caller-supplied `redirectTo` argument
  2. `VITE_PASSWORD_RESET_REDIRECT_URL` env var (set this in Vercel for production)
  3. `window.location.origin + /reset-password` (local dev fallback)
- The production URL must also be added to **Supabase → Auth → URL Configuration → Redirect URLs** or Supabase will reject it.
