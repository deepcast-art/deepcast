-- Let the API remove teammates when the server uses the anon key (direct UPDATE on other users is blocked by RLS).
-- Service role bypasses RLS; this RPC is a fallback and still enforces creator ↔ member relationship.

create or replace function public.remove_team_member_for_creator(
  p_creator_id uuid,
  p_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  c_role text;
begin
  if p_creator_id is null or p_member_id is null or p_creator_id = p_member_id then
    return false;
  end if;

  select lower(trim(role)) into c_role from public.users where id = p_creator_id;
  if c_role is null or c_role <> 'creator' then
    return false;
  end if;

  update public.users
  set
    role = 'viewer',
    team_creator_id = null,
    invite_allocation = 5
  where id = p_member_id
    and team_creator_id = p_creator_id;

  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function public.remove_team_member_for_creator(uuid, uuid) from public;
grant execute on function public.remove_team_member_for_creator(uuid, uuid) to anon;
grant execute on function public.remove_team_member_for_creator(uuid, uuid) to authenticated;
grant execute on function public.remove_team_member_for_creator(uuid, uuid) to service_role;
