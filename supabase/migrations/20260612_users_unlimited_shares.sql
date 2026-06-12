-- Per-user unlimited shares, independent of team membership.
--
-- A viewer with unlimited_shares = true keeps EVERYTHING about the normal
-- viewer experience — same role, same dashboard, same ViewerShareGate, and
-- (unlike team members) their sent invites still record parent_invite_id so
-- the word-of-mouth chain, reach stats, and graph stay intact. The only
-- effect: /api/invites/send never blocks them on quota and never decrements
-- their allocation, and every quota UI shows "unlimited" via
-- isUnlimitedSharer (src/lib/shares.js).
alter table public.users
  add column if not exists unlimited_shares boolean not null default false;
