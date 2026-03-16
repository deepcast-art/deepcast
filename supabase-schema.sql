-- Deepcast Database Schema
-- Run this in the Supabase SQL Editor to create all tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  name text not null,
  role text not null default 'viewer' check (role in ('creator', 'viewer')),
  invite_allocation integer not null default 3,
  created_at timestamp with time zone default now()
);

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

-- RLS Policies

-- Users: authenticated users can read their own profile, anyone can insert (for signup)
create policy "Users can read own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can insert own profile" on public.users
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

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
