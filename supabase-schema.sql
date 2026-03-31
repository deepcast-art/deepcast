-- Deepcast Database Schema
-- Run this in the Supabase SQL Editor to create all tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text not null,
  first_name text,
  last_name text,
  role text not null default 'viewer' check (role in ('creator', 'viewer', 'team_member')),
  invite_allocation integer not null default 5,
  team_creator_id uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- Pending teammate registrations (see supabase/migrations/20260330_team_members.sql for RLS)
create table if not exists public.team_invites (
  id uuid primary key default uuid_generate_v4(),
  creator_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  invited_name text,
  token text not null unique,
  expires_at timestamp with time zone not null default (now() + interval '14 days'),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default now()
);
create index if not exists idx_team_invites_token on public.team_invites(token);
create index if not exists idx_team_invites_creator on public.team_invites(creator_id);

-- Films table
create table if not exists public.films (
  id uuid primary key default uuid_generate_v4(),
  creator_id uuid references public.users(id) on delete cascade,
  title text not null,
  description text,
  mux_asset_id text,
  mux_playback_id text,
  thumbnail_url text,
  status text not null default 'processing' check (status in ('processing', 'ready')),
  created_at timestamp with time zone default now()
);

-- Invites table
create table if not exists public.invites (
  id uuid primary key default uuid_generate_v4(),
  film_id uuid references public.films(id) on delete cascade not null,
  sender_id uuid references public.users(id) on delete set null,
  sender_name text,
  sender_email text,
  recipient_email text not null,
  recipient_name text,
  personal_note text,
  token text unique not null,
  status text not null default 'pending' check (status in ('pending', 'opened', 'watched', 'signed_up')),
  expires_at timestamp with time zone not null,
  parent_invite_id uuid references public.invites(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- Watch sessions table
create table if not exists public.watch_sessions (
  id uuid primary key default uuid_generate_v4(),
  film_id uuid references public.films(id) on delete cascade not null,
  viewer_id uuid references public.users(id) on delete set null,
  invite_token text,
  watch_percentage integer not null default 0,
  completed boolean not null default false,
  created_at timestamp with time zone default now()
);

-- Indexes for performance
create index if not exists idx_invites_token on public.invites(token);
create index if not exists idx_invites_film_id on public.invites(film_id);
create index if not exists idx_invites_sender_id on public.invites(sender_id);
create index if not exists idx_invites_recipient_email on public.invites(recipient_email);
create index if not exists idx_films_creator_id on public.films(creator_id);
create index if not exists idx_watch_sessions_film_id on public.watch_sessions(film_id);
create index if not exists idx_watch_sessions_viewer_id on public.watch_sessions(viewer_id);
create index if not exists idx_watch_sessions_invite_token on public.watch_sessions(invite_token);

-- Enable Row Level Security
alter table public.users enable row level security;
alter table public.films enable row level security;
alter table public.invites enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.team_invites enable row level security;

-- RLS Policies

-- Users: authenticated users can read their own profile, anyone can insert (for signup)
create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- Avoid RLS self-recursion on users: use SECURITY DEFINER helpers (see migrations).
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

create policy "Team members read creator profile" on public.users
  for select using (
    public.auth_team_creator_id() is not null
    and id = public.auth_team_creator_id()
  );

create policy "Creators read team member profiles" on public.users
  for select using (
    public.auth_is_creator()
    and team_creator_id = auth.uid()
  );

create policy "Creators read own team invites" on public.team_invites
  for select using (creator_id = auth.uid());

-- Films: anyone can read ready films, creators can manage their own
create policy "Anyone can read films" on public.films
  for select using (true);

create policy "Creators can insert films" on public.films
  for insert with check (auth.uid() = creator_id);

create policy "Creators can update own films" on public.films
  for update using (auth.uid() = creator_id);

-- Invites: anyone can read (for token validation), authenticated users can manage
create policy "Anyone can read invites" on public.invites
  for select using (true);

create policy "Anyone can insert invites" on public.invites
  for insert with check (true);

create policy "Anyone can update invites" on public.invites
  for update using (true);

-- Watch sessions: anyone can insert and read
create policy "Anyone can read watch sessions" on public.watch_sessions
  for select using (true);

create policy "Anyone can insert watch sessions" on public.watch_sessions
  for insert with check (true);

create policy "Anyone can update watch sessions" on public.watch_sessions
  for update using (true);

-- Storage bucket for thumbnails
insert into storage.buckets (id, name, public) values ('film-assets', 'film-assets', true)
on conflict (id) do nothing;

-- Storage policy: anyone can read, authenticated users can upload
create policy "Public read access" on storage.objects
  for select using (bucket_id = 'film-assets');

create policy "Authenticated users can upload" on storage.objects
  for insert with check (bucket_id = 'film-assets');
