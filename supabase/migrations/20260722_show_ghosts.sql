-- Per-film ghost visibility (owner ruling 2026-07-22).
--
-- When true, the seeded demo ghosts render on the VIEWER surfaces for that
-- film only (constellation, journey counts, ticket rows, tickets-given) —
-- visually indistinguishable from real nodes. Default false: every film
-- behaves exactly as before until the owner flips the flag by hand.
-- Ghosts are NEVER ticket-numbered regardless of this flag, and admin
-- surfaces already show them unconditionally.
--
-- Idempotent by construction.
alter table public.films
  add column if not exists show_ghosts boolean not null default false;
