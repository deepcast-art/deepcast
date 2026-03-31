-- Team invite insert + viewer→teammate upgrade for API servers using SUPABASE_ANON_KEY (RLS blocks direct writes).

create or replace function public.create_team_invite_for_creator(
  p_creator_id uuid,
  p_email text,
  p_invited_name text
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  exp timestamptz;
  c_role text;
  email_norm text;
  em text;
begin
  email_norm := lower(trim(p_email));
  if email_norm is null or length(email_norm) < 3 then
    return;
  end if;

  select lower(trim(role)) into c_role from public.users where id = p_creator_id;
  if c_role is null or c_role <> 'creator' then
    return;
  end if;

  if exists (
    select 1 from public.users u
    where u.id = p_creator_id and lower(trim(u.email)) = email_norm
  ) then
    return;
  end if;

  if exists (select 1 from public.users where lower(trim(email)) = email_norm) then
    return;
  end if;

  t := encode(gen_random_bytes(24), 'hex');
  exp := now() + interval '14 days';
  em := nullif(trim(coalesce(p_invited_name, '')), '');

  delete from public.team_invites
  where creator_id = p_creator_id
    and lower(trim(email)) = email_norm
    and accepted_at is null;

  insert into public.team_invites (creator_id, email, invited_name, token, expires_at)
  values (p_creator_id, email_norm, em, t, exp);

  return query select t, exp;
end;
$$;

create or replace function public.upgrade_viewer_to_team_member_for_creator(
  p_creator_id uuid,
  p_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  uid uuid;
  c_role text;
  email_norm text;
begin
  email_norm := lower(trim(p_email));
  if email_norm is null or length(email_norm) < 3 then
    return false;
  end if;

  select lower(trim(role)) into c_role from public.users where id = p_creator_id;
  if c_role is null or c_role <> 'creator' then
    return false;
  end if;

  select id into uid from public.users where lower(trim(email)) = email_norm;
  if uid is null then
    return false;
  end if;

  update public.users
  set
    role = 'team_member',
    team_creator_id = p_creator_id,
    invite_allocation = 0
  where id = uid
    and role = 'viewer'
    and (team_creator_id is null or team_creator_id = p_creator_id);

  get diagnostics n = row_count;
  if n > 0 then
    delete from public.team_invites
    where creator_id = p_creator_id
      and lower(trim(email)) = email_norm
      and accepted_at is null;
    return true;
  end if;

  if exists (
    select 1 from public.users
    where id = uid and role = 'team_member' and team_creator_id = p_creator_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.create_team_invite_for_creator(uuid, text, text) from public;
grant execute on function public.create_team_invite_for_creator(uuid, text, text) to anon;
grant execute on function public.create_team_invite_for_creator(uuid, text, text) to authenticated;
grant execute on function public.create_team_invite_for_creator(uuid, text, text) to service_role;

revoke all on function public.upgrade_viewer_to_team_member_for_creator(uuid, text) from public;
grant execute on function public.upgrade_viewer_to_team_member_for_creator(uuid, text) to anon;
grant execute on function public.upgrade_viewer_to_team_member_for_creator(uuid, text) to authenticated;
grant execute on function public.upgrade_viewer_to_team_member_for_creator(uuid, text) to service_role;
