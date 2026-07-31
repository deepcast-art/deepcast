-- Claim context capture (owner-approved 2026-07-31, in-session):
-- three optional text columns stamped at claim time — the claimant's
-- timezone (IANA name), browser language, and coarse device class
-- (phone / tablet / desktop). Data only, never displayed; NULL on every
-- pre-existing row; capture is non-fatal by design (a browser that
-- blocks any of it, or a database missing these columns, never breaks
-- a claim). Idempotent: safe to run repeatedly.

alter table public.invites add column if not exists claim_timezone text;
alter table public.invites add column if not exists claim_locale text;
alter table public.invites add column if not exists claim_device text;
