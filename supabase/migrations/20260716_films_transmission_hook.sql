-- Transmission hook on films (C1 display slot — see deepcast-mvp-rework.md,
-- PLAN.md Step 3 follow-up, decided 2026-07-16).
--
-- The claim-link landing page shows a one-line, filmmaker-authored "why this
-- film exists" hook beneath the film title. It is per-film DATA, not code:
-- this nullable column is the storage; the landing page renders the text only
-- when present and renders NOTHING when NULL (no empty box, no placeholder).
-- Every existing film starts NULL and is unaffected. The fuller
-- director's-note-length version for the watch page (the rest of C1) is a
-- later, separately-authored field — deliberately NOT added here.
alter table public.films
  add column if not exists transmission_hook text;
