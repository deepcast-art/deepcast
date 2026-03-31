-- Team members: invited by creators, unlimited film invites, viewer-style dashboard for outreach.
-- Run in Supabase SQL Editor (or supabase db push) after reviewing.

-- 1) Users: link team members to their lead creator
alter table public.users
  add column if not exists team_creator_id uuid references public.users (id) on delete set null;

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('creator', 'viewer', 'team_member'));

comment on column public.users.team_creator_id is 'For role=team_member: the creator (filmmaker) this user assists.';

-- 2) Pending invitations before registration
create table if not exists public.team_invites (
  id uuid primary key default uuid_generate_v4(),
  creator_id uuid not null references public.users (id) on delete cascade,
  email text not null,
  invited_name text,
  token text not null unique,
  expires_at timestamp with time zone not null default (now() + interval '14 days'),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

create index if not exists idx_team_invites_token on public.team_invites (token);
create index if not exists idx_team_invites_creator on public.team_invites (creator_id);
create index if not exists idx_team_invites_email_lower on public.team_invites (lower(trim(email)));

alter table public.team_invites enable row level security;

-- Creators see their own pending (and past) team invites from the app
drop policy if exists "Creators read own team invites" on public.team_invites;
create policy "Creators read own team invites" on public.team_invites
  for select using (creator_id = auth.uid ());

-- No client insert/update — server uses service role

-- 3) RLS: cross-user reads on public.users MUST NOT subquery public.users in the policy
-- (Postgres RLS recursion). Use SECURITY DEFINER helpers instead.
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
