-- Fix: policies that used "EXISTS (SELECT ... FROM public.users ...)" on public.users
-- can trigger infinite recursion / failed SELECTs, so creators could not read their own row.
-- Run this AFTER 20260330_team_members.sql if creators cannot log in / load profile.

-- Helpers bypass RLS only for the small read they need (safe pattern for Supabase).
create or replace function public.auth_team_creator_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select team_creator_id from public.users where id = auth.uid();
$$;

create or replace function public.auth_is_creator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'creator'
  );
$$;

revoke all on function public.auth_team_creator_id() from public;
revoke all on function public.auth_is_creator() from public;
grant execute on function public.auth_team_creator_id() to authenticated, service_role;
grant execute on function public.auth_is_creator() to authenticated, service_role;

drop policy if exists "Team members read creator profile" on public.users;
create policy "Team members read creator profile" on public.users
  for select using (
    public.auth_team_creator_id() is not null
    and id = public.auth_team_creator_id()
  );

drop policy if exists "Creators read team member profiles" on public.users;
create policy "Creators read team member profiles" on public.users
  for select using (
    public.auth_is_creator()
    and team_creator_id = auth.uid()
  );
