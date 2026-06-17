-- Recipient last name on invites.
--
-- The share form now collects the recipient's first AND last name. The first
-- name continues to live in invites.recipient_name (every display surface stays
-- first-name-only); the last name goes here, in its own nullable column. It is
-- read only when the invitee creates their account, so their full name carries
-- over. Existing invites are grandfathered: this column is NULL for them and
-- they behave exactly as before.
alter table public.invites
  add column if not exists recipient_last_name text;
