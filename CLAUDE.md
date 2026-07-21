# CLAUDE.md

## Project overview

Deepcast optimizes for depth over reach. It is an invite-only network where substantive films spread person to person through trusted relationships — each viewer receives a ticket from someone who thought of them, watches, and passes the film onward — toward deep impact and resonance rather than raw numbers. Deepcasting, not broadcasting. Depth is the heart of the platform; everything else — the tickets, the constellation, invite-only — exists to serve it.

## ⚠️ PRODUCTION HAS REAL USERS (June 2026)

**The database is no longer disposable.** Trace Bell (`contact@tracebelll.com`) is a real user — he must NEVER be deleted or modified destructively by any cleanup, reset, or migration, in any table. The filmmaker account (`filmmaker@gmail.com`) was always protected; Trace now is too.

- `server/reset-test-data.js` enforces this in code: real users live in its `PROTECTED_EMAILS` list and the script refuses to run if its allowlist ever includes one. **Every future data script must follow the same pattern** — explicit allowlists only (never pattern matches), real users in a hard-refusal guard, dry-run by default.
- Before ANY production deletion: SELECT and show the owner the exact rows first. No exceptions.
- The 50 seeded demo graph nodes (invites with `recipient_email LIKE '%@demo.invalid'`) are intentional and stay.

## Films (two films, June 2026)

The app is multi-film. There are currently two films:

- **"The New Narrative"** (`80df945a-6fb7-416b-ad73-3fab4b9cadf8`) — the REAL film, with real users and the real share graph. Covered by the real-users rule above.
- **"A Sacred Pause"** (`7c42093d-d5eb-4a38-a9fa-d28ca41d7b0f`, mux playback `6GMWj01CjP01Y1ee001Vd2qYqUPJtEOgUYz00nG02BYE9F9E`) — **PUBLIC-FACING** (since 2026-07-21; formerly the demo film), owned by the filmmaker (`filmmaker@gmail.com`), directed by Jon Bregel. Still carries its seeded ghost invites (recipients `…@demo-deepcast.invalid`) — intentional graph texture on admin surfaces, excluded from every viewer surface and never ticket-numbered. Its `description` and `gif_start=616` / `gif_end=624` remain set for the legacy invite email.
  - **Distinct from** the 50 `…@demo.invalid` seeded graph nodes on The New Narrative (real-users section above) — different film, different email domain. Do not conflate the two demo sets.
  - **Teardown:** `node server/teardown-demo-film.js --id=7c42093d-d5eb-4a38-a9fa-d28ca41d7b0f` removes everything the demo created (its invites, watch_sessions, then the film row). Dry-run by default; `--execute` + typed confirmation to delete. Scoped to that one film id, and refuses to touch protected real-user emails.
- **Testing rule (owner decision 2026-07-20): ALL testing happens on "The New Narrative" — it is the designated test film. "A Sacred Pause" is public-facing: NEVER create test links, test claims, or any other test data on it.**

### A Sacred Pause demo stopgaps (tech debt — NOT general behaviour)

Three customizations are hardcoded behind `SACRED_PAUSE_FILM_ID === '7c42093d-…'` purely for the demo. Do NOT read them as general app behaviour:

- the custom pre-screening welcome message (`src/pages/InviteScreening.jsx`),
- the invite-email title + synopsis italics (`buildInviteEmailHtml`, `server/index.js`),
- the invite-email GIF at `fps=15` (`buildFilmGifUrl`, `server/index.js`).

These are per-film hardcodes pending the multi-film / editable-welcome work, where they become per-film editable fields (editable welcome copy, synopsis, GIF window + fps). When that lands, delete the `SACRED_PAUSE_FILM_ID` gates.

## Platform principles (use these when writing any user-facing copy or making product decisions)

- Deepcast is private, human-to-human film sharing. No algorithms, no feed, no AI curation. Films travel person to person, by invitation only — "the modern-day version of storytelling around the fire."
- The core idea: depth over reach — going from broadcasting to deepcasting. Millions of views mean nothing without resonance; what matters is substantive films reaching people through deep relationships and trust built person to person, spreading through trusted networks toward deep impact. We optimize for humanity and substance, never for attention, virality, extraction, polarization, or spectacle. Depth is the heart; tickets, the constellation, and invite-only all exist to serve it.
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
- **Fresh manual-test links:** `node server/reset-test-data.js` (dry-run BY DEFAULT since 2026-07-17; `--execute` + typed phrase to write) deletes ONLY the allowlisted test emails' data and mints five fresh, unopened filmmaker invites — one per allowlisted email. These are the five standard scenarios used to manually walk the invite → watch → pass-it-on → dashboard journey from five separate identities (including the already-signed-in relink case and the R5 no-relink case).
- **Email rendering:** `node server/preview-email.js` writes `server/email-preview.html` to inspect the invite email without sending anything.
- **Read-only database inspection:** ALL read-only inspection (checking, comparing, verifying data) must go through `node server/db-read.js "select ..."` — never the Supabase MCP connection — so the owner is only ever prompted for genuine database WRITES. The script rejects anything that isn't a single SELECT / WITH...SELECT at the code level (tested in `server/db-read.test.js`), and the backing `db_read` Postgres function runs in a READ ONLY transaction as a second layer.
- Setup for new clone: `npm install && npx playwright install chromium webkit firefox` (on this machine, use the manual curl+unzip install above instead).

## Standing doctrine (every session)

- **Plan before editing.** Read the relevant files and write a short plan (files per phase, order, risks) before changing anything.
- **Diagnose root cause before fixing.** Never patch a symptom; explain the cause, then fix it at the source.
- **One commit per phase.** After each phase run unit tests, `npm run build`, and the e2e suite, and fix any regression *before* committing.
- **Never trust comments over code.** Verify behaviour in the code itself; comments may be stale.
- The screening page mounts desktop AND mobile sub-views simultaneously (src/pages/screening/DesktopPassItOn.jsx, MobilePassItOn.jsx) with unused variants hidden — the same copy can exist in 3+ styled variants at once. When matching or measuring styles, always identify the variant actually visible at the target viewport by rendering the live app, never by searching the code alone.
- **Destructive-data rule:** any script that writes to or deletes production data must default to dry-run and require an owner-run `--execute` (with typed confirmation) — never execute such an operation yourself. Every data script now complies: `reset-test-data.js`, `teardown-demo-film.js`, `backfill-claimant-accounts.js`, `backfill-film-tickets.js`. Admin deletions in-app go through the delete-with-splice preview/typed-confirm flow instead.
- **Prefer single simple commands** over compound shell chains (`;`, `&&`, `|`) when feasible, so permission prompts stay rare.
- **Before ending any session, check whether your preview tooling started any duplicate dev servers, and kill them.** (Preview launchers inject `PORT=3000` into `npm run dev`, which put a second Express API on Vite's port on 2026-07-21 — localhost share links then 404'd with "Cannot GET /{slug}". `server/apiPort.js` refuses that port now, but stray processes still need cleanup.)
- **Prefer allowlisted read-only routes over approval-prompting tools.** For any read-only action use what's already allowed: `node server/db-read.js` for database reads, `grep`/`cat`/`git diff` for code, `npx eslint` for lint, and the allowlisted read-only MCP tools (Supabase/Vercel `list_*`/`get_*`/`search_docs` in `.claude/settings.local.json`) for infra inspection. Never reach for a tool that can write when a read-only route answers the question.
- **Never print `.env` contents or any secret values into chat. Reference secrets by variable name only.** Checking which env vars exist or how a service connects never requires displaying their values — grep for the variable *name*, don't `cat`/`Read` the file. This applies to every secret (service-role keys, API keys, encryption secrets), not just passwords. (Incident: full `.env` contents, including `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MUX_TOKEN_SECRET`, and `INVITE_CTX_SECRET`, were printed to a chat transcript on 2026-07-06 while investigating a database connection — see `deepcast-mvp-rework.md` E7.)
- **Pre-existing lint never blocks work.** Verify a lint issue pre-dates your changes (e.g. lint the file at HEAD), report it in the final summary, and move on — fix it only if asked.
- **All browser storage access goes through `src/lib/safeStorage.js`** (`safeLocalStorage` / `safeSessionStorage`) — never raw `localStorage`/`sessionStorage` calls, never at module scope, in render, or mid-handler. Safari can block storage entirely (SecurityError on access) or fail every write (private-mode QuotaExceededError); the helper feature-detects per call and falls back to in-memory state for the visit, so a storage failure can never crash a screen or change what the user sees.
- **New code that touches storage must include a restricted-storage test:** unit coverage against the missing / access-throws / write-throws modes (see `src/lib/safeStorage.test.js`) and, for user-visible flows, an e2e case in `e2e/storage-restricted.spec.js` (which runs both Safari restriction modes on all three engines).

## Security doctrine — privileged endpoints

- **The verified-session pattern is REQUIRED for every privileged endpoint:** read the `Authorization: Bearer` token, verify it cryptographically with `supabase.auth.getUser(jwt)`, and take the caller's identity ONLY from the verified token. **Never trust a client-sent user/creator ID** — that was the old `/api/team/remove-member` hole, closed June 2026. Reference implementations: `/api/invites/relink`, `/api/team/remove-member`, and the `/api/admin/*` endpoints.
- Authorization decisions live in small unit-tested modules (`server/adminAuth.js`, `server/teamRules.js`, `server/deleteRules.js`) so every rejection path has a test. Delete-with-splice hard-refuses: protected real users, creators (by role AND film ownership — the films CASCADE landmine), team members, and the caller's own account; execute re-verifies everything independent of preview.
- **The sign-in-link endpoint answers identically whether or not an account exists — keep it that way.** A different answer for unknown emails would let anyone probe which addresses have Deepcast accounts. Unknown emails get the same neutral "check your inbox" response and NO account is ever created (sign-in links are generated only for existing accounts; signup happens exclusively through the invite-acceptance flow). Do not "helpfully" add an explicit refusal for unknown emails.
- **Owner-only admin endpoints** (`/api/admin/ticket-controls` + `/status`, `/api/admin/delete-person` + `/preview`) are pinned to the `ADMIN_USER_ID` env var — an exact user-ID match against Ien's account, NOT a role check (a hypothetical second creator must be rejected; role is belt-and-suspenders only). They **fail closed**: when `ADMIN_USER_ID` is unset, everyone gets 503, including a valid creator session. The variable must be set in Render's environment and local `.env`.

## Email-sending doctrine

- **Every outgoing email goes through the one dispatcher** (`deliverEmail` in `server/index.js`, built on `server/emailDelivery.js`): sends are strictly sequential and throttled below Resend's rate limit, and each send is automatically retried with backoff before giving up. Never call Resend directly from a route.
- **Acceptance is verified, per recipient.** The dispatcher resolves only once Resend confirmed it accepted the email. `/api/invites/send` awaits this before answering; on permanent failure it rolls back the invite row and the allocation and returns an error, so a retry starts clean (not blocked by the duplicate-invite check).
- **The UI never claims success for a recipient whose email was not confirmed accepted.** Multi-recipient sends report per-recipient truth: failures are shown clearly and the failed recipients stay in the form for retry (`handleSendLetter` in `InviteScreening.jsx`, `InviteForm.jsx`). `server/emailDelivery.test.js` proves the throttling, the retry, and the honest-failure behaviour.
- The Resend API key is **send-only** — it cannot read send history, so past sends can't be audited through the API. Acceptance must be captured at send time: the `emailId` in the `/api/invites/send` response and the `[email] Resend accepted` server log line.

## THE CLAIM-LINK FLOW (CURRENT — how films travel now, July 2026)

Invites are LINKS, not emails. A sharer enters only the invitee's first name and gets a link; the invitee claims it with their email and watches immediately. No account is created anywhere in this flow. Recon + full design history: `PLAN.md` and `deepcast-mvp-rework.md` (its decisions log is binding).

### The three pages (one job each; the network idea at three intensities)

1. **Landing `/{slug}`** (`src/pages/ClaimLanding.jsx`, public, KEEP LAST in `src/App.jsx` routes): the letter over a full-bleed film still (`films.poster_url`, falling back to the film's Mux poster frame, then the dark bg; the img needs its inline height — the global `img{height:auto}` in `src/index.css` defeats Tailwind height utilities). Order is fixed (founder redesign 2026-07-21, supersedes the 2026-07-16 letter): "{Receiver}, {Sharer} gifted you a film." (ONE uniform type style — never bold a name or word; both names first-word-trimmed; missing receiver drops the prefix, missing sharer reads "Someone") / the lineage thread (whisper) / film title / transmission hook (`films.transmission_hook`, renders NOTHING when NULL — no box, no placeholder) / inline email + "Accept your invite" / "This invitation admits one person, once." / "By private invitation only · Ticket №{N}" (ticket segment only when `ticketNo` exists in the payload). The old "Dear {first name}," greeting is GONE; "watched this and thought of you" lives in the post-claim prologue now. NOT on this page: constraint line, ordinal, conditions line, graph.
2. **Watch `/watch/{slug}`** (`src/pages/ClaimWatch.jsx`): title + "14 minutes. Headphones recommended." (`FILM_CONDITIONS_LINE`, `src/lib/screeningConditions.js`), the Mux player (public playback — no session required anywhere in the chain, verified in PLAN.md §1c), and the permanently docked share panel (the ask) — collapsed "Who is this film for?", expandable any time, pause nudges it, credits-end auto-opens it, never overlays the video. Expanded: the constraint line → tickets line → first-name field → generate → link + copy + ready-to-send line → "See where your ticket went →". Resume positions save through `resumePositionToSave` (`src/lib/resumePosition.js` — near-end positions are ERASED, never saved) under slug-scoped keys `screening_position_slug_{slug}` / `screening_progress_slug_{slug}`; `?again=1` starts clean.
3. **Dashboard `/dashboard`** (the payoff): the **V5 viewer dashboard** (`src/pages/ViewerDashboardV5.jsx`, LIVE since 2026-07-22; spec `design-refs/deepcast-dashboard-v5.html`) — ONE dashboard for every user, no tiers. Sidebar: name, gold "Ticket No. N", Tickets remaining/given, the quiet aside, gold "Share this film" CTA, and ALL FOUR links for everyone (About Deepcast / Contact / Edit your first name / Sign out; pinned so they can never scroll out of sight; mobile = top-bar Menu overlay + fixed bottom share bar). Main: state-aware screening cards (`src/lib/screeningCard.js`); the journey line + CONSTELLATION (sunburst star map, `src/lib/constellationLayout.js` + `src/components/ConstellationMap.jsx` — filmmaker at center with name + "TICKET NO. 1", gold path film→you→your invitees, dim twinkling web, hover lights the web gold, wheel/pinch zoom at the pointer + immediate drag); "Tickets you've shared" rows (status + copy link; empty state "No tickets given yet."). Solid `--color-bg-page` background — no grain. Data rules live in shared libs only: `journeyLine.js`, `ticketRows.js`, `constellationLayout.js`, `inviteExistence.js`, `displayName.js`.

### Server routes (`server/index.js`)

- `POST /api/invites/create-link` — two sharer-identity paths (both set `parent_invite_id`, unified lineage model): a **verified session** (Bearer → `getUser()`, reusing the exact parent-resolution fallbacks of the legacy send route), or a **claimed invite reference** (`server/claimIdentity.js` — the claim IS the identity; no session needed). Since Pieces E/F the wallet fork keys on ACCOUNT existence, never on the session: a `claimed_by`-backed sharer spends their per-film `film_tickets` wallet (server-resolved, `sender_id` stamped on the child — unified lineage), and only account-less rows fall back to the invite wallet's CAS. Slug generation in `server/inviteSlug.js`: Unicode-normalize → strip to a-z → max 20 chars → fallback `invite`; reserved-route blocklist; 4-char unambiguous suffix (no 0/o/1/l/i), 3 retries then widen to 5.
- `GET /api/invites/link/:slug` — public landing/watch payload (names, lineage, hook, posterUrl, muxPlaybackId, tickets). Never exposes the legacy `token`. Never transitions status.
- `POST /api/invites/claim` — the email IS the claim. Atomic race-guarded UPDATE (`eq status 'created'` + `is claimed_email null`); stamps `claimed_email`, `claimed_at`, `status='claimed'`, the frozen `claim_ordinal`; creates (or attaches to) a passwordless account, stamps `claimed_by`, initializes the film's `film_tickets` wallet at 5. **The claim SIGNS THE NEW USER IN (Fix A, 2026-07-21):** for a freshly CREATED account only, the server mints an in-band single-use sign-in (`generateLink` → client `verifyOtp`, no email) — an ATTACHED pre-existing account NEVER gets a session from a typed email (they use the normal sign-in flow). **Duplicate-claim guard (Fix B + amendment):** if the email already holds this film, the fresh link is VOIDED (`status='void'`, race-safe — can never destroy a real claim; its ticket number dies with it, permanent gap), the sender's ticket auto-refunds (`server/voidRules.js` — skipped for role/wallet-unlimited senders; `team_creator_id` only ever read), and the claimer sees "You already hold this film." before routing to their dashboard. The sharer's own session never claims; the film never travels back to its maker (`server/shareRules.js`). Routes to the watch page through the once-per-claim PROLOGUE (founder spec 2026-07-21, `ClaimPrologue` in `ClaimLanding.jsx`): a ~10s full-screen interstitial on the brand ink background, three staggered italic serif lines (each staying once shown, ONE uniform style, no bolding) — "{Receiver}, {Sharer} watched this and thought of you." / "No algorithm decided you should see it. A real person did." / "After watching, you'll get to do the same — choose the few people who need it next." — tap/Enter/Space to advance (first tap reveals all, next skips), reduced-motion renders statically with a ~4s hold, and it warms the watch chunk + Mux preconnects + poster while holding. NO storage: it exists only in the claim-success state, so duplicates, sharer-view, dead links, voids, and revisits structurally never see it.
- `POST /api/invites/replenish-check` — the +3-per-3-watched viewer replenish, per-film, server-recomputed (Piece F; the old client-side write of another user's row was RLS-dead). Called from the legacy screening where `checkReplenish` ran.
- `GET /return` (client route, `src/pages/ReturnGate.jsx`) — where magic sign-in links land: routes to the most recently claimed UNWATCHED film's watch page; all watched or no claims → `/dashboard`. Never dead-ends for any authenticated user; `claimed_by` primary, `claimed_email` fallback.

### Tickets (PER-FILM economy — Piece F, 2026-07-18)

One wallet per (person, film): **`film_tickets(user_id, film_id, balance, unlimited)`**, migration `20260717_film_tickets.sql` (applied). Rows are LAZY — a missing row reads as the virtual full grant of 5 and materializes on first write; claiming a film initializes that film's wallet at 5. Spent at link GENERATION, no refunds (a failed generation is refunded — that's not a spend); race-safe spend/grant/refund live in `server/filmWallet.js`; canonical display is `filmTicketsRemaining(profile, wallet)` in `src/lib/shares.js`. EVERY spend path goes through the film wallet: legacy `/api/invites/send`, both create-link branches (session, and stash-based via `claimed_by` — `server/claimantWallet.js`), the admin grant, and the server-side replenish. **`users.invite_allocation` and `users.unlimited_shares` are DORMANT** — still written at account creation, never read on ticket paths. The legacy invite wallet (`invites.tickets_remaining`, `src/lib/ticketRules.js`) survives ONLY as the degradation path for claimed rows with no account (claimed_by NULL). Zero state: "You've given all your tickets for this film." — no upsell, and now truthfully per-film.

### Ticket numbers — LIVE, permanent, immutable (2026-07-22)

Per-film sequential numbers, minted atomically at GENERATION by `next_ticket_no()` (`films.ticket_seq`; service-role only; non-fatal — numbering can never block a share). **The filmmaker always holds №1** (`films.creator_ticket_no`, migration `20260722_creator_ticket_no.sql`, applied; new films are born with the counter at 1 by column default), shown on the creator dashboard's film cards and under FILMMAKER at the constellation's center. **Invitees start at №2. Numbers are IMMUTABLE: deletions leave permanent gaps; NOTHING ever renumbers an invite.** Ghosts and voided links are never numbered (`needsTicketNumber`). Assigned as of the 2026-07-22 backfill: A Sacred Pause — Jon №2; The New Narrative — Trace №2, Austin №3, Tina №4, Georgie №5. **`server/backfill-ticket-numbers.js` and `server/delete-orphan-rows.js` are COMPLETED one-time operations — do not re-run** (both are dry-run-by-default and state-guarded if ever touched).

### Ordinal freeze

`invites.claim_ordinal` is stamped ONCE at claim ("Nth person invited to this film" at that moment) and never recomputed; the dashboard displays it via `formatOrdinal` (`src/lib/ordinal.js`). Pre-claim displays may compute live.

### Lineage thread (`src/lib/lineageThread.js` — unit-tested grammar)

Built from `parent_invite_id` ancestry (walked server-side in the link route, one film-scoped query). Label above it: "How this reached you". Total nodes ≤ 4 → every first name (`[Ien] —— [Dan] —— [you]`); ≥ 5 → collapse the middle to "⋯ N hands ⋯" keeping three anchors (origin, direct sharer, you), N = total − 3. First-naming happens in the lib; the slug is routing only and never a display source.

### One tier — everyone is a signed-in user (Fix A, 2026-07-21; the claimant tier is GONE)

There is no account-less claimant and no stash-based dashboard admission anymore. Claiming creates the account AND signs the browser in (see the claim route above), so `/dashboard` has ONE path for everyone: `ProtectedRoute` + `ViewerShareGate` (which admits never-shared claimants by `claimed_by`). The old pseudo-profile, `DashboardGate` stash admission, and every claimant-only branch were deleted — do not reintroduce them. Verified before removal: ZERO account-less claimants existed in production. The claim stash (`src/lib/claimStash.js`) survives ONLY as the watch page's same-visit ownership recognition and resume-key scoping — it never grants dashboard access; a stash-only browser reaches the sign-in page (never a blank one — the no-blank-page rule holds via ProtectedRoute's spinner/redirects).

**Return visits:** magic sign-in links work for everyone (Login submits with `redirectPath: '/return'`; `/return` routes to the most recent unwatched claim's watch page, else `/dashboard`). Supabase Auth → Redirect URLs must include `{site}/return`.

### Who exists — ONE definition for every surface (`src/lib/inviteExistence.js`)

The single source of truth for which invite rows count: voided links count NOWHERE (constellation, journey line, tickets given, funnel, admin table, backfill — but stay visible in the sender's ticket list as ledger history), and demo ghosts are excluded everywhere except admin surfaces (the module's `includeGhosts` parameter, owner decision). **New surfaces must read this module — never write a private filter.** `needsTicketNumber` is the numbering rule (unnumbered + exists); `countTicketsGiven` is the given-count; `safeFirstName` (`displayName.js`) is the display-name rule (an email or any fragment of one is NEVER rendered as a name — placeholder "Someone").

### Reach (decided 2026-07-16 — do not change)

"People you've reached" counts opened/watched/signed_up only. Claimed-but-unwatched does NOT count — a ticket given is its own stat. `src/lib/reach.js` stays as-is.

### Founder-approved copy (verbatim, do-not-edit; the copy layer is CLOSED — changes come only as explicit requests from Ien)

- Constraint line (share panel = primary home; dashboard quiet line): "This film reached you because someone thought of you. No algorithm, no feed. Films here pass through human hands only."
- "How this reached you" · "This invitation admits one person, once." · "Accept your invite" · "Who is this film for?" · "Create their invitation" · "You have N tickets for this film. Each admits one person, once." · "You've given all your tickets for this film." · "I watched this and thought of you — [link]" · "See where your ticket went →" · "Your dashboard →" · "14 minutes. Headphones recommended."
- **V5 dashboard (2026-07-21):** sidebar aside: "This film reached you because someone thought of you. No algorithm, no feed. Films here spread by private invite & real humans only." · heading "Tickets you've shared" · empty state "No tickets given yet." · journey line Y>0: "This film has reached [X] people. [Y] of them received it because of you." · Y=0: "This film has reached [X] people. Your shareable tickets are waiting to grow that number." (always numerals; Y = the viewer's ENTIRE downstream subtree, counted by the constellation — a documented deviation from opened-based reach) · ticket statuses "Unopened / Opened / Watched / Shared to N people" · duplicate claim: "You already hold this film." and the sender's row "Already held this film — ticket returned." · first-name input refusal: "Just their first name — no email needed." (client + server, one shared module)
- Visitor screen: "This page belongs to invited viewers." / "If someone passed you a film, open the link they sent — it's your way in."
- Dead link: "This invitation has already been accepted." / not-found: "This invitation link doesn't lead anywhere."

### Standing content rules

- **Real films ship with bar-free masters and a hand-picked `poster_url`.** Baked letterbox bars poison the poster frame, GIF, and player, and nothing downstream can remove them.
- **Real films need real Ien-authored transmission hooks** before they ship; the demo film's hook is demo copy.

## CURRENT STATE (2026-07-22 — the V5 ship is LIVE on production)

**Everything is merged to `main` and deployed.** The product tonight:

- **The V5 viewer dashboard is the ONLY viewer dashboard** — one tier, every user signed in, all four sidebar links for everyone, constellation + journey line + "Tickets you've shared", solid background (grain removed), ticket numbers displayed. The creator/admin dashboard keeps its own view (link panel, funnel, people table, ticket controls, Remove) plus "Ticket No. 1" on each film card.
- **Shares are custom unique links only.** The email-invite system is retired: no viewer-facing surface creates email invites. (Truth note: two legacy `InviteForm` mounts survive on the creator-only Upload and Profile pages — the A5 remainder, harmless but pending removal.) Legacy `/i/:token` links still resolve forever.
- **Ticket numbers are live and immutable** (see the Ticket numbers section — filmmaker №1, invitees from №2, gaps are permanent).
- **Claiming signs the new user in**; duplicate claims void + refund + recognize (see the claim route).
- **The who-exists module governs every surface** (see its section — new surfaces read it, never write private filters).
- **Production data is CLEAN (2026-07-20/22 cleanup):** the only real people are Ien (filmmaker), Jon, Trace, Tina, Austin, Georgie. Every test identity and row was removed via admin Remove + the one-time `delete-orphan-rows` script.

**Completed one-time operations — DO NOT RE-RUN:** `server/backfill-film-tickets.js`, `server/backfill-claimant-accounts.js`, `server/backfill-ticket-numbers.js`, `server/delete-orphan-rows.js`.

**Test discipline (standing):** The New Narrative is the designated test film; A Sacred Pause is public-facing — never create test links, claims, or data on it. **Localhost writes to PRODUCTION** — a test claim on localhost mints a real, permanent ticket number and a real account.

**Parked (approved, not built — do not re-debate):**
- **Ticket expiry refund** — approved spec in `docs/ticket-expiry-refund-spec.md` (14 days unclaimed → sender refunded; the link never dies; late claims never re-charge).
- **Share-modal "human hands" wording** — the share surfaces still carry the original constraint line ("…pass through human hands only."); the sidebar's new "…spread by private invite & real humans only." applies to the sidebar aside only, pending a decision to unify.
- **Render region migration (Oregon → Virginia)** — runbook in `docs/render-migration-runbook.md`, awaiting an owner decision.
- **Session-based duplicate detection** — if a signed-in user opens a claim link for a film they already hold, treat it as a duplicate claim immediately: recognition message, void the link, refund the sender. Extends the existing duplicate machinery with a second trigger. IP-based and name-based detection explicitly REJECTED (false positives; membership privacy leak).
- Phase 2 items live in `deepcast-mvp-rework.md` (historical record).

**A5 remainder (open):** remove the two legacy email-invite mounts (Upload, Profile) and their quota labels. The `/i/:token` acceptance path and email templates stay forever.

**Accepted MVP limitations (by decision — do not "fix" without Ien):** two same-first-name claimants on one film can merge into one graph node; legacy account-viewer screening cards show no progress bar; claimed-but-unwatched does not count toward the legacy reach stat; multi-film dashboards pin the constellation/journey/tickets to one auto-selected film (stacked screening cards, no switcher).

**Backups** (owner's machine, outside the repo): `~/deepcast-backups/2026-07-06/` (full pre-migration table dump + restore notes) and `~/deepcast-backups/2026-07-16-d4/` (the deleted test rows). The Supabase free tier has NO automatic backups; proper pg_dump path is tracker item E8.

**Standing doctrines in force for all of this work** (details elsewhere in this file): commit-only, owner pushes; **ABSOLUTE RULE (2026-07-21, after a same-session violation): NO production change — no migration, no data write, no counter reset, nothing — without the owner's explicit approval given in THAT session for THAT specific change. A tool-permission prompt is NOT approval. When a blocker needs a production change, STOP MID-TASK, state the problem and the proposed change in plain English, and WAIT — even if the fix is obvious, even mid-verification. Losing momentum is acceptable; losing the owner's ability to be the gate is not.** Approved migrations are committed as idempotent files, applied via the Supabase `apply_migration` tool, and INDEPENDENTLY verified through `information_schema`/`pg_policies` before any code trusts them; secrets referenced by variable name only, never printed; production deletions are dry-run first, shown row-by-row, owner-approved, backed up, explicit id allowlists with protected-email refusal guards (protected: filmmaker@gmail.com, jbregel@gmail.com — Jon Bregel, A Sacred Pause's director, the realest node on the graph — contact@tracebelll.com, and the other real users listed in `server/teardown-demo-film.js`, the superset list).

## LEGACY: email-first invite flow (`/i/:token`) — PROTECTED, do not retire the acceptance path

Everything below this line about invite EMAILS and the send flow describes the LEGACY system. Invite links never expire, so already-sent email invites must keep working indefinitely: `/i/:token`, its status machinery (`pending→opened→watched→signed_up`), `buildInviteEmailHtml`/`PlainText`, and the resend routes stay live and untouched. CREATION of new email invites is retired from every viewer-facing surface (the viewer dashboard's email modal was DELETED with the V5 ship, 2026-07-21); the A5 remainder is the two `InviteForm.jsx` mounts on the creator-only Upload and Profile pages, and the legacy screening's pass-it-on letter (reachable only from old `/i/:token` invites).

## Invite email content & MUX GIF

(Delivery/throttling is the doctrine above; this is how the email's CONTENT is built.)

- **The invite email is film-data-driven.** Synopsis = `films.description`; the animated preview GIF URL is built by `buildFilmGifUrl(film, filmId)` from `films.mux_playback_id` + `films.gif_start`/`gif_end`. The HTML body is assembled in `buildInviteEmailHtml` (`server/index.js`). Per-film content needs only the film row, not code — the A Sacred Pause italics/fps are the gated demo exception noted in the Films section.
- **`films.description` is HTML-escaped and its newlines are dropped.** It is inserted via `escapeHtml`, with no `\n`→`<br>` conversion, so any markup or line breaks in the data are lost. **Formatting must be done in the template, not the data** — wrap the already-escaped strings in tags we control; never unescape, never allow data-supplied HTML through.
- **GIF params:** requested at `width=380` (displayed at `520`), `fps=10` (`fps=15` for A Sacred Pause). `&start=`/`&end=` are appended only when `gif_start`/`gif_end` are set.
- **MUX's animated-GIF endpoint ignores `fit_mode`/`crop`** — letterbox bars baked into a source video CANNOT be removed via URL params. Fix the source video, not the URL.
- **`server/preview-email.js` is a SEPARATE, drifted copy** — it does NOT import the real `buildInviteEmailHtml`; it keeps its own copy that has already diverged (header label, personal-note block, paddings). It is an approximation for eyeballing layout only and does NOT reflect real email changes. To trust a change, render the real builder, not the preview.

## Invite send flow (multi-film) — LEGACY (see the claim-link section above; A5 retirement pending)

- **Sending is multi-film.** [UPDATED 2026-07-21: the creator dashboard's email surfaces are GONE (Piece A) and the viewer dashboard's email modal is DELETED (V5 ship) — the only surviving mounts are `InviteForm` on the creator-only Upload and Profile pages, POSTing `/api/invites/send` with their film's `filmId` as a prop. These retire with the A5 remainder.]
- **Creators are unlimited and may invite for any film they own** (the server requires `films.creator_id` to match the sender; a creator inviting to a film they don't own is rejected).
- **Send guards** (`/api/invites/send`): no invite to the film creator's own email (see Standing product rules / `server/shareRules.js`); **dedup is one invite per (film, email)** — a duplicate returns 409, and `InviteForm` also pre-checks it; there is **no test-email allowlist** on the send endpoint (allowlists live only in the maintenance scripts).
- **[SUPERSEDED 2026-07-06 — first-name-only design; surfaces retire with A5; columns stay dormant]** ~~Recipient first AND last name are required on every send path~~ — collected client-side and re-validated server-side (`/api/invites/send` rejects a blank/whitespace last name with 400). There are **three** client paths and all enforce it: the creator dashboard / Upload / Profile form (`src/components/InviteForm.jsx`), the screening **pass-it-on letter** (`src/pages/InviteScreening.jsx` `handleSendLetter` + `screening/DesktopPassItOn.jsx` / `screening/MobilePassItOn.jsx`), and the **viewer dashboard invite modal** (`src/pages/Dashboard.jsx` `handleSendModalInvite`). Add the field to ALL THREE if a fourth send surface ever appears.
- **The last name is stored separately, never in the first-name fields.** It goes in `invites.recipient_last_name` (and `users.last_name`); `invites.recipient_name` and `users.name` stay **first-name only**. The last name is read only when the invitee creates their account — `/api/invites/session` and `/api/invites/claim-account` copy it into the new `users.last_name` so the account holds the full name. **Every greeting and on-screen display stays first-name only** (the invite email is unchanged by this work — it still reads `recipient_name` / `sender_name`). Existing rows are grandfathered (`recipient_last_name` NULL, `users.last_name` empty) and behave exactly as before.

## Standing product rules

- **Per-user unlimited is PER-FILM: `film_tickets.unlimited` (Piece F) — and it is quota-only by design.** It removes that one film's cap (no balance check, no decrement) while changing NOTHING else: same viewer role, same dashboard, same ViewerShareGate, and the user's sent invites still record `parent_invite_id`. Role-based unlimited (creator, team member, team-linked viewer — `isRoleUnlimitedSharer` in `src/lib/shares.js`) stays GLOBAL. The old `users.unlimited_shares` column is DORMANT. **NEVER use `team_creator_id` to grant quota** — team linkage suppresses parent-link recording on sends (part of the phantom-node fix), which silently breaks the word-of-mouth chain, reach stats, and the graph for that user. Grant/revoke happens through the owner-only ticket-controls popover on the creator dashboard's people table (per-film since Piece F); revoke returns the person to their EXISTING counted balance for that film — never reset by the toggle.
- **Invites to the film creator's email are refused server-side — by design; don't "fix" it.** The rule lives in `server/shareRules.js` and runs in `/api/invites/send` before anything is written or emailed. The message is predicate-style because both share forms render failures as "<first name> <reason>".
- **Invite links do not expire in the MVP.** The server never rejects a film invite on `expires_at` — the single gate for invite usability is `isInviteUsable` in `server/inviteValidation.js` (unit-tested with past-dated rows) — and the frontend has no "expired" state, copy, or 410 handling anywhere. The `invites.expires_at` column is retained and still written (far-future, default 3650 days via `INVITE_EXPIRY_DAYS`) so expiration can be reintroduced post-MVP; reintroducing it is a deliberate product decision to be made in that one function, updating its tests and `e2e/invite-never-expires.spec.js`. (Team-invite links — teammate account creation — are a separate feature and still expire after 14 days; Supabase magic sign-in links also expire shortly. Both are auth links, not invite links.)
- **[LEGACY email flow only — the claim-link flow has no note; its gift is the ready-to-send message]** Personal notes are MANDATORY and never hidden (on the legacy send surfaces). Wherever sharing happens — the share prompt, the dashboard invite form, any future surface — every recipient shows a visible personal-note field by default, for normal and unlimited users alike, and a send is refused (with a gentle inline message) if any recipient's note is empty or whitespace-only. Never label the note "optional", and never collapse it behind a link, icon, or toggle; the note is the gift, not the link.
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
- **Tickets remaining, PER-FILM** (`src/lib/shares.js`, Piece F): **`filmTicketsRemaining(profile, wallet)`** is THE quota computation — Infinity for `isRoleUnlimitedSharer` (creator/team/team-linked, global) or a wallet flagged unlimited; else the `film_tickets` balance, where a MISSING row is the virtual 5. Used by the viewer sidebar ("Tickets left", selected film), the admin status endpoint, and every server quota check via `server/filmWallet.js`. The old `invitationsRemaining(profile)`/`isUnlimitedSharer` read the DORMANT global columns and survive only on the legacy A5 display surfaces (Profile, `InviteForm` labels) — accepted display lag, enforcement is per-film server-side.
- **Ticket funnel** (`src/lib/ticketFunnel.js`, Pieces A/A2): `computeTicketFunnel(invites)` → `generated` (all rows) / `claimed` (`claimed`+legacy `opened` up) / `watched` (`watched`/`signed_up`) — the creator dashboard's three-stat panel. `isInviteClaimedStage` is the shared claimed-stage rule.
- **Admin people table** (`src/lib/networkPeople.js`, Pieces A2/B/C): `buildNetworkPeople({filmInvites, users, creatorId})` → one flat OLDEST-first chronological list of person rows (three statuses) and unclaimed-ticket rows; per-person generated/claimed/reach; `userId` via `claimed_by`/senders; deleted senders never resurrect from surviving children's sender fields. Account balances come ONLY from the admin status endpoint, never computed here.
- **Legacy per-film invite stats** (`src/lib/filmStats.js`): `computeFilmStats` keeps the four-bucket legacy semantics for the network map; `WATCHED_STATUSES`/`isInviteWatched` are shared with the funnel and `/return`.
- **Shares used** (dashboard) = the viewer's sent-invite rows for the selected film (list length — counts the same rows the sent-list shows). **Films / N invites / Show more (N remaining)** are plain lengths of the displayed lists themselves. Viewer-facing labels say **"Tickets given" / "Tickets left"** — both per-film since Piece F.
- **Legacy invite wallet** (`src/lib/ticketRules.js`): `INITIAL_CLAIMANT_TICKETS` (5), `ticketSpendDecision` (NULL heals to the full grant — the same rule `filmWallet.js` reuses for lazy rows). Since Piece E/F this wallet applies ONLY to claimed rows with no account (claimed_by NULL).
- **V5 dashboard stats (2026-07-21/22)** — `src/lib/inviteExistence.js` (who exists / tickets given / numbering rule), `src/lib/journeyLine.js` (the journey sentence — counts come ONLY from the constellation's tree), `src/lib/ticketRows.js` ("Tickets you've shared" rows), `src/lib/constellationLayout.js` (map layout + `inviteCount`/`viewerDownstreamCount`), `src/lib/displayName.js` (never render an email as a name). New surfaces read these — never inline math, never private filters.
- **Screening card state** (`src/lib/screeningCard.js`): `screeningCardState({status, savedSeconds, progressFraction})` — the one decision behind "Resume film"/"Watch again" and the thin progress bar.
- **Ordinals** (`src/lib/ordinal.js`): `formatOrdinal(n)` for the frozen claim-ordinal line. (server/index.js keeps an older private copy used only inside the legacy invite email.)

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

## Creator dashboard admin surfaces (Pieces A/A2/B/C/F — standing behavior)

- **Per film card:** "Create an invitation" → `CreatorLinkPanel` (`src/components/`, same create-link flow as the watch panel, session path); the three-stat ticket funnel; the "People in this network" table. No email-send surfaces remain here.
- **The people table** renders `buildNetworkPeople` rows (see Canonical stats): three statuses only, flat oldest-first, unclaimed links recoverable in-row (URL + "Copy the message").
- **Ticket controls** (`TicketControlsPopover`): the cell is quiet state text; the popover's top-up accumulates a pending amount and commits in ONE call; the unlimited slide toggle confirms inline; per-film since Piece F (film id travels with every call). Statuses arrive in ONE batched admin call PER FILM, deduped by content across reloads.
- **Remove** (`RemovePersonPopover`): quiet affordance → server preview (who re-points where, what deletes, account fate) → Delete gated on typing the email (click-confirm for unclaimed links). Both popovers are fixed-positioned, flip above the anchor near the viewport bottom, and ignore trailing scroll for 300ms after opening (browsers deliver async scroll events from the opening click).
- Only the pinned owner ever sees controls — the admin endpoints 401/403 everyone else and the UI degrades to em dashes silently.

## Dashboard behaviour (viewer role — the V5 dashboard, LIVE 2026-07-22)

The old viewer diptych (sidebar stats + NetworkGraph + sent-invitations list, the mobile hamburger sidebar, the stash/claimant variant) is GONE. The V5 dashboard's full description lives in the claim-link section (page 3). Behavioural rules that carry over or replace the old ones:

- **Resume & return:** screening cards route by `link_slug` to `/watch/{slug}` (claim flow) or by token to `/i/{token}?play=1` (legacy), via React Router `navigate()`. Resume-position rules are unchanged (`src/lib/resumePosition.js`, slug-scoped keys, near-end saves ERASED); card state from `src/lib/screeningCard.js`.
- **Mobile:** top bar with a Menu overlay (starts closed, never auto-opens; navigation only — About Deepcast / Contact / Edit your first name / Sign out) and a fixed bottom "Share this film" bar. Desktop: the 18rem sidebar with the links block PINNED to its bottom edge (it can never scroll out of sight; e2e asserts on-screen boxes at 900px and 660px heights).
- **The constellation** replaces NetworkGraph on the viewer dashboard ONLY — `NetworkGraph.jsx` still serves the creator dashboard and the Network Map page. Its four layout rules (sector ∝ subtree, children within parent's sector, radial web labels vs tangential gold-path labels, YOU lower-left) are BINDING and unit-tested in `src/lib/constellationLayout.test.js`.
- **Share** = the link modal (`ShareLinkModal`), session-identified, same `create-link` flow as the watch panel. No email is ever entered on the dashboard.
- The `e2e/viewer-dashboard-v5.spec.js` mocked-session harness is the verification surface for this page (its mocks must expose `Content-Range` via CORS or ViewerShareGate bounces to /profile).

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
