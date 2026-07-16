# Invite/Share Rework — Reconnaissance & Implementation Plan

Source of truth for scope/decisions: [deepcast-mvp-rework.md](deepcast-mvp-rework.md). This document is the engineering recon that plan calls for, plus a sequenced implementation plan for Phase 1. Read-only reconnaissance — no code was changed to produce this.

All file paths are relative to the repo root. Line numbers are as of `main` at the time of this recon (branch `invite-rework`, branched from `main` with no drift).

---

## 1. ARCHITECTURE MAP

### 1a. Current invite flow, end to end

**Token generation** — `server/index.js:223-227`
```js
function generateToken() {
  // 16 bytes → 32-char hex (128-bit). invites.token is `text` (no length cap), so no truncation.
  // Security of the invite-first sign-in flow leans on tokens being unguessable.
  return crypto.randomBytes(16).toString('hex')
}
```
32-char hex, cryptographically random. Contrast with the new design's short `{firstname}-{4char}` slugs, which are guessable/enumerable by design (see Open Questions §5 and Risk Register).

**Creation — `POST /api/invites/send`** (`server/index.js:374-701`). On success, inserts (`server/index.js:587-602`):
```js
.insert({
  film_id, sender_id, sender_name, sender_email,
  recipient_email: recipientEmailNorm, recipient_name: recipientName || null,
  recipient_last_name: recipientLastName,
  personal_note: personalNote || null,
  token, status: 'pending', expires_at: expiresAt.toISOString(),
  parent_invite_id: parentInviteId,
})
```
`recipient_last_name` is mandatory server-side (`server/index.js:399-405`, 400s on blank/whitespace — comment at line 399: *"Don't trust the client to enforce this."*). Three client surfaces collect it, all with hard-required validation:
- `src/components/InviteForm.jsx:64-67` (creator dashboard / Upload / Profile)
- `src/pages/InviteScreening.jsx:1289-1291` `handleSendLetter`, rendered by `src/pages/screening/DesktopPassItOn.jsx:153-154` / `MobilePassItOn.jsx:151-154,266-269`
- `src/pages/Dashboard.jsx:702-704` `handleSendModalInvite` (viewer's own invite modal)

**`parent_invite_id` resolution** (`server/index.js:507-580`): explicit client-claimed parent first; forced to `null` for creator/team-member senders (line 516, canonical-graph-model comment); otherwise three fallbacks in priority order — email-match (544-546), prior-sender-invite (547-550), watch-session-token (551-578) — resolved at line 566: `parentInviteId = fb1?.id || fb2?.parent_invite_id || null`.

**Email delivery**: `deliverEmail()` (`server/index.js:351`, built on `server/emailDelivery.js`) is awaited before `/api/invites/send` responds (line 673). Content built by `buildInviteEmailHtml`/`buildInviteEmailPlainText` (`server/index.js:2271-2381`, `2244-2269`) from `films.description`, `buildFilmGifUrl(film, filmId)`, sender/recipient names, personal note. The same two builders are reused by `/api/invites/resend-last` and `/api/invites/resend` (per template inventory below).

**Status lifecycle** — `invites.status` CHECK constraint (`supabase-schema.sql:58`): `'pending' | 'opened' | 'watched' | 'signed_up'`.
| Transition | Where |
|---|---|
| insert → `pending` | `server/index.js:599` |
| `pending` → `opened` | `server/index.js:2156-2157`, on first `GET /api/invites/validate/:token` |
| `opened` → `watched` | `src/pages/InviteScreening.jsx:1161-1166`, client-side Supabase update at ≥70% playback |
| `watched` → `signed_up` (passwordless) | `server/index.js:1591-1595` inside `replicateInviteLinkage()`, called from `/api/invites/session` |
| `watched` → `signed_up` (password signup) | `src/lib/auth.jsx:321-325` |

**Acceptance route** `/i/:token` (`src/App.jsx:158-164`, no guard) → `InviteScreening.jsx` → `api.validateInvite(token)` → `GET /api/invites/validate/:token` (`server/index.js:2130-2208`, no auth header check, service-role read, flips `pending`→`opened`, creates a `watch_sessions` row, returns `invite`, `film` (incl. `mux_playback_id`), sender/creator/team-member info, and **all** invites for the film for the graph).

**Account creation — two endpoints, different triggers**:
- `POST /api/invites/session` (`server/index.js:1774-1871`) — passwordless. Reads `recipient_name`, `recipient_last_name` from the invite (1792); on new account, `findOrCreatePasswordlessAccount()` (1653-1707) inserts into `users`: `id, email, name, first_name, last_name (from invite.recipient_last_name), role: 'viewer', invite_allocation: 5`. Mints an in-band session (`generateLink({type:'magiclink'})`, 1846) — client verifies without a second round trip.
- `POST /api/invites/claim-account` (`server/index.js:1416-1523`) — password signup path. Same `recipient_last_name` read (1437) and same `users` insert shape (1503-1511).

**Relink** `POST /api/invites/relink` (`server/index.js:1877-1906`) — verified-session pattern (Bearer JWT → `supabase.auth.getUser(jwt)` → identity from token only, 1883-1889), solves: an already-signed-in user opening a *different* invite link than the one their account's email is tied to; updates the opened invite's `recipient_email` to the account's email so it surfaces correctly on their dashboard, then re-runs the watched→signed_up + parent-linkage logic.

### 1b. Auth model

**Routes** (`src/App.jsx`, full inventory): `/` , `/i/:token`, `/signup`, `/login`, `/reset-password`, `/team/join`, `/unsubscribe` — all public, no guard. `/profile`, `/about` — `ProtectedRoute` (any logged-in role). `/dashboard` — `ProtectedRoute requiredRoles={['creator','team_member','viewer']}` + `ViewerShareGate` (viewers who've never sent an invite get routed to their own invite screening's share form). `/upload` — `ProtectedRoute requiredRole="creator"`. `/network` — `ProtectedRoute` + `ViewerShareGate`. `/dev` — gated by `DEV_HARNESS_ENABLED`, no auth guard. **No wildcard/404 route exists.**

`ProtectedRoute` logic (`src/App.jsx:53-77`): no `user` → redirect `/login`; no `profile` → redirect `/signup`; role mismatch → redirect `/profile`.

**Client session**: Supabase client (`src/lib/supabase.js:29-37`, anon key, `detectSessionInUrl: true`), session persisted to `localStorage` with in-memory fallback for restricted storage. `src/lib/auth.jsx:209-231` reads `getSession()` on mount; `onAuthStateChange` (233-258) keeps it live. `useAuth()` (494-500) exposes `{ user, profile, ... }`.

**Server verified-session pattern** (per CLAUDE.md security doctrine, `CLAUDE.md:128`): Bearer token → `supabase.auth.getUser(jwt)` → identity from the verified token only. Confirmed in `/api/invites/relink` (1883-1889), `/api/team/remove-member` (2052-2128, explicit comment: *"a client-sent creatorId is no longer accepted or read"*), and the `requireAdminCaller()` helper (1916-1944) used by `/api/admin/*`. **No global auth middleware** — `server/index.js:15-17` only wires `cors()` and `express.json()`; every privileged route inlines its own verification, duplicated per-route except for the one shared `requireAdminCaller()` helper.

**RLS** (`supabase-schema.sql`, cross-checked against migrations):
| Table | Policies |
|---|---|
| `users` | Row readable only by self (`auth.uid() = id`), plus two SECURITY DEFINER-backed cross-reads for team_creator_id relationships (`20260330_team_members.sql:68-80`). **Confirms CLAUDE.md's claim: users rows are NOT readable cross-role.** |
| `films` | `"Anyone can read films" FOR SELECT USING (true)` |
| `invites` | `"Anyone can read/insert/update invites" USING (true)` for all three commands — **fully open at the RLS layer**; real authorization is 100% server-side/inline. |
| `watch_sessions` | Same — open SELECT/INSERT/UPDATE. |

Practical effect for the invite-screening flow: the anon client never queries `users` directly (server uses service-role for sender/creator lookups); it reads `invites`/`films` under the open `true` policies. **This means no RLS changes are needed to support the new claim-link flow** — inserts/updates to `invites` from a service-role-backed server route are already unconstrained by RLS, and even a hypothetical direct-from-browser write would already be permitted by policy (though the app doesn't do this today; all writes go through server routes).

### 1c. Playback chain — decision A6, resolved

**Direct answer: NO Supabase authenticated session is required anywhere between opening `/i/:token` and the video playing.** Evidence, in order:

1. Route guard: `src/App.jsx:159-164` — `/i/:token` has no `ProtectedRoute` wrapper.
2. Client fetch: `src/lib/api.js:55-63` `validateInvite()` — plain `fetch`, no `Authorization` header.
3. Server endpoint: `server/index.js:2130-2209` `GET /api/invites/validate/:token` — no Bearer-token check, no `supabase.auth.getUser()` call (unlike `/api/invites/relink`); uses the service-role client, which bypasses RLS entirely; returns the full `film` row (including `mux_playback_id`) to anyone who supplies a valid token string.
4. RLS: `films` policy is `USING (true)` — even a direct anon-key read would succeed.
5. Mux asset creation: `server/index.js:157-177`, `POST /api/mux/upload` — `new_asset_settings: { playback_policy: ['public'], ... }`. **Public policy, not signed.**
6. Player: `src/pages/InviteScreening.jsx:1743-1784` — `<MuxPlayer playbackId={film.mux_playback_id} ... />`, no signed-URL/JWT minting anywhere in between; `@mux/mux-player-react` talks to the public Mux CDN directly.

**Product implication for the rework**: A4/A5/B1 can proceed on the "no session needed" branch. A claimed link can go straight to a watch page with zero account creation and zero Supabase session — email capture at claim (A4) is purely for the 48h reminder (B3) and future account linkage (E2), not a playback gate. This significantly simplifies A2/A4: "claiming" does not need to mint any auth session at all in Phase 1.

### 1d. Existing graph/lineage mechanism

**Schema**: `invites.parent_invite_id uuid references invites(id) on delete set null` (`supabase-migration-parent-invite.sql:2-5`), indexed (`idx_invites_parent_invite_id`).

**Edge recording**: see §1a above (`server/index.js:507-580`).

**Graph construction**: `buildGraphLayout()` (`src/lib/graphLayout.js:358-739`) takes the full `filmInvites` array (not a single-user slice) plus `creatorId`/`teamMemberIds`. Per-invite parent resolution priority (413-428): creator-sender → root; team-member-sender → that member's ring-1 node; stored `parent_invite_id` (if it resolves to a real invite) → that invite; else email-match repair against `earliestByRecipient` (389-397); else an ad-hoc `member:` node. The filmmaker is never a separate user node — they *are* the central `film`-type root node (535-553). Team members render as ring-1 `type:'member'` nodes (570-601).

**`resolveViewerFocus()`** (`graphLayout.js:320-356`) — three-strategy resolution for "which node is me": email match (324-338) → invite token (342-345) → common parent of my own sent invites (349-353).

**No standalone ancestor-chain walker exists.** The only upstream traversal is post-graph-construction, inside `buildGraphLayout` itself (698-707: walks `reverseLinks` from a viewer node back to root to compute default-highlighted nodes/links for the SVG). **C2's "this film reached you through: A → B → you" text feature will need new code** — it cannot reuse a smaller existing utility; the cheapest correct approach is a small new function that walks `parent_invite_id` directly from a single invite up to root (a simple loop against a `Map` built from one `select` of the film's invites — same data `buildGraphLayout` already receives, just consumed differently), not a full graph build.

**Consumers**: `src/pages/NetworkMap.jsx` (fetches all invites per film, calls `buildGraphLayout`, passes to `NetworkGraph`) and the dashboard's inline network graph (same pattern). A test/demo endpoint also exists: `GET /api/graph/layout/:filmId` (`server/index.js:101-152`).

**RLS note**: no restriction needed — invites are already openly readable (`USING (true)`), which is what full-graph and ancestor-chain construction both rely on today.

---

## 2. DATA MODEL

### Current schema (invites, users, films)

**`invites`** (base: `supabase-schema.sql`; additions: `supabase-migration-parent-invite.sql`, `supabase/migrations/20260617_invites_recipient_last_name.sql`):

| Column | Type | Null? | Constraint |
|---|---|---|---|
| id | uuid | NOT NULL | PK |
| film_id | uuid | NOT NULL | FK → films, ON DELETE CASCADE |
| sender_id | uuid | nullable | FK → users, ON DELETE SET NULL |
| sender_name, sender_email | text | nullable | — |
| recipient_email | text | **NOT NULL** | — |
| recipient_name | text | nullable | — |
| recipient_last_name | text | nullable | added by `20260617_invites_recipient_last_name.sql` |
| personal_note | text | nullable | — |
| token | text | **NOT NULL** | **UNIQUE** |
| status | text | NOT NULL | CHECK in `('pending','opened','watched','signed_up')` |
| expires_at | timestamptz | NOT NULL | — |
| parent_invite_id | uuid | nullable | FK → invites, ON DELETE SET NULL |
| created_at | timestamptz | nullable | default now() |

No composite unique on `(film_id, recipient_email)` — dedup is enforced in application code (`server/index.js:452-454`), not the DB.

**`users`**: `id, email (UNIQUE NOT NULL), name (NOT NULL), first_name, last_name, role (CHECK in creator/viewer/team_member), invite_allocation (default 5), team_creator_id (FK, from `20260330_team_members.sql`), unlimited_shares (bool, default false, from `20260612_users_unlimited_shares.sql`), created_at`.

**`films`**: `id, creator_id (FK), title (NOT NULL), description, mux_asset_id, mux_playback_id, thumbnail_url, status (CHECK processing/ready), gif_start, gif_end (from `20260602_films_gif_timecodes.sql`), created_at`.

`supabase-schema.sql` is confirmed current as the base layer; it's missing only the columns added by the later dated migrations, which is the documented/expected pattern (migrations layer on top, not folded back into the base file).

### Mapping A2's required claim-bind fields onto the schema

A2 asks for: `token`, `invitee_first_name`, `created_by`, `claimed_by`, `claimed_at`, `status`.

| A2 field | Schema reality | Verdict |
|---|---|---|
| `token` | `invites.token` already exists, UNIQUE NOT NULL | **Reuse.** Note: existing tokens are 32-char unguessable hex; the new design's public-facing slug (`{firstname}-{4char}`) is a *different, low-entropy, intentionally-typeable* string. Recommend NOT overloading `token` for both — see Open Questions §5 for the slug-vs-token relationship. |
| `invitee_first_name` | `invites.recipient_name` already exists, nullable, already first-name-only by convention | **Reuse** — same column, same meaning, no migration needed. |
| `created_by` | `invites.sender_id` already exists, nullable FK → users | **Reuse conceptually**, but tighten: A2 says "identify sharer via their authenticated session" — the *new* create-link endpoint should populate this from a **verified** session (per security doctrine, `CLAUDE.md:128`), not from client-submitted data the way some current paths do. |
| `claimed_by` | **Does not exist.** | **RESOLVED (2026-07-06):** nullable `users.id` FK, empty at claim time, backfilled later by email match only if/when the person creates an account (Phase 2, E2). Nothing in Phase 1 may depend on it being populated. |
| `claimed_email` / `claimed_at` | **Do not exist.** | **RESOLVED (2026-07-06):** `claimed_email` (text) + `claimed_at` (timestamptz) are the Phase 1 identity of a claim — the captured email at claim time IS the invitee's identity until an account exists later. New nullable columns, populated together on claim. |
| `status` | `invites.status` exists but its CHECK constraint only allows the four legacy values | **Needs an ALTER to extend (or replace) the CHECK constraint** with new-flow values (see below). |

**Existing-data migration cleanliness**: Adding nullable columns (`claimed_by`, `claimed_email`, `claimed_at`) and relaxing `recipient_email` from `NOT NULL` to nullable are both backward-compatible — existing rows are unaffected (old rows already have `recipient_email` populated; new link-based rows simply won't, until claim). Extending the `status` CHECK constraint to add new allowed values is also non-breaking to existing rows (a CHECK constraint addition of new *allowed* values, not removal of old ones, never invalidates existing data). **No existing row requires backfill.** The one real constraint change is **`recipient_email NOT NULL` must become nullable**, since A1 explicitly collects no email at share time — this is the one schema edit with any blast radius, and it's additive/permissive, not destructive.

**Recommended new/changed columns** (for the Implementation Plan to execute):
- `invites.recipient_email` — drop `NOT NULL` (needed for A1: link created before any email exists).
- `invites.claimed_email` (new, nullable text) — capture-time email (A4); the Phase 1 identity of a claim.
- `invites.claimed_at` (new, nullable timestamptz).
- `invites.claimed_by` (new, nullable `users.id` FK) — empty at claim time; backfilled by email match only if/when an account is created (Phase 2, E2).
- `invites.status` — extend CHECK to add new-flow values (exact vocabulary is an implementation detail to nail down at Step 1 build time, not a blocking open question — at minimum needs an "unclaimed/created" state distinct from legacy `'pending'` if the two flows are to be told apart in queries and the reminder job).
- `invites.link_slug` (new, nullable, unique index) — **RESOLVED (2026-07-06):** a new column, not an overload of `token`. The legacy `token` keeps its unguessable-by-design property untouched; `link_slug` is guessable-by-design and lives its own lifecycle. Format: `{sanitized-first-name}-{suffix}`, see the slug spec below.

**Slug spec — RESOLVED (2026-07-06).** The slug is routing only; display names always come from `invitee_first_name`/`recipient_name` in the DB, never parsed back out of the URL.
- Name part: Unicode-normalize, strip diacritics, drop all characters outside `a-z`, lowercase, max 20 chars. If nothing survives sanitization, falls back to the literal string `invite`.
- Suffix: 4 chars drawn from an unambiguous alphabet (excludes `0, o, 1, l, i`).
- Collision handling: regenerate the suffix up to 3 times; if still colliding, widen to a 5-char suffix.
- Profanity filtering beyond the existing reserved-route blocklist (`login, signup, profile, about, dashboard, upload, network, dev, team, unsubscribe, reset-password, i`) is explicitly deferred to Phase 2 (E5) — not a Phase 1 blocker.

**`recipient_last_name` / `users.last_name`**: per the decisions log, both stay in schema, dormant, no migration. Confirmed clean by dedicated recon: **zero downstream reads** of `users.last_name` exist anywhere in `src/` or `server/` outside the known write sites (`src/lib/auth.jsx:40,169`, `src/pages/Signup.jsx:24`, `server/index.js:1041,1358,1508,1634,1695`) — no display-name concatenation, no NOT NULL check, no template assumes it's populated. Safe to leave dormant exactly as decided.

---

## 3. RISK REGISTER

Per Phase 1 item:

**A1 — Shareable claim link generation**
- Route collision: current top-level routes are all fixed literal strings without hyphens (`/login`, `/signup`, `/profile`, `/about`, `/dashboard`, `/upload`, `/network`, `/dev`, `/reset-password`, `/unsubscribe`, plus nested `/team/join`, `/i/:token`). Because the new pattern is always `{firstname}-{4char}` (hyphen + exactly 4 chars), it cannot literally collide with any fixed route string above (none of them contain a hyphen). The real risk is **route ordering**, not string collision: React Router matches top-down, and there is currently **no wildcard/404 route at all** — adding a new `/:slug` catch-all must be placed *last* so it never shadows a future fixed route, and the app needs a real "invite not found" render path for slugs that don't resolve (today, an unmatched path renders nothing).
- Low-entropy slugs (a first name + 4 chars, versus today's 32-char hex `token`) are guessable/enumerable. Combined with `"Anyone can read invites" USING (true)`, a wrong or guessed slug can be probed against the DB with no rate limiting visible anywhere in `server/index.js`. Recommend the create-link endpoint sit behind normal per-request rate limiting (none currently exists for `/api/invites/*` — confirm before shipping).

**A2 — Claim-bind logic**
- Race condition: "first non-sharer to open and claim it becomes the invitee" requires an atomic conditional update (`UPDATE ... WHERE claimed_email IS NULL RETURNING ...`), not a read-then-write — a naive implementation double-claims under concurrent requests.
- "Sharer opening their own link does not claim it" depends on comparing the opener's authenticated session to `created_by`; the tracker's own accepted edge case (logged-out opens on the sharer's own device) means this check is soft by design — worth a one-line note in the UI copy so it's not read as a bug later.

**A3 — Personalized landing page**
- No functional risk; this is new UI on a new route. Copy is explicitly TBD (marked in the tracker) — do not let engineering block on final copy; ship with placeholder text behind the same component structure D2 will polish.

**A4 — Email capture at claim**
- Given §1c's finding (no session ever required for playback), there's no forcing function to create a Supabase account at this step — resist the temptation to "helpfully" mint one anyway; that would be new scope not in the tracker (E2 is deliberately Phase 2).

**A5 — Retire the bulk email-invite tool** *(decided 2026-07-06 — see Open Questions §4, resolved)*
- **RESOLVED**: retirement, not just demotion. All invite *creation* moves to link-only sharing; the three email-send surfaces (`InviteForm.jsx`, the pass-it-on letter, the dashboard invite modal) are removed/hidden. **Biggest cross-cutting risk in the whole plan, still live under this decision**: `/i/:token` and its full status-machinery (`opened`→`watched`→`signed_up`, watch_sessions, relink) **must keep working indefinitely** for every invite already sent under the old flow — the decision explicitly says so ("the legacy acceptance path... stays untouched indefinitely — invite links never expire, per CLAUDE.md"). Do not delete or disable the `/i/:token` acceptance path, `buildInviteEmailHtml`/`buildInviteEmailPlainText`, or the underlying data those legacy rows depend on. Those templates are also reused by `/api/invites/resend-last` and `/api/invites/resend` (`server/index.js`) — **still open**: the decision doesn't address whether those two resend routes are kept (for people re-requesting an already-sent legacy invite) or retired alongside the send surfaces; confirm before touching the builders (Open Questions §3).
- `server/preview-email.js` is a known-drifted, non-canonical copy of the email builder (per CLAUDE.md) — do not use it to judge whether the "old" email templates are safe to touch; it's already out of sync with the real one and isn't proof of anything about production behavior.

**A6 — Resolved**, see §1c. No residual risk to flag; this was purely a research gate and the answer removes a dependency, not adds one.

**B1 — Post-claim → watch page**
- The watch page currently lives entirely inside `InviteScreening.jsx`, which is coupled to `/i/:token` and its token-based validate/status logic. The new claim flow needs the *same* Mux player and post-film UI without dragging along the legacy token/status assumptions. Recommend extracting the player + post-film-share UI into a shared component consumed by both `/i/:token` (legacy) and the new claim-landing route, rather than duplicating ~1700 lines of `InviteScreening.jsx`.

**B2 — Length/conditions line**
- Pure copy, zero risk, shared string constant recommended so it can't drift between the two surfaces it appears on (landing page + film page) — same "one shared computation" doctrine CLAUDE.md already applies to stats.

**B3 — Single reminder email**
- **No scheduling/cron infrastructure exists anywhere in the codebase** (confirmed by explicit grep for cron/setTimeout/scheduled/reminder — the only `setTimeout` usage is a client fetch timeout and the email dispatcher's retry backoff, neither of which is a job scheduler). This is **net-new infrastructure**, not a small addition — budget it as its own step, likely an external cron (e.g., a Render cron job or Supabase scheduled function hitting a new authenticated `/api/internal/send-reminders` endpoint), guarded so it can't be triggered by a public request.

**C1 — Transmission story text**
- Content task per the tracker (Ien writes); no schema risk if stored as new nullable `films` columns (e.g., `transmission_note_short`, `transmission_note_full`) alongside existing `description` — additive only.

**C2 — Lineage visibility**
- Needs new code (§1d) — not a risk exactly, but don't let it get built by extending `buildGraphLayout`'s output; a parallel lightweight function avoids coupling a text feature's correctness to the SVG graph's rendering assumptions.
- **RESOLVED (2026-07-06), unified model**: the new flow populates `invites.parent_invite_id` exactly as the old flow does — parenthood runs invite-to-invite, so a new claim link's `parent_invite_id` = the invite its sharer claimed through. `NetworkMap`/`NetworkGraph` and C2's ancestor-chain walk both stay on one data model with no branching on invite "shape." This resolves a design gap in A2's original spec: sharer identity for the new create-link endpoint is now **either** an authenticated session (account-holder sharers) **or** a valid claimed invite referenced client-side (accountless invitees sharing at credits-end via C3, who have no session — their claim IS their identity). See the A2 amendment recorded in `deepcast-mvp-rework.md`. Implementation note: the account-holder branch should reuse the *existing* parent-resolution fallback logic (`server/index.js:518-580` — email-match, prior-sender-invite, watch-session-token) rather than reinventing it, since that logic already answers "which invite did this sender receive the film through."
- Residual note on the accountless-identity mechanism: whatever the client stores (cookie/localStorage) to prove "I am the person who claimed invite X" at share-time is not a cryptographic session — it carries the same trust level as already knowing that invite's `link_slug` (which is guessable-by-design per the slug spec). This is consistent with the app's existing no-auth trust model for playback (§1c) — worth a one-line acknowledgment in the build, not a blocker.

**C3 — Post-film share moment**
- Depends on B1's player/credits-end hook already existing in `InviteScreening.jsx` (there is a documented `hasMarkedWatched` ref and percentage-based logic at line ~1161-1166 this can piggyback on for detecting "credits end"). Low risk if built after B1's extraction.

**D1/D2 — Copy passes**
- Zero engineering risk; can ship independently and early.

**D3 — Update CLAUDE.md**
- Sequencing risk, not a code risk: if written before A-C land, it will document an aspirational design that may not match what actually ships (schema/UX decisions above have open questions). Recommend this run **last**, after Phase 1 behavior is stable — see Implementation Plan.

**Cross-cutting / not tied to one letter**:
- **RLS**: no changes required anywhere in this plan (confirmed in §1b) — `invites`/`films` are already open, `users` is already locked down and nothing in Phase 1 needs to read other users' profile rows.
- **Auth assumptions on the watch page**: none exist today (§1c) — nothing to break.
- **`users.last_name` dormancy**: confirmed safe, zero downstream reads (§2). No risk.

---

## 4. IMPLEMENTATION PLAN

Ordered so the app is deployable after every step. Each step names files touched, schema changes, new routes, blast radius, and how to verify before moving on.

**DESIGN AMENDMENTS (2026-07-16, from Ien's walkthrough review — these supersede conflicting notes below and in the tracker):**
- **Two-beat arrival principle.** The pre-claim landing page is a CLOSE-UP (an intimate letter to one person); the post-claim moment is the WIDE SHOT (the full network, revealing the world just joined). The landing page's lineage thread and the post-claim graph reveal are the same object at two scales. Nothing on the landing page may compete with the letter register.
- **Lineage thread (landing page).** A minimal horizontal chain of first-named nodes showing the invite's ancestry, between the sharer line and the film title. Depth ≤ 4 nodes renders every name; depth ≥ 5 collapses the middle to "⋯ N hands ⋯" preserving three anchors (origin filmmaker, direct sharer, "you"); truthful from depth 1 (filmmaker → you) through 50. This pulls the C2 ancestor-walk slice forward from Step 8 into the landing-page work. Rendering logic unit-tested; ancestry resolved server-side in the slug-lookup route (one film-scoped query + in-memory walk — measured cheap, no caching needed).
- **Post-claim graph reveal** (replaces D1's text welcome; supersedes C2's "not full graph viz" scoping). After a successful claim the invitee sees the existing NetworkGraph with their node newly added and their lineage path highlighted — brief and non-blocking, one tap to continue to the watch flow, never a gate.
- **Landing fixes**: logo/text overlap bug; legacy multi-word sharer names trimmed to first word on this page only; one quiet "You are the Nth person to be invited to watch this film." line (the ONLY written statistic permitted on the page).
- **Resequencing**: the graph reveal joins Step 4's claim beat. The watch beat ships first as a lean claim-flow watch view (Mux player + title + conditions only — none of the legacy prologue/resume machinery); Step 5's full shared-component extraction of `InviteScreening` remains planned but is no longer a blocker for the first walkable arc.

**Renumbered 2026-07-06**: the former "Step 1 — relax the last-name requirement" is **cut**. No step below it depends on the three old-flow send surfaces enforcing an optional (rather than mandatory) last name — nothing in Steps 1-9 touches `InviteForm.jsx`, the pass-it-on letter, or the dashboard invite modal at all, and Step 10 (old Step 11, A5) *retires those surfaces outright*. Fixing a validation rule on UI that's about to be deleted is wasted work; if a genuine dependency turns up during Step 10's build (e.g. a QA path that needs to exercise the old forms first), it can be done inline as part of that step rather than reserved as its own.

**Step 1 — Additive schema migration**
- New migration file: relax `invites.recipient_email` to nullable; add `invites.claimed_email` (nullable text), `invites.claimed_at` (nullable timestamptz), `invites.claimed_by` (nullable `users.id` FK, empty at claim, backfilled Phase 2), `invites.link_slug` (nullable, unique index, per the resolved slug spec in §2); extend the `status` CHECK constraint with new-flow values. `invites.parent_invite_id` needs no schema change — the unified lineage model (Open Questions §6) reuses it as-is for both old and new invites.
- *Blast radius*: additive/permissive only — no existing row is invalidated (see §2 analysis). Still requires the owner-run migration per standing doctrine (destructive-data rule doesn't strictly apply since nothing is deleted, but schema changes to production should still go through the owner's normal migration-apply step, not be run by Claude).
- *Verify*: `node server/db-read.js` spot-checks post-migration that old rows are untouched; confirm the CHECK constraint change doesn't reject any existing row (`db-read.js "select status, count(*) from invites group by status"` before/after).

**Step 2 — A1: claim-link generation**
- New server route (e.g. `POST /api/invites/create-link`). Two sharer-identity paths, per the resolved A2 amendment (§ Risk Register, C2): (a) verified session (Bearer token → `getUser()`, per security doctrine — never a client-sent sharer id) for account-holder sharers, resolving their own `parent_invite_id` via the *existing* fallback logic (`server/index.js:518-580`); (b) a valid claimed-invite reference for accountless credits-end sharers (C3), whose claim is their identity — `parent_invite_id` = that claimed invite directly. Slug generation per the resolved spec (§2): Unicode-normalize/strip diacritics/lowercase/`a-z`-only/max 20 chars, falling back to `invite`; 4-char unambiguous-alphabet suffix; retry the suffix up to 3 times on collision, then widen to 5 chars; reserved-word blocklist (`login, signup, profile, about, dashboard, upload, network, dev, team, unsubscribe, reset-password, i`).
- *Files*: `server/index.js` (new route), a small new `src/lib/` or `server/` slug-utility module (unit-tested per the project's "one shared computation" convention).
- *Verify*: unit tests for slug sanitization/collision-widen/reserved-word rejection, and for both sharer-identity paths resolving the correct `parent_invite_id`; no user-facing surface yet (nothing calls this route until Step 4), so this step alone can't break anything live.

**Step 3 — New public route `/:slug` + landing page skeleton (A3)**
- *Files*: `src/App.jsx` (new route, added **after** all existing fixed routes to avoid any future ordering ambiguity), new page component for the personalized pre-claim landing page, rendering the 6 content elements from the tracker with placeholder copy where D2 hasn't landed yet.
- *Blast radius*: purely additive route; nothing existing links to it yet.
- *Verify*: manual render at `/testname-a1b2` style URL against a seeded test invite; e2e smoke test for the new route rendering invitee's first name correctly and 404-ing gracefully on an unknown slug (this also fixes the "no catch-all today" gap noted in the Risk Register, scoped to this one new route rather than a global 404 page).

**Step 4 — A2: claim-bind endpoint**
- New route (e.g. `POST /api/invites/claim`), atomic conditional update (`UPDATE invites SET claimed_email=..., claimed_at=now(), status='claimed' WHERE id=... AND claimed_email IS NULL`) to avoid the race flagged in the Risk Register. `claimed_by` stays untouched (NULL) in Phase 1 — it is not this endpoint's job to populate it. Landing page's "Accept your invite" CTA wires to this.
- *Verify*: unit test for the race condition (concurrent claims resolve to exactly one winner); manual double-tab test.

**Step 5 — B1: extract shared watch-page component**
- *Files*: refactor `src/pages/InviteScreening.jsx` to extract the Mux player + post-film UI into a component reusable by both the legacy `/i/:token` flow and the new post-claim route, per the Risk Register's note on not duplicating ~1700 lines.
- *Blast radius*: real risk here is regressing the legacy flow during extraction — this is exactly the kind of change CLAUDE.md's "screening page mounts desktop AND mobile simultaneously" warning applies to; any visual verification must render the live app at the actual target viewport, not just read the code.
- *Verify*: full e2e suite on all three engines (chromium/webkit/firefox) before proceeding, since this step touches the highest-traffic existing surface. This is the one step in Phase 1 where regressing something *already shipped* (today's legacy invite flow, including real users' pending invites) is the dominant risk.

**Step 6 — A4/B2: email capture + immediate watch**
- Wire the landing page's post-claim step to write `claimed_email`/`claimed_at` (via Step 4's endpoint) then route straight into Step 5's shared watch component — no session minting, per §1c's resolved finding. Add the shared "14 minutes. Headphones recommended." string constant (B2) consumed by both the landing page and the watch page.
- *Verify*: manual full click-through, link → landing → claim → watch, zero auth prompts.

**Step 7 — C3: post-film share moment**
- Hook into the existing post-film / credits-end state in the now-shared watch component; inline first-name entry calls Step 2's create-link endpoint directly (accountless-sharer identity path), surfacing a shareable link immediately.
- *Verify*: e2e case for the new share-moment prompt appearing at the right playback point (reuse the existing `hasMarkedWatched`-style percentage logic rather than reinventing it).

**Step 8 — C2: lineage ancestor-chain text**
- New small function (not a `buildGraphLayout` extension, per Risk Register) that walks `parent_invite_id` from a single invite to root; render as "This film reached you through: A → B → you" on the landing/film page. No longer blocked — the unified lineage model (Open Questions §6) is resolved, so this step can build directly against `parent_invite_id` for both old- and new-flow invites.
- *Verify*: unit test for the chain-walk function against a small fixture graph (including the creator-is-root and team-member-ring-1 special cases already established in `graphLayout.js`).

**Step 9 — C1: transmission story content**
- New nullable `films` columns for short/long story text (additive migration), rendered on landing + film page. Content itself is Ien's, not engineering's.

**Step 10 — A5: retire the bulk email-invite tool**
- Remove or hide the "invite friends" entry points that lead to `InviteForm.jsx`/the pass-it-on letter/the dashboard invite modal — **do not touch** `/i/:token`, its status machinery, or `buildInviteEmailHtml`/`PlainText` themselves; both stay live indefinitely for already-sent legacy invites (decided 2026-07-06). `/api/invites/resend-last` and `/api/invites/resend` are **kept, unchanged** — resolved 2026-07-06: the invariant is creation vs. delivery; A5 retires *creation* of new email invites, resend re-delivers existing ones and is part of the protected legacy acceptance machinery.
- *Verify*: confirm via `node server/db-read.js` that no code path can still create a *new* email-first invite after this step, while an existing legacy token (test with a pre-existing seeded invite) still opens, resends, and plays correctly end to end.

**Step 11 — B3: reminder email, cheapest viable mechanism**
- Constrained scope (decided 2026-07-06): **one** new authenticated endpoint (e.g. `POST /api/internal/send-reminders`, not publicly callable) that queries claimed-but-unwatched invites past 48h and sends the single reminder via the existing `deliverEmail` dispatcher, plus **one** external daily cron trigger (a single Render Cron Job or equivalent hitting that one endpoint) — no standing scheduler, no job queue, no retry-scheduling framework beyond what `deliverEmail` already provides. A minimal idempotency guard (e.g. a `reminder_sent_at` column, additive) prevents double-sends across daily runs.
- *Verify*: `server/emailDelivery.test.js`-style unit coverage for the new template send path; manual dry run against a test invite claimed >48h ago via `db-read.js` seeded data; confirm a second same-day run sends nothing further.

**Step 12 — D1/D2: final copy pass**
- Replace placeholder copy from Steps 3/6/7/9 with Ien-approved final text across landing page, watch page, and share-moment prompt.

**Step 13 — D3: update CLAUDE.md**
- Run **last**, once Steps 1-12 have shipped and stabilized, so the doc describes what was actually built rather than the original tracker's aspirational shape. Update the "Invite send flow" and "Standing product rules" sections to remove the retired last-name-required rule and document the new link-based flow's actual schema/routes.

---

## 5. OPEN QUESTIONS

Requires a human decision — not assumed anywhere above:

1. **Slug vs. token — RESOLVED (2026-07-06).** New column, `link_slug`. `token` is not overloaded — it keeps its unguessable-by-design property for the still-live legacy flow; the slug is guessable-by-design and lives its own lifecycle.

2. **Slug sanitization/collision handling — RESOLVED (2026-07-06).** The slug is routing only; display names always come from `invitee_first_name`/`recipient_name` in the DB, never parsed from the URL. Spec: Unicode-normalize, strip diacritics, drop all chars outside `a-z`, lowercase, max 20 chars for the name part; falls back to `invite` if nothing survives sanitization. Suffix: 4 chars from an unambiguous alphabet (excludes `0, o, 1, l, i`). Collision: regenerate the suffix up to 3 times, then widen to 5 chars. Profanity filtering beyond the reserved-route blocklist is deferred to Phase 2 (E5).

3. **Fate of already-created invites under the old flow — RESOLVED (2026-07-06).** `/i/:token` and its status machinery stay untouched indefinitely for already-sent invites; no plan to migrate, invalidate, or force-resend old invites under new slugs. `/api/invites/resend-last` and `/api/invites/resend` are **kept, unchanged** — the invariant is creation vs. delivery: A5 retires *creation* of new email invites, resend re-delivers existing ones and is part of the protected legacy acceptance machinery.

4. **Does the creator/Upload/Profile invite flow also move to link-based sharing, or only viewer-to-viewer shares? — RESOLVED (2026-07-06).** Retired. All invite creation — creator dashboard, Upload, Profile, and the viewer pass-it-on/dashboard-modal surfaces — moves to link-only sharing; the bulk email-invite tool is removed/hidden as part of Step 10 (A5). The legacy `/i/:token` acceptance path and its email templates stay untouched indefinitely (see §3 above).

5. **`claimed_by` semantics — RESOLVED (2026-07-06).** Split: `claimed_email` (text) + `claimed_at` (timestamptz) capture the invitee's Phase 1 identity at claim time — the email captured at claim IS the identity, no account required. `claimed_by` is a nullable `users.id` FK, empty at claim time, backfilled later by email match only if/when the person creates an account (Phase 2, E2). Nothing in Phase 1 may depend on `claimed_by` being populated.

6. **Does the new claim-link flow populate `parent_invite_id`? — RESOLVED (2026-07-06), unified model.** Yes — exactly as the old flow does. Parenthood runs invite-to-invite: a new claim link's `parent_invite_id` = the invite its sharer claimed through. `NetworkMap`/`NetworkGraph` and the ancestor-chain feature (Step 8) stay on one unified data model, no branching on invite "shape." This decision also amends A2's sharer-identity model (recorded in `deepcast-mvp-rework.md`): sharer identity is now **either** an authenticated session (account-holder sharers) **or** a valid claimed invite referenced client-side (accountless invitees sharing at credits-end via C3 — their claim IS their identity, since they have no session).

7. **`users.last_name` / legacy last-name collection — confirmed clean, no action needed**: dedicated recon found zero downstream code that reads or assumes `users.last_name` is populated (§2). The decision to leave both `recipient_last_name` and `users.last_name` dormant, unmigrated, carries no known risk. Flagging here only to close the loop on the item explicitly requested for verification — no open question remains on this point.
