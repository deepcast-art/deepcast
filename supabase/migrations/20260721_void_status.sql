-- Fix B (2026-07-21): duplicate-claim voiding needs the 'void' status.
-- The invites_status_check constraint predates it; recreate with 'void'
-- included. Idempotent: drop-if-exists then add.

alter table public.invites drop constraint if exists invites_status_check;
alter table public.invites add constraint invites_status_check
  check (status = any (array[
    'pending'::text,
    'opened'::text,
    'watched'::text,
    'signed_up'::text,
    'created'::text,
    'claimed'::text,
    'void'::text
  ]));
