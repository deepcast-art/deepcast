-- Comments on the watch page (founder direction 2026-09-09; Tier 3 —
-- FOUNDER-RUN before the `comments` branch merges).
--
-- One table. Text only, at most 1,000 characters (also enforced in the API).
-- Soft delete: deleted_at + deleted_by; a deleted comment disappears for
-- everyone, its replies with it (the read route hides them). Replies are
-- ONE level: parent_comment_id always points at a TOP-LEVEL comment — a
-- reply to a reply is stored against the thread's top-level comment
-- (server/commentRules.js, unit-tested), so each thread stays flat and
-- ordered by time.
--
-- NOBODY BUT THE SERVER TOUCHES THIS TABLE. Row level security is ON with
-- ZERO policies, so the anon and authenticated roles get no rows through
-- PostgREST; and the default table grants Supabase hands those two roles on
-- every new public table are REVOKED as a second layer. Only the service
-- role (the API server) can read or write. Identity for every write comes
-- from the verified session token on the server — never from the client.
--
-- No second copy of anyone's name lives here: first names and ticket
-- numbers are resolved at read time from users / invites.
--
-- DELETION (red-team finding 2, 2026-09-09): an ACCOUNT deletion never
-- hard-deletes a word here — user_id is SET NULL, and the read route hides
-- author-less rows (and their replies) exactly like soft-deleted ones. The
-- founder's soft delete is the only way a comment goes away; only deleting
-- the FILM itself cascades.
--
-- Idempotent: safe to run repeatedly.

create table if not exists public.comments (
  id uuid primary key default extensions.uuid_generate_v4(),
  film_id uuid not null references public.films(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.users(id) on delete set null
);

create index if not exists comments_film_created_idx
  on public.comments (film_id, created_at);
create index if not exists comments_user_created_idx
  on public.comments (user_id, created_at);

alter table public.comments enable row level security;

-- Deliberately NO policies: with RLS on and no policy, anon/authenticated
-- see nothing and can write nothing. The service role bypasses RLS.
revoke all on table public.comments from anon;
revoke all on table public.comments from authenticated;
