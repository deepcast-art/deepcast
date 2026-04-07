-- Token is the secret for email links. The API uses SUPABASE_ANON_KEY with no user JWT, so RLS
-- ("creator_id = auth.uid()") hides team_invites from direct SELECT/UPDATE/DELETE. These RPCs run as definer.

create or replace function public.get_team_invite_by_token(p_token text)
returns table (
  id uuid,
  email text,
  invited_name text,
  expires_at timestamptz,
  accepted_at timestamptz,
  creator_id uuid,
  creator_name text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ti.id,
    ti.email,
    ti.invited_name,
    ti.expires_at,
    ti.accepted_at,
    ti.creator_id,
    u.name as creator_name
  from public.team_invites ti
  left join public.users u on u.id = ti.creator_id
  where ti.token = nullif(trim(p_token), '')
  limit 1;
$$;

create or replace function public.accept_team_invite_by_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.team_invites
  set accepted_at = now()
  where token = nullif(trim(p_token), '')
    and accepted_at is null
    and expires_at > now();
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function public.delete_team_invite_by_token(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.team_invites
  where token = nullif(trim(p_token), '');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.get_team_invite_by_token(text) from public;
grant execute on function public.get_team_invite_by_token(text) to anon;
grant execute on function public.get_team_invite_by_token(text) to authenticated;
grant execute on function public.get_team_invite_by_token(text) to service_role;

revoke all on function public.accept_team_invite_by_token(text) from public;
grant execute on function public.accept_team_invite_by_token(text) to anon;
grant execute on function public.accept_team_invite_by_token(text) to authenticated;
grant execute on function public.accept_team_invite_by_token(text) to service_role;

revoke all on function public.delete_team_invite_by_token(text) from public;
grant execute on function public.delete_team_invite_by_token(text) to anon;
grant execute on function public.delete_team_invite_by_token(text) to authenticated;
grant execute on function public.delete_team_invite_by_token(text) to service_role;
