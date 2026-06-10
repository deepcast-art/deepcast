# CLAUDE.md

## Project overview

Deepcast is an invite-based social network for sharing films through word of mouth. Users receive screening invites, watch films, and pass invitations along to others, forming a network graph.

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
- **E2E tests:** `e2e/*.spec.js`, uses Playwright (Chromium). Run with `npm run test:e2e`.
  - If the headless-shell download stalls on this machine, use the full-Chromium fallback: `npx playwright test --config playwright.local.config.js` (local-only file, not committed).
- Build includes unit tests: `npm run build` runs `vitest run && vite build`.
- Local dev: Vite on port **3000**, Express API on port **3001** (Vite proxies `/api/*` to 3001). `npm run dev` starts both.
- **Fresh manual-test links:** `node server/reset-test-data.js` (dry-run first with `--dry-run`) deletes ONLY the allowlisted test emails' data and mints five fresh, unopened filmmaker invites — one per allowlisted email. These are the five standard scenarios used to manually walk the invite → watch → pass-it-on → dashboard journey from five separate identities (including the already-signed-in relink case and the R5 no-relink case).
- **Email rendering:** `node server/preview-email.js` writes `server/email-preview.html` to inspect the invite email without sending anything.
- **Read-only database inspection:** ALL read-only inspection (checking, comparing, verifying data) must go through `node server/db-read.js "select ..."` — never the Supabase MCP connection — so the owner is only ever prompted for genuine database WRITES. The script rejects anything that isn't a single SELECT / WITH...SELECT at the code level (tested in `server/db-read.test.js`), and the backing `db_read` Postgres function runs in a READ ONLY transaction as a second layer.
- Setup for new clone: `npm install && npx playwright install chromium`.

## Standing doctrine (every session)

- **Plan before editing.** Read the relevant files and write a short plan (files per phase, order, risks) before changing anything.
- **Diagnose root cause before fixing.** Never patch a symptom; explain the cause, then fix it at the source.
- **One commit per phase.** After each phase run unit tests, `npm run build`, and the e2e suite, and fix any regression *before* committing.
- **Never trust comments over code.** Verify behaviour in the code itself; comments may be stale.
- **Destructive-data rule:** any script that writes to or deletes production data must default to dry-run and require an owner-run `--execute` (with typed confirmation) — never execute such an operation yourself. (`server/reset-test-data.js` is the scoped, allowlisted exception used for test links; still dry-run it first.)
- **Prefer single simple commands** over compound shell chains (`;`, `&&`, `|`) when feasible, so permission prompts stay rare.

## Email-sending doctrine

- **Every outgoing email goes through the one dispatcher** (`deliverEmail` in `server/index.js`, built on `server/emailDelivery.js`): sends are strictly sequential and throttled below Resend's rate limit, and each send is automatically retried with backoff before giving up. Never call Resend directly from a route.
- **Acceptance is verified, per recipient.** The dispatcher resolves only once Resend confirmed it accepted the email. `/api/invites/send` awaits this before answering; on permanent failure it rolls back the invite row and the allocation and returns an error, so a retry starts clean (not blocked by the duplicate-invite check).
- **The UI never claims success for a recipient whose email was not confirmed accepted.** Multi-recipient sends report per-recipient truth: failures are shown clearly and the failed recipients stay in the form for retry (`handleSendLetter` in `InviteScreening.jsx`, `InviteForm.jsx`). `server/emailDelivery.test.js` proves the throttling, the retry, and the honest-failure behaviour.
- The Resend API key is **send-only** — it cannot read send history, so past sends can't be audited through the API. Acceptance must be captured at send time: the `emailId` in the `/api/invites/send` response and the `[email] Resend accepted` server log line.

## Standing product rules

- **Personal notes are always visible.** Wherever sharing happens — the share prompt, the dashboard invite form, any future surface — every recipient row shows a visible, optional, clearly-labeled personal-note field by default, for normal and unlimited users alike. Never collapse the note behind a link, icon, or toggle; the note is core to the gifting experience.

## Canonical displayed stats — one shared computation per stat

**Standing rule:** every number displayed anywhere in the app must have exactly ONE shared, unit-tested computation in `src/lib/` used by every surface that shows it. Never write an inline calculation in a page component; two paths for one stat is exactly the class of bug these modules exist to prevent.

- **Reach** (`src/lib/reach.js`): a user's reach = the number of people in their downstream branch who have **OPENED** their invite (status `opened` / `watched` / `signed_up`) — *not* merely received one. Use `computeUserReach`, `reachBelowInvite`, `isInviteOpened`. Shown as "People you've reached" / per-invitee "People they've reached" on the dashboard.
- **Invitations remaining** (`src/lib/shares.js`): the server-enforced `users.invite_allocation` (decremented by one on every successful send), never below zero; **Infinity** for unlimited sharers. `isUnlimitedSharer(profile)` = creator, team member, or team-linked viewer — the exact rule `/api/invites/send` enforces. Use `invitationsRemaining(profile)` everywhere ("Shares left" on the dashboard, the share-prompt label, the Profile invites stat, `InviteForm`'s `maxInvites` prop). Never hardcode a cap (the old `min(5, allocation)` bug). `InviteForm` freezes the quota at mount and subtracts its own session sends, so a parent refetching the profile can't double-count.
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

## Dashboard behaviour (viewer role)

### Resume & return flow
- The "Resume / Watch again" button on each film card uses React Router `navigate()` — not `window.location.href` — so the SPA stays alive and auth state is preserved.
- When a logged-in viewer pauses the screening (`?play=1` flow), `InviteScreening` saves the playback position to `localStorage` under the key `screening_position_<token>` and navigates to `/dashboard` with `location.state.screeningToken = token`.
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
