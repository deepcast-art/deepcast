-- Ticket numbers (dashboard redesign, 2026-07-20).
-- Every generated invite gets a sequential per-film number ("Ticket No. 59"),
-- counted at GENERATION (links created), never at claim. Idempotent.

alter table public.films
  add column if not exists ticket_seq integer not null default 0;

alter table public.invites
  add column if not exists ticket_no integer;

-- One number per film, ever. Partial index: legacy/ghost rows keep NULL.
create unique index if not exists invites_film_ticket_no_key
  on public.invites (film_id, ticket_no)
  where ticket_no is not null;

-- Atomic "take the next number" — the UPDATE row-locks the film row, so two
-- links generated at the same moment queue for a millisecond and receive
-- distinct numbers. Called by the API server (service role) only.
create or replace function public.next_ticket_no(p_film_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.films
     set ticket_seq = ticket_seq + 1
   where id = p_film_id
   returning ticket_seq;
$$;

revoke all on function public.next_ticket_no(uuid) from public;
revoke all on function public.next_ticket_no(uuid) from anon;
revoke all on function public.next_ticket_no(uuid) from authenticated;
grant execute on function public.next_ticket_no(uuid) to service_role;
