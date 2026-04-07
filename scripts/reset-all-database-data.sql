-- =============================================================================
-- DEEPcast: wipe all application data (public schema)
-- =============================================================================
-- DANGER: Irreversible. Run only in Supabase SQL Editor (or psql) on a project
-- you intend to empty — e.g. dev/staging, or before a fresh seed.
--
-- What this clears:
--   public.watch_sessions, public.invites, public.team_invites,
--   public.films, public.users
--
-- What this does NOT clear (unless you uncomment optional sections below):
--   auth.users / auth.identities (Supabase Auth — everyone loses login)
--   storage.objects (uploaded thumbnails, etc.)
--   Supabase internal tables (realtime, vault, etc.)
-- =============================================================================

begin;

truncate table
  public.watch_sessions,
  public.invites,
  public.team_invites,
  public.films,
  public.users
restart identity cascade;

commit;

-- -----------------------------------------------------------------------------
-- OPTIONAL: remove objects in the film-assets bucket (thumbnails / uploads)
-- -----------------------------------------------------------------------------
-- begin;
-- delete from storage.objects where bucket_id = 'film-assets';
-- commit;

-- -----------------------------------------------------------------------------
-- OPTIONAL: delete every Supabase Auth user (full account wipe)
-- Requires a role that can write auth schema (e.g. postgres in SQL Editor).
-- Run AFTER truncating public tables, or you may hit FK issues if you add them.
-- -----------------------------------------------------------------------------
-- begin;
-- delete from auth.users;
-- commit;
