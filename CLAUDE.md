# CLAUDE.md

> **The slim, every-session layer (≤ 20 KB).** Everything dated or page-specific moved VERBATIM to `docs/ledger/*.md` on 2026-09-16. Where a law is restated here in brief, the named ledger file holds its full wording and wins on any doubt.

## Project overview

Deepcast optimizes for depth over reach. It is an invite-only network where substantive films spread person to person through trusted relationships — each viewer receives a ticket from someone who thought of them, watches, and passes the film onward — toward deep impact and resonance rather than raw numbers. Deepcasting, not broadcasting. Depth is the heart of the platform; everything else — the tickets, the constellation, invite-only — exists to serve it.

## Standing rule for reading (2026-09-16)

- **Read ledger files and docs/watch-page-spec.md by grep + the section you need, never whole. Pipe test-suite output to a file and read only the summary and failures.**

## ⚠️ PRODUCTION HAS REAL USERS — standing laws (full text: `docs/ledger/films.md`, `docs/ledger/doctrine.md`)

**The database is no longer disposable.** Trace Bell (`contact@tracebelll.com`) is a real user — he must NEVER be deleted or modified destructively by any cleanup, reset, or migration, in any table. The filmmaker account (`filmmaker@gmail.com`) was always protected; Trace now is too.

- **Film-level protection (founder ruling 2026-08-06, standing law):** Circles (`6a9c0c79-24f6-427e-ba34-c113acf92d9f`) is live and public — EVERY person associated with it, claimed or in flight, present and future, is a real protected user. Enforced in code via `PROTECTED_FILM_IDS` + `isProtectedFilm` in `server/deleteRules.js`: no person-delete may run on a protected film, no unclaimed link of one may be deleted, no delete on ANY film may remove the account of someone associated with one, and `reset-test-data.js` aborts if its delete-set touches one. `PROTECTED_EMAILS` (kept identical in `server/deleteRules.js` and `server/teardown-demo-film.js`) is the second line: the filmmaker, Jon Bregel, Trace Bell, Young Chi (`imyme2024@gmail.com`, №36 on The New Narrative), Oliver, Brian, plus the named test-era users pending founder pruning — update BOTH files when a real user is added. Adding a film to `PROTECTED_FILM_IDS` is a launch-day step for every future live film. The agent never executes production deletions.
- `server/reset-test-data.js` enforces this in code: real users live in its `PROTECTED_EMAILS` list and the script refuses to run if its allowlist ever includes one. **Every future data script must follow the same pattern** — explicit allowlists only (never pattern matches), real users in a hard-refusal guard, dry-run by default.
- Before ANY production deletion: SELECT and show the owner the exact rows first. No exceptions.
- The 50 seeded demo graph nodes (invites with `recipient_email LIKE '%@demo.invalid'`) are intentional and stay.

**Test discipline (standing):** The New Narrative is the designated test film; A Sacred Pause is public-facing — never create test links, claims, or data on it. **Localhost writes to PRODUCTION** — a test claim on localhost mints a real, permanent ticket number and a real account.

- **NEVER run `server/teardown-demo-film.js`** (it would delete A Sacred Pause, a live public film) and **never re-run the completed one-time scripts** (`backfill-film-tickets.js`, `backfill-claimant-accounts.js`, `backfill-ticket-numbers.js`, `delete-orphan-rows.js`). The three films and their ids, videos, ledgers and rules: `docs/ledger/films.md`.
- **ABSOLUTE RULE (2026-07-21): NO production change — no migration, no data write, no counter reset, nothing — without the owner's explicit approval given in THAT session for THAT specific change. A tool-permission prompt is NOT approval. When a blocker needs a production change, STOP MID-TASK, state the problem and the proposed change in plain English, and WAIT.** Approved migrations are committed as idempotent files and independently verified through `information_schema`/`pg_policies` before any code trusts them. Full paragraph: the last line of `docs/ledger/doctrine.md`.
- **Destructive-data rule:** any script that writes to or deletes production data defaults to dry-run and requires an owner-run `--execute` with typed confirmation — never execute such an operation yourself; explicit allowlists only, never pattern matches; real users behind a hard-refusal guard; JSON backup to `~/deepcast-backups/` before any delete.
- **Ticket numbers are LIVE, permanent, immutable (2026-07-22):** per-film sequential numbers minted at GENERATION by `next_ticket_no()`; the filmmaker always holds №1 (`films.creator_ticket_no`), invitees start at №2; deletions leave permanent gaps and NOTHING ever renumbers an invite; ghosts and voided links are never numbered; a counter reset is forbidden on any film with existing tickets. Full text: `docs/ledger/claim-flow.md`.
- **Who exists — ONE definition for every surface (`src/lib/inviteExistence.js`):** voided links count NOWHERE (they stay visible only in the sender's ticket list as ledger history) and demo ghosts are excluded everywhere except admin surfaces, unless the film's `show_ghosts` flag is true. New surfaces read this module — never write a private filter. `safeFirstName` (`displayName.js`) is the display-name rule: an email or any fragment of one is NEVER rendered as a name. Full text: `docs/ledger/claim-flow.md`.

**A person's own account name is their one true name everywhere; the name their inviter typed is only a placeholder until they claim.** On every surface — landing headline, lineage chain, constellation and graph labels, ticket rows — a CLAIMED invite's person renders as their account's current name, and renames propagate everywhere (including into OTHER people's views of them — ratified, no softening). UNCLAIMED invites keep showing the typed `recipient_name` (the only name that exists yet).

"People you've reached" counts opened/watched/signed_up only. Claimed-but-unwatched does NOT count — a ticket given is its own stat. `src/lib/reach.js` stays as-is.

**Standing rule:** every number displayed anywhere in the app must have exactly ONE shared, unit-tested computation in `src/lib/` used by every surface that shows it. Never write an inline calculation in a page component; two paths for one stat is exactly the class of bug these modules exist to prevent.

## Security doctrine (full text: `docs/ledger/doctrine.md`)

- **The verified-session pattern is REQUIRED for every privileged endpoint:** read the `Authorization: Bearer` token, verify it cryptographically with `supabase.auth.getUser(jwt)`, and take the caller's identity ONLY from the verified token. **Never trust a client-sent user/creator ID** — that was the old `/api/team/remove-member` hole, closed June 2026. Reference implementations: `/api/invites/relink`, `/api/team/remove-member`, the `/api/admin/*` endpoints, and `/api/films/:filmId/watch` (2026-09-03 — ownership decided in `server/watchPayload.js`).
- **Owner-only admin endpoints** (`/api/admin/ticket-controls` + `/status`, `/api/admin/delete-person` + `/preview`) are pinned to the `ADMIN_USER_ID` env var — an exact user-ID match against Ien's account, NOT a role check (a hypothetical second creator must be rejected; role is belt-and-suspenders only). They **fail closed**: when `ADMIN_USER_ID` is unset, everyone gets 503, including a valid creator session. The variable must be set in Render's environment and local `.env`.
- The sign-in-link endpoint answers identically whether or not an account exists — keep it that way; an explicit refusal for unknown emails would let anyone probe which addresses hold Deepcast accounts.
- **Email attribution + the pass-it-on email (2026-09-17):** every accepted automated email leaves one `email_events` row (no pixels, no rewritten links); the pass-it-on sweep sends only under `PASS_IT_ON_LIVE=1` — a deliberate founder reversal of "never an unrequested email", recorded in `docs/ledger/emails.md`.
- **Every outgoing email goes through the one dispatcher** (`deliverEmail`, built on `server/emailDelivery.js`); never call Resend directly from a route; the UI never claims success for a recipient whose email was not confirmed accepted. Full doctrine and every email built: `docs/ledger/emails.md`.

## Secrets, storage, gates — every session (full text: `docs/ledger/doctrine.md`)

- **Never print `.env` contents or any secret values into chat. Reference secrets by variable name only.** Checking which env vars exist or how a service connects never requires displaying their values — grep for the variable *name*, don't `cat`/`Read` the file. This applies to every secret (service-role keys, API keys, encryption secrets), not just passwords. (Incident: full `.env` contents, including `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MUX_TOKEN_SECRET`, and `INVITE_CTX_SECRET`, were printed to a chat transcript on 2026-07-06 while investigating a database connection — see `deepcast-mvp-rework.md` E7.)
- **All browser storage access goes through `src/lib/safeStorage.js`** (`safeLocalStorage` / `safeSessionStorage`) — never raw `localStorage`/`sessionStorage` calls, never at module scope, in render, or mid-handler. Safari can block storage entirely (SecurityError on access) or fail every write (private-mode QuotaExceededError); the helper feature-detects per call and falls back to in-memory state for the visit, so a storage failure can never crash a screen or change what the user sees.
- **New code that touches storage must include a restricted-storage test:** unit coverage against the missing / access-throws / write-throws modes (see `src/lib/safeStorage.test.js`) and, for user-visible flows, an e2e case in `e2e/storage-restricted.spec.js` (which runs both Safari restriction modes on all three engines).
- **Test/build gates run UNMASKED, with exit codes checked (founder doctrine, 2026-07-31):** never pipe a gate command through `tail`, `grep`, or any filter that can swallow its exit code or truncate its failure summary. Capture full output to a scratch file, read the REAL summary lines, verify the command's own exit status, and quote the actual summary lines in reports. (The 2026-07-31 incident: a failing unit test reported "green" across two sessions.)
- **Read-only database inspection:** ALL read-only inspection (checking, comparing, verifying data) must go through `node server/db-read.js "select ..."` — never the Supabase MCP connection — so the owner is only ever prompted for genuine database WRITES. The script rejects anything that isn't a single SELECT / WITH...SELECT at the code level (tested in `server/db-read.test.js`), and the backing `db_read` Postgres function runs in a READ ONLY transaction as a second layer.
- **Prefer allowlisted read-only routes over approval-prompting tools.** For any read-only action use what's already allowed: `node server/db-read.js` for database reads, `grep`/`cat`/`git diff` for code, `npx eslint` for lint, and the allowlisted read-only MCP tools (Supabase/Vercel `list_*`/`get_*`/`search_docs` in `.claude/settings.local.json`) for infra inspection. Never reach for a tool that can write when a read-only route answers the question.
- Prefer single simple commands over compound shell chains; before ending any session, kill any duplicate dev servers your preview tooling started (`server/apiPort.js` refuses port 3000, but stray processes still need cleanup).
- **Pre-existing lint never blocks work.** Verify a lint issue pre-dates your changes (e.g. lint the file at HEAD), report it in the final summary, and move on — fix it only if asked.
- **Ship protocol (2026-09-03):** `docs/SHIP-PROTOCOL.md` is binding — tiers, the red-team review subagent for Tier 2, the production invariants, rollback. Read it before the first commit of every session.
- **Plan before editing.** Read the relevant files and write a short plan (files per phase, order, risks) before changing anything.
- **Diagnose root cause before fixing.** Never patch a symptom; explain the cause, then fix it at the source.
- **One commit per phase.** After each phase run unit tests, `npm run build`, and the e2e suite, and fix any regression *before* committing.
- **Never trust comments over code.** Verify behaviour in the code itself; comments may be stale.

## Voice and copy (full text: `docs/ledger/principles.md`, `docs/ledger/founder-copy.md`)

- Copy approved by Ien is verbatim-only. Never rewrite, expand, or "improve" approved copy without his explicit approval. The current About copy (founder-approved 2026-07-21, three sections: "What is Deepcast?" / "Who is it for?" / "Who made this?") lives in ONE place — `src/components/AboutContent.jsx` — rendered by both the `/about` page and the dashboard's About popup so the two can never drift.
- Every founder-stamped string, its history, and the invitation/ticket vocabulary split are in `docs/ledger/founder-copy.md` — grep it before rendering or changing any user-facing string. "Reward, never extract" (founder, 5 September 2026) supersedes the old "no engagement mechanics" law; streaks, urgency, loss framing, guilt, variable rewards, pull-back notifications and shaming comparison stay banned.

## Git & deploy — the tiers in brief (binding: `docs/SHIP-PROTOCOL.md`, read it before the first commit of every session)

| Tier | What | How it ships |
| --- | --- | --- |
| 1 | docs, tests, tooling, creator/admin-only surfaces and routes | commit on `main`, PUSH after green gates |
| 2 | anything a real viewer touches, shared `src/lib` rules, claim/link/create-link routes, deletion/protection modules, founder copy | branch → red-team review subagent → full e2e on three engines → push branch → PR; the founder merges after the independent verifier (Cowork) walks the Vercel preview |
| 3 | migrations, data scripts, film-row edits, env/auth config | founder executes, always, after a backup |

- Production auto-deploys from `main` (Vercel frontend, Render API at `deepcast-virginia.onrender.com`); GitHub CI runs lint, unit, build and e2e on every push and PR; `main` is deliberately not branch-protected — a red CI run on `main` is automatically the next task.
- One commit per phase/feature, with a plain-English commit message.
- The owner is **non-technical**: final reports, commit summaries, and anything they will read must be plain English, not jargon.
- **Denied git and shell operations** (`.claude/settings.local.json` deny list — never attempt them, never ask for a workaround): `rm`, `sudo`, `git reset` (including `--hard`), any force push, `git push --delete`, `git branch -D`, `git clean`, `git rebase`, `git filter-branch`, and `cleanup-test-nodes.js --execute`.
- **End-of-day reconciliation (founder rule, 2026-07-24):** CLAUDE.md, the ledgers it points to, and `docs/PROJECT-BRIEF.md` are reconciled against shipped reality and committed — every claim verified against the code, never against anyone's narration. CLAUDE.md is the IMPLEMENTATION layer; PROJECT-BRIEF.md the STRATEGY layer; dated detail goes to the matching `docs/ledger/` file.

## Gate commands

- Every phase: `npm run test:unit`, `npm run build`, and the e2e suite on all three engines (chromium, webkit, firefox), unmasked, before committing. Local dev: Vite on port 3000, Express API on 3001 (the API refuses to start on 3000). Read-only database reads go through `node server/db-read.js "select ..."` — never the Supabase MCP connection.

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

## The ledger index — what each file holds and when to read it (grep, never whole)

- `docs/ledger/films.md` — the three films (ids, videos, posters, ledgers), the real-user and film-level protection rulings, the A Sacred Pause stopgaps, the test-film rule. Read before touching film rows, data scripts, or anything on Circles.
- `docs/ledger/doctrine.md` — the full text of every standing doctrine, the security doctrine, the standing product rules, the ABSOLUTE production-change rule paragraph. Read when a law above needs its full wording.
- `docs/ledger/claim-flow.md` — the landing page, every invite/claim/return route, per-film tickets, ticket numbers, ordinal freeze, lineage thread, one tier, who-exists, the canonical-name rule, reach. Read before touching invite, claim, ticket, or naming code.
- `docs/ledger/watch-page.md` — the watch page (rail, path, onward seat, pass-it-on modal, film mode, player), the comments routes, the standing content rules; binding spec `docs/watch-page-spec.md`. Read before touching ClaimWatch, filmStory, or comments.
- `docs/ledger/dashboard.md` — the V5 viewer dashboard, the creator/admin surfaces, dashboard behaviour, the canonical graph model, NetworkGraph. Read before touching Dashboard.jsx, ViewerDashboardV5.jsx, or admin surfaces.
- `docs/ledger/constellation.md` — the constellation's layout laws, knobs and measurements, and every pass from 10 September to the 17 September FINAL LOCK. Read only for constellation layout or renderer work.
- `docs/ledger/emails.md` — the email-sending doctrine, the ticket email and return link, the hourly reminder sweep, the LEGACY email-first invite flow. Read before touching anything that sends mail.
- `docs/ledger/founder-copy.md` — every founder-approved string and its history, the invitation/ticket split, the About page and popup. Read before rendering or changing any user-facing string.
- `docs/ledger/canonical-stats.md` — which `src/lib` module owns each displayed number. Read before showing any number on any surface.
- `docs/ledger/principles.md` — platform principles and the voice/copy rules. Read before writing copy or making a product decision.
- `docs/ledger/engineering.md` — tech stack, the push policy, testing and CI (Playwright manual install, the shared e2e harness), code style, environment, auth, important notes, known limitations. Read when setting up, running gates, or touching CI/auth/config.
- `docs/ledger/backlog.md` — parked and approved-not-built items (do not re-debate), the A5 remainder, accepted MVP limitations, the two-film dashboard bug, backups. Read before proposing new work or reopening an old decision.
- `docs/ledger/e2e-flakes.md` — every recorded e2e flake sighting and the widened investigation. Read when a suite fails on a documented-flake spec.
- `docs/ledger/history-2026-09.md`, `history-2026-08.md`, `history-2026-07.md` — the dated batches. Read for the origin of a decision.
- Also binding, not ledgers: `docs/SHIP-PROTOCOL.md` (tiers, red-team checklist, invariants, rollback), `docs/watch-page-spec.md` (watch page + constellation spec), `docs/PROJECT-BRIEF.md` (strategy).
