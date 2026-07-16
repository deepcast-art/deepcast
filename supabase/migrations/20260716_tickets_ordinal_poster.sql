-- Ticket economy, ordinal freeze, and landing poster (final three-page spec,
-- decided 2026-07-16 — see deepcast-mvp-rework.md decisions log and PLAN.md).
--
-- invites.claim_ordinal — the invitee's position ("Nth person invited to this
-- film"), stamped ONCE at claim time and never recomputed; the dashboard shows
-- this frozen value. NULL for unclaimed and legacy rows.
--
-- invites.tickets_remaining — the accountless claimant's share quota,
-- initialized to 5 at claim time (mirrors the uniform new-viewer
-- invite_allocation grant in every account-creation code path) and
-- atomically decremented when they generate a claim link. Tickets spend at
-- link GENERATION, no refunds. Account holders keep users.invite_allocation
-- unchanged — two backings, one economy. NULL means "not initialized"
-- (unclaimed rows, and rows claimed before this migration — the spend path
-- lazily treats NULL as the full initial grant).
--
-- films.poster_url — optional hand-picked landing-page still. When NULL the
-- landing page falls back to the film's public Mux poster frame, and to the
-- plain dark background when there is no playback id either.
alter table public.invites
  add column if not exists claim_ordinal integer,
  add column if not exists tickets_remaining integer;

alter table public.films
  add column if not exists poster_url text;
