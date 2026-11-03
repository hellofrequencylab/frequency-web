-- LIVE-1968 (ADR-1933): the claim log for the Create a Space draft reminders. One row per (draft, kind), so a cron that
-- runs twice cannot send twice: the runner (lib/create-space/draft-recovery-io.ts) inserts the row FIRST and sends only
-- when the insert went through, the same shape as launch_email_log (20270346026000). A skipped kind (suppressed address,
-- taken handle) is claimed too, with a message_ref starting `skipped:`, so it is never asked again.
--
-- SECURITY POSTURE: service role only. RLS on with no policy, every default grant revoked from anon and authenticated,
-- listed in scripts/rls-deny-all.txt. Rows go with their draft (on delete cascade), so the 90-day purge of
-- create_space_drafts takes the log with it.
--
-- Additive and idempotent: one new table, no change to any existing table. No em or en dashes.
-- pgTAP: supabase/tests/create_space_drafts.test.sql (the posture half).

begin;

create table if not exists public.create_space_draft_email_log (
  id           uuid primary key default gen_random_uuid(),
  draft_id     uuid not null references public.create_space_drafts(id) on delete cascade,
  trigger_kind text not null check (trigger_kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  message_ref  text check (message_ref is null or length(message_ref) <= 200),
  sent_at      timestamptz not null default now(),
  constraint create_space_draft_email_log_once unique (draft_id, trigger_kind)
);

alter table public.create_space_draft_email_log enable row level security;
revoke all on table public.create_space_draft_email_log from anon, authenticated;

comment on table public.create_space_draft_email_log is
  'LIVE-1968: service-only claim log for the Create a Space draft reminders. One row per (draft, trigger_kind), so a cron that runs twice cannot send twice. A message_ref starting skipped: is a kind that was claimed and not sent.';

commit;
