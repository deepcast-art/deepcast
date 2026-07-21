# Known issues

## watch_sessions table is empty / inserts appear to be failing (pre-existing)

**Status:** RESOLVED as observed on 2026-07-22 — production `watch_sessions` now records rows (e.g. 27 sessions on a single legacy invite verified during the ticket-number work). Kept for history; the notes below describe the original silent-failure behaviour.

**Symptom:** `public.watch_sessions` has **0 rows table-wide**, including for historical real
watches (e.g. the 06‑05 minhjhang test) and the seeded demo data whose invites are marked
`watched`. New opens via `/i/:token` also leave no row.

**Where it comes from:** `validateInvite` (`server/index.js`, `GET /api/invites/validate/:token`)
inserts a `watch_sessions` row on every open, but the insert error is caught and only logged
(`console.error('Watch session create error', …)`) — the request still returns success, so the
flow never surfaces the failure. The empty table indicates that insert has been failing for a
while (likely a schema/permission/constraint issue on the table), independent of auth.

**Impact:** low for the invite-first change. The passwordless flow does not depend on
`watch_sessions`:
- The `watch_sessions.viewer_id` stamp in `replicateInviteLinkage` is belt-and-suspenders and
  no-ops safely when there are no rows.
- The watch-session-based **parent-resolution fallback** in `/api/invites/send`
  (fallback 3a/3b) never finds anything, but the primary parent linkage is by invite id and the
  email fallback (fallback 1) still work.
- Resume/“watch again” position is stored in `localStorage`, not `watch_sessions`.

**To investigate later (separate ticket):** reproduce the failing insert (check the table’s
columns/constraints/RLS against the insert payload in `validateInvite`), fix it, and consider
surfacing the insert error instead of swallowing it. Until then, anything that relies on
`watch_sessions` (watch analytics, the parent fallback) is effectively disabled.
