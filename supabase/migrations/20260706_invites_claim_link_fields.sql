-- Claim-link invite fields (Phase 1 of the invite/share rework — see deepcast-mvp-rework.md,
-- decisions dated 2026-07-06, and PLAN.md Step 1).
--
-- The new link-based claim flow creates an invite before any email exists (the
-- sharer only enters a first name at share time), so recipient_email can no
-- longer be mandatory at creation. Claiming records who claimed the link and
-- when as its own pair of columns (claimed_email/claimed_at) — this is the
-- Phase 1 identity of a claim, no account required. claimed_by is a separate,
-- nullable pointer to a real user row, deliberately left empty by this
-- migration and by every Phase 1 code path: it is backfilled by email match
-- only if/when the claimant later creates an account (Phase 2, E2). link_slug
-- is the new short, human-typeable, guessable-by-design public routing slug —
-- kept as its own column so the existing high-entropy `token` (still used by
-- the live legacy email-invite acceptance flow, /i/:token) keeps its original
-- unguessable property untouched. `status` gains two new values so a
-- new-flow invite's pre-claim / claimed states are distinguishable from the
-- legacy flow's pending/opened/watched/signed_up in status-based queries
-- (e.g. the future reminder job) — 'watched' is reused as-is for both flows,
-- since it means the same thing (≥70% playback) either way.
--
-- Live-verified before writing this migration (via node server/db-read.js
-- against pg_constraint) rather than assumed from the migration history:
-- invites already carries a UNIQUE (film_id, recipient_email) constraint
-- (invites_film_id_recipient_email_key) that the earlier file-based recon
-- missed. Relaxing recipient_email to nullable is still safe — Postgres
-- treats every NULL as distinct from every other NULL for uniqueness
-- purposes, so any number of new-flow invites with a NULL recipient_email
-- can coexist per film without ever violating this constraint. Same
-- reasoning applies to the new link_slug unique index below: legacy rows
-- all have link_slug = NULL and don't collide with each other or with real
-- slug values.

-- 1. recipient_email is no longer mandatory — the new flow creates the row
--    before any email is known. Existing rows are unaffected (they already
--    have a value); this only changes what's allowed going forward.
alter table public.invites
  alter column recipient_email drop not null;

-- 2. New nullable columns for the claim-link flow. All backward-compatible:
--    every existing row gets NULL in each of these, and legacy code paths
--    never read or write them.
alter table public.invites
  add column if not exists claimed_email text,                                    -- captured at claim (A4) — the Phase 1 identity of a claim
  add column if not exists claimed_at timestamptz,                                -- set together with claimed_email, atomically, by the claim-bind endpoint (A2)
  add column if not exists claimed_by uuid references public.users(id) on delete set null, -- stays NULL through all of Phase 1; Phase 2 (E2) backfills by email match only
  add column if not exists link_slug text;                                        -- the public-facing {firstname}-{suffix} slug; routing only, never a display source

-- 3. link_slug must be unique once populated. A plain unique index (not a
--    NOT NULL constraint) — legacy rows keep link_slug = NULL indefinitely,
--    and Postgres allows unlimited NULLs in a unique index.
create unique index if not exists invites_link_slug_key
  on public.invites (link_slug);

-- 4. Widen the status vocabulary. Drop-and-recreate is required because
--    Postgres has no ALTER CHECK; the exact constraint name below was
--    confirmed live (pg_constraint) before writing this migration.
alter table public.invites
  drop constraint invites_status_check;

alter table public.invites
  add constraint invites_status_check
  check (status in (
    'pending',    -- legacy email-first flow: sent, not yet opened
    'opened',     -- legacy email-first flow: /i/:token visited
    'watched',    -- BOTH flows: reused as-is, ≥70% playback reached
    'signed_up',  -- legacy email-first flow: account created from this invite
    'created',    -- NEW: claim link generated, not yet claimed
    'claimed'     -- NEW: claim link claimed (claimed_email/claimed_at set)
  ));
