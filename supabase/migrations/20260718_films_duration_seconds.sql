-- Film runtime on films (invite-v2 landing page, decided 2026-07-18).
--
-- The runtime shown on the claim-link landing page ("32 minutes") is film
-- DATA read from our own database — the page NEVER calls Mux at view time.
-- The value is captured ONCE per film from Mux's asset record (duration in
-- seconds, fractional): existing films via server/backfill-film-durations.js
-- (dry-run by default, owner-executed), future films at the same moment the
-- upload flow already records the ready asset's ids. Display rounds DOWN to
-- whole minutes (never up, never decimals; under a minute shows "1 minute")
-- via the shared helper in src/lib/runtime.js. NULL renders nothing.
alter table public.films
  add column if not exists duration_seconds numeric;
