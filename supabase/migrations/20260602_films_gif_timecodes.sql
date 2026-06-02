ALTER TABLE films
  ADD COLUMN IF NOT EXISTS gif_start integer,
  ADD COLUMN IF NOT EXISTS gif_end integer;
