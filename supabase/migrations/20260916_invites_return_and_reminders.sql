-- The emailed return link and the two reminders (founder decisions,
-- 16 September 2026; replaces the never-run 20260915_invites_reminder.sql).
--
--   return_token_hash / _used_at / _expires_at — the sha256 of a 32-byte
--     random token minted at claim (and re-minted for each reminder); the
--     plaintext rides only in the email, as /r/{token}; spent once, 30 days.
--   watch_later_at — set when the claim came from "Watch later"; null for
--     "Watch for free".
--   reminder1_sent_at / reminder2_sent_at — stamped BEFORE each reminder is
--     sent (a conditional update), so each is sent at most once.
--
-- Additive, nullable, idempotent. Run by the verifier through the Supabase
-- connector on the founder's explicit "approved" (SHIP-PROTOCOL Tier 3).
alter table invites add column if not exists return_token_hash text;
alter table invites add column if not exists return_token_used_at timestamptz;
alter table invites add column if not exists return_token_expires_at timestamptz;
alter table invites add column if not exists watch_later_at timestamptz;
alter table invites add column if not exists reminder1_sent_at timestamptz;
alter table invites add column if not exists reminder2_sent_at timestamptz;
create unique index if not exists invites_return_token_hash_key on invites (return_token_hash);
