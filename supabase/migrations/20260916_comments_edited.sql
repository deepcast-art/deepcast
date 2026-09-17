-- Comments: a claimant may edit and remove their own comments (founder
-- decision, 16 September 2026). The edit stamps edited_at; the read route
-- serializes it and the name line gains "· edited". Removal reuses the
-- existing soft delete (deleted_at + deleted_by = the author).
--
-- Additive, nullable, no default — the shape the 16 September ship-protocol
-- amendment lets the verifier apply on the founder's "approved" before the
-- branch merges. The routes survive the window before this column exists:
-- a read or an edit that hits "column does not exist" retries without it.
--
-- Idempotent: safe to run repeatedly.

alter table public.comments add column if not exists edited_at timestamptz;
