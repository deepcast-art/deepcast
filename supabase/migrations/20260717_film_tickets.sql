-- Per-film ticket economy (Piece F, 2026-07-17).
--
-- One wallet per (person, film): balance + per-film unlimited flag. Rows are
-- created LAZILY — a missing row always reads as the virtual default
-- {balance 5, unlimited false}; the first write materializes it. Claiming a
-- film initializes that film's wallet at 5; sends/grants/replenish upsert.
-- users.invite_allocation and users.unlimited_shares go dormant (kept, not
-- read by the ticket paths anymore).
--
-- Idempotent: safe to re-run.

create table if not exists public.film_tickets (
  user_id uuid not null references public.users(id) on delete cascade,
  film_id uuid not null references public.films(id) on delete cascade,
  balance integer not null default 5,
  unlimited boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, film_id)
);

alter table public.film_tickets enable row level security;

-- Clients may read ONLY their own wallet rows (the viewer sidebar display).
-- There are deliberately NO client insert/update/delete policies: every
-- write goes through the service role on the server.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'film_tickets'
      and policyname = 'Users read own film tickets'
  ) then
    create policy "Users read own film tickets" on public.film_tickets
      for select using (auth.uid() = user_id);
  end if;
end $$;
