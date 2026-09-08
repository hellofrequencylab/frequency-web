-- signup_leads gets the one column its recovery job needs: when the note went out (LIVE-170, ADR-1274).
--
-- THE GAP. Migration 20270215000000 built signup_leads for one purpose: a TRANSACTIONAL
-- "finish setting up your account" note to a visitor who gave an email and then walked away
-- (ADR-959). Its table comment says so, its recovery index (converted_at, updated_at) was cut for
-- that read, and lib/crm/signup-leads.ts gained the operator reader on 2026-09-05 (SCAN-634,
-- ADR-1212). The job itself was never built, and nothing on the row could record that it ran:
-- a cron that mailed a lead had nowhere to write "done", so a second run would mail them again.
--
-- THE FIX. One nullable timestamp, `recovery_sent_at`, stamped by /api/cron/signup-lead-recovery
-- BEFORE the note is enqueued (claim, then send: the ADR-1212 discipline). NULL means never
-- mailed; a value means mailed once and never again. There is no retry column and no counter on
-- purpose: the note is a one-shot, the same shape as a password reset, and a lead who does not
-- come back after it is not mailed a second time.
--
-- THE READ. The cron's driving query is
--   converted_at is null and recovery_sent_at is null and step_reached >= 2
--   and updated_at <= now() - interval '24 hours', ordered by updated_at, limited.
-- The partial index below covers exactly that set, ordered by updated_at so the oldest cold lead
-- is served first. It is small by construction: a row leaves it the moment it converts or is
-- mailed, so it holds only the leads still owed a note.
--
-- ⚠️ THE TRIGGER. signup_leads_set_updated_at fires on every update, so the stamp itself moves
-- updated_at to the send time. That is harmless for the cron (recovery_sent_at is not null,
-- so the row is out of the selection regardless) and it is stated here so the operator page's
-- "age" column is read correctly: after the note, a lead's last touch IS the note.
--
-- No function changes, no grant changes: the table stays RLS-on with zero policies, and the only
-- writer of this column is the service role from the cron.

alter table public.signup_leads
  add column if not exists recovery_sent_at timestamptz;

comment on column public.signup_leads.recovery_sent_at is
  'When the one transactional "finish setting up your account" note was enqueued by /api/cron/signup-lead-recovery (ADR-1274). NULL = never mailed. Stamped BEFORE the send as the claim, so a lead is mailed at most once across overlapping or retried runs.';

create index if not exists signup_leads_recovery_due_idx
  on public.signup_leads (updated_at)
  where converted_at is null and recovery_sent_at is null;
