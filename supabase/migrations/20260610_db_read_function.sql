-- Read-only SQL runner backing server/db-read.js (command-line data inspection).
--
-- STABLE + invoked over GET means PostgREST wraps every call in a
-- READ ONLY transaction: even if a write slipped past the script's
-- validation, Postgres itself refuses to execute it.
-- Service-role only — anon/authenticated cannot call it.

create or replace function public.db_read(query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $func$
declare
  result jsonb;
begin
  execute 'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (' || query || ') t'
    into result;
  return result;
end;
$func$;

revoke all on function public.db_read(text) from public;
revoke all on function public.db_read(text) from anon;
revoke all on function public.db_read(text) from authenticated;
