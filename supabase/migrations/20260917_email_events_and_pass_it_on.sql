-- Email attribution and the pass-it-on email (founder decisions, 16–17 September 2026).
-- email_events: one append-only row per ACCEPTED automated email to an invite;
-- arrived_at is stamped when that email's own /r/ link is spent. No backfill.
create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  return_token_hash text,
  arrived_at timestamptz
);
create index if not exists email_events_invite_sent_idx on public.email_events (invite_id, sent_at);
create unique index if not exists email_events_return_token_hash_key
  on public.email_events (return_token_hash) where return_token_hash is not null;
alter table public.email_events enable row level security;
revoke all on table public.email_events from anon;
revoke all on table public.email_events from authenticated;

-- watched_at: the server's clock when the watch crossed 70%; pass_it_on_sent_at:
-- stamped BEFORE the one pass-it-on email is sent, so it is sent at most once;
-- pass_it_on_skipped_at: set by the founder (SQL, Tier 3) on a row that must
-- never receive the pass-it-on email — a durable per-invite skip, no UI.
alter table invites add column if not exists watched_at timestamptz;
alter table invites add column if not exists pass_it_on_sent_at timestamptz;
alter table invites add column if not exists pass_it_on_skipped_at timestamptz;
