-- Run once in Supabase SQL Editor: links each outbound invite to the invite the sender received (chain tracking).
alter table public.invites
  add column if not exists parent_invite_id uuid references public.invites(id) on delete set null;

create index if not exists idx_invites_parent_invite_id on public.invites(parent_invite_id);
