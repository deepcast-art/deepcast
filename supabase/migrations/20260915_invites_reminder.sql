-- The one reminder (founder decision 2026-09-15): when a claimed, unwatched
-- ticket's reminder was sent — stamped by POST /api/admin/reminders/run only
-- after Resend accepted the email; null means never sent. One reminder, ever.
-- Idempotent. FOUNDER-RUN in the Supabase SQL editor before the branch merges.
alter table invites add column if not exists reminder_sent_at timestamptz;
