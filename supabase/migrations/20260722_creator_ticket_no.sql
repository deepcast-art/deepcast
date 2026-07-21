-- Filmmaker holds №1 (owner spec, 2026-07-22): on every film, ticket №1
-- belongs to the film's creator at the center; invitees start at №2.
-- Stored explicitly — never a silent skip. Idempotent.
--
-- NOT applied automatically: the owner applies this personally, per the
-- absolute production-change rule (CLAUDE.md, 2026-07-21).

alter table public.films
  add column if not exists creator_ticket_no integer default 1;

-- Existing films: the creator explicitly holds №1.
update public.films set creator_ticket_no = 1 where creator_ticket_no is null;

-- №1 is issued from birth: a new film's counter starts at 1 (the creator's
-- ticket), so the first invitee link mints №2.
alter table public.films alter column ticket_seq set default 1;

-- Belt for existing films: a counter below 1 would hand №1 to an invitee.
update public.films set ticket_seq = 1 where ticket_seq < 1;
