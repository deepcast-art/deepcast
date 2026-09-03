# Ship protocol — how changes reach production without breaking real users

*Founder decision, 3 September 2026. Supersedes "commit only, never push" everywhere it appears in CLAUDE.md. Written by the verifying agent (Claude in Cowork) after the creator-dashboard batch shipped that day; the founder asked for the easiest workflow that still guarantees nothing breaks for the real people on Circles.*

## The principle

**Nothing that grades its own work is a gate.** The false-green incident (31 July) and the ghost-script abort (3 September) both came from one agent checking itself. So the protocol has three roles and three automatic layers, and the manual step survives only where a real viewer could be hurt.

- **Claude Code** builds. It plans, diagnoses root causes, writes tests, runs the gates unmasked, commits, and — under this protocol — pushes.
- **The verifier** (Claude in Cowork, with the repo folder, the Supabase read connection, Vercel, and the founder's Chrome) independently checks the diff, walks the deployed page, and runs the production invariants below. It never edits code and never writes production data.
- **The founder** pastes the builder's report to the verifier, clicks Merge on Tier 2, and personally executes Tier 3. That is the whole manual surface.

Automatic layers that depend on no one's honesty: **CI on GitHub** (lint, unit, build, e2e on all three engines — required to be green before merge), **Vercel's build gate** (a failing build never deploys), and **the production invariants** (SQL, below), run by the verifier after every deploy and by Claude Code via `node server/db-read.js` before any commit that touches data paths.

## The tiers — decided by what the change touches, not by how big it is

### Tier 1 — Claude Code ships alone (push to `main` after green gates)

Docs; tests; dev tooling; the creator/admin dashboard (`src/pages/Dashboard.jsx` creator branch, `CreatorLinkPanel`, `TicketControlsPopover`, `RemovePersonPopover`, the graph modal); admin-only server routes (`/api/admin/*`, `/api/films/:filmId/watch`); scripts that do not write production; anything under `e2e/`; `docs/`.

Flow: plan → build → gates (unit, lint, build; e2e when any UI file moved) → one commit per phase → `git push origin main` → plain-English report. The founder pastes the report to the verifier, who confirms the Vercel deploy is READY, walks the changed surface live, and runs the invariants.

### Tier 2 — a second pair of eyes before it is live (branch + PR + preview)

Anything a real viewer touches, or that decides who exists, who is protected, or what a ticket is:

`src/pages/ClaimLanding.jsx` (landing + prologue) · `src/pages/ClaimWatch.jsx` and `docs/watch-page-spec.md` · `src/pages/ViewerDashboardV5.jsx` · `src/pages/ReturnGate.jsx`, `Login.jsx`, `src/lib/auth.jsx`, `ProtectedRoute`/`ViewerShareGate`, `src/App.jsx` routes · every shared rule in `src/lib/` that a viewer page reads (`inviteExistence`, `constellationLayout`, `constellationLabels`, `journeyLine`, `ticketRows`, `displayName`, `filmClaims`, `viewerTiers`, `handsChain`, `lineageThread`, `lineageForks`, `revealTicketsLine`, `firstNameRule`, `shares`, `resumePosition`, `screeningCard`, `safeStorage`, `chunkReloadGuard`) · `src/content/filmStory.js` · `src/components/ConstellationMap.jsx`, `ShareLinkModal`, `ChunkErrorBoundary` · server: `/api/invites/create-link`, `/api/invites/link/:slug`, `/api/invites/claim`, `/api/invites/replenish-check`, `server/watchPayload.js`, `server/claimIdentity.js`, `server/claimNameRule.js`, `server/filmWallet.js`, `server/claimantWallet.js`, `server/voidRules.js`, `server/shareRules.js`, `server/inviteSlug.js`, `server/inviteValidation.js`, `server/deleteRules.js`, `server/teamRules.js`, `server/adminAuth.js`, `next_ticket_no` and anything touching `ticket_no`/`ticket_seq` · `index.html` (the og block) · `vercel.json` · `package.json` dependencies · any founder copy.

Flow:
1. Plan, diagnose, build on a branch named for the change.
2. **Adversarial review before commit:** spawn a fresh-context review subagent with the checklist in §Red-team checklist. It reports findings; Claude Code fixes or explains each one in the final report. A change with an unaddressed finding does not get committed.
3. Gates unmasked — unit, lint, build, **full e2e on chromium + webkit + firefox** — summary lines quoted, exit codes checked.
4. Commit, `git push origin <branch>`, open a pull request (`gh pr create` when available; otherwise paste the compare link GitHub prints on push). CI runs; Vercel builds a **preview deployment** for the branch.
5. Report in plain English: what changed, root causes, the review subagent's findings and their fates, the gate summary lines, the PR link and the preview URL.
6. The founder pastes the report to the verifier. The verifier reads the diff, walks the preview in Chrome (preview builds hit the production API and database read-only — never claim, never mint, never submit on a preview), and runs the invariants.
7. If the verifier says merge, the founder clicks **Merge** (squash or merge commit — either, but never rebase, so `main` history stays linear-readable). Vercel and Render deploy `main`. The verifier confirms READY, walks production, runs the invariants again.
8. If the verifier says no, the finding goes back to Claude Code as the next prompt. Nothing reaches production.

Preview limitation to keep in mind: Render deploys only `main`, so a server-side Tier 2 change cannot be exercised on a preview; the branch's frontend preview talks to the *current* production API. For those, the review subagent + unit tests are the pre-merge gate, and the verifier's post-merge production walk is mandatory and immediate.

### Tier 3 — production data and configuration (founder executes, always)

Migrations, data scripts, ticket-counter changes, `films` row edits (video swaps, `show_ghosts`, titles), Vercel/Render environment variables, Supabase Auth settings, Mux asset deletion, anything in `PROTECTED_EMAILS`/`PROTECTED_FILM_IDS`.

Flow: Claude Code writes the script or states the exact change, dry-run by default, typed-phrase confirmation, JSON backup of every affected row BEFORE the write, hard-abort guards on every named condition, and shows the founder the exact rows. The founder runs it. The verifier confirms the after-state with independent queries. The 2026-07-21 ABSOLUTE RULE stands: no production change without the founder's approval in that session, and a permission prompt is not approval.

## Red-team checklist (the review subagent's brief — Tier 2, every time)

Fresh context. Read only the diff plus the files it touches. Answer each in writing with file:line evidence, or "not applicable, because…":

1. **Real users first.** Could this change alter what any person on Circles sees, gets, or can do — landing, prologue, watch page, dashboard, ticket count, name, lineage? If yes, is the before/after for a claimed viewer AND an in-flight recipient shown by a test?
2. **The slug path is byte-identical** unless the change is *meant* to alter it. Which e2e proves it?
3. **Who-exists.** Does every new surface read `inviteExistence.js`? Any private filter, any inline stat math, any second definition of a number?
4. **Identity from the token only.** Any route that takes a user or creator id from the client? Any privileged endpoint not pinned to the verified session (`supabase.auth.getUser(jwt)`)?
5. **Deletion and protection.** Does anything widen what the admin Remove flow, a script, or a cascade can delete? Does `PROTECTED_FILM_IDS`/`PROTECTED_EMAILS` still cover every path?
6. **Tickets are immutable.** Any path that renumbers, resets `ticket_seq`, or mints without `next_ticket_no()`?
7. **Founder copy verbatim.** Any string that a real viewer reads changed without an explicit founder decision recorded in the prompt?
8. **Storage and Safari.** Any raw `localStorage`/`sessionStorage`? Any storage access outside `safeStorage.js`? Restricted-storage test present?
9. **Deploy safety.** Could a mid-visit deploy strand a page (chunk names, dual-key transition for content keyed by ids)? Does `ChunkErrorBoundary` still wrap the router alone?
10. **Secrets.** Any `.env` value, key, or token in code, tests, logs, or the report?
11. **Tests that test.** Does every new test fail if the change is reverted? Name one assertion per new behaviour that would.
12. **What would I attack?** One paragraph: the single most likely way this change breaks a real person's experience, and whether the diff defends against it.

## Production invariants (run after every deploy; every one must hold)

Read-only. The verifier runs these through the Supabase read connection; Claude Code runs them through `node server/db-read.js` before any commit on a data path. Circles is `6a9c0c79-24f6-427e-ba34-c113acf92d9f`.

```sql
-- 1. Circles: every row is a numbered ticket; no ghosts; no voids unaccounted for
select count(*) as rows_total,
       count(*) filter (where ticket_no is null) as unnumbered,          -- expect 0
       count(*) filter (where recipient_email like '%@demo-deepcast.invalid') as ghosts, -- expect 0
       count(*) filter (where status = 'void') as voids                  -- expect 0 unless a duplicate claim happened (ledger it)
from invites where film_id = '6a9c0c79-24f6-427e-ba34-c113acf92d9f';

-- 2. Circles: numbers are unique, start at 2, end at ticket_seq
select min(ticket_no) as first, max(ticket_no) as last,
       count(distinct ticket_no) as distinct_numbers, count(*) as numbered,
       (select ticket_seq from films where id = '6a9c0c79-24f6-427e-ba34-c113acf92d9f') as ticket_seq
from invites where film_id = '6a9c0c79-24f6-427e-ba34-c113acf92d9f' and ticket_no is not null;
-- expect first = 2, last = ticket_seq, distinct_numbers = numbered

-- 3. No lineage points at a missing row (any film)
select count(*) as dangling_parents from invites
where parent_invite_id is not null and parent_invite_id not in (select id from invites);  -- expect 0

-- 4. Every claimed Circles row has an account that exists
select count(*) as claimed_without_account from invites i
where i.film_id = '6a9c0c79-24f6-427e-ba34-c113acf92d9f' and i.claimed_by is not null
  and not exists (select 1 from users u where u.id = i.claimed_by);  -- expect 0

-- 5. The named protected people still exist
select email from users where email in
 ('oliver@marionecological.com','bmahan@uchicago.edu','imyme2024@gmail.com','filmmaker@gmail.com')
order by email;  -- expect all four

-- 6. Film flags nobody should have flipped by accident
select id, title, show_ghosts, mux_playback_id, creator_ticket_no from films order by title;
-- Circles: show_ghosts false, playback QDUEUyF7WDjjsOtMfeVfqh6M2NVM02arzLHK3IJnwYC00, creator_ticket_no 1

-- 7. The other films did not move unless the change said so
select film_id, count(*) from invites group by film_id order by film_id;
-- baseline 2026-09-03: Circles 33 · The New Narrative 83 · A Sacred Pause 58
```

Live walk, every deploy (the verifier, in Chrome, signed in as the founder): `/dashboard` renders and the Circles card's three numbers equal invariant 1 and 2's rows; "See network graph" opens; "Watch page" opens with the tickets-shared count matching; one in-flight landing link (e.g. a `ticket-…` slug with status `created`) renders the letter — **never submit it**. After a Tier 2 change to the viewer dashboard, also open one claimed viewer's constellation via the graph modal's hover and confirm names render.

## Rollback

- **Frontend:** Vercel → Deployments → previous READY deployment → "Instant Rollback". Under a minute. The verifier can identify the deployment id; the founder clicks.
- **API:** Render → Deploys → previous deploy → "Rollback". Or `git revert <sha>` on `main` (Tier 1 push) and let both redeploy.
- **Database:** there is NO automatic backup on the Supabase free tier (tracker E8). Every data script writes its own JSON backup first, and that is the only net. **Standing recommendation (verifier, 3 September): enable Supabase Pro's daily backups / PITR for the production project.** With real users on Circles this is the single largest uncovered risk in the system; nothing in this protocol substitutes for it.

## What the founder does, in full

1. Prompt Claude Code. Paste its report to the verifier.
2. Tier 2: click Merge when the verifier says so.
3. Tier 3: run the command the builder wrote, type the phrase, paste the output to the verifier.

Everything else — pushing, deploying, checking, walking, invariants — is the builder's or the verifier's. If a step here needs the founder to do more than that, the protocol is wrong and gets amended, not worked around.

## First tasks under this protocol (Tier 1, Claude Code)

1. Add `.github/workflows/ci.yml`: on every push and pull request — `npm ci`, `npm run lint`, `npm run test:unit`, `npm run build`, then Playwright e2e on chromium, webkit, and firefox (install browsers in CI with `npx playwright install --with-deps`). Cache node_modules. Keep the run under ~10 minutes; if the e2e suite needs the real database, gate it on a repository secret and document that in the workflow.
2. Turn on branch protection for `main` in GitHub (founder clicks once: Settings → Branches → require the CI check to pass before merging; do not require reviews). Until then CI is advisory.
3. Reconcile CLAUDE.md and `docs/PROJECT-BRIEF.md` to this protocol at the next end-of-day.
