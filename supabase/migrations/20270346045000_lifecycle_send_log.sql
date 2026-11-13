-- Lifecycle send ledger (EMAIL-047): one row per lifecycle email a person was sent, so the cross-email cap
-- (at most 1 a day and 3 a week per address, lib/lifecycle/cap.ts) has one place to count. Service role only.
-- Additive and idempotent; no existing table changes. The cap switch (LIFECYCLE_CAP_ENABLED) stays off until this is applied.
-- ROLLBACK: drop table if exists public.lifecycle_send_log;
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table if not exists public.lifecycle_send_log (
  id uuid primary key default gen_random_uuid(),
  recipient text not null check (length(recipient) between 3 and 320 and recipient = lower(recipient)),
  profile_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  dedupe_key text not null check (length(dedupe_key) between 1 and 200),
  sent_at timestamptz not null default now(),
  constraint lifecycle_send_log_once unique (dedupe_key)
);
create index if not exists lifecycle_send_log_recipient_idx on public.lifecycle_send_log (recipient, sent_at desc);
create index if not exists lifecycle_send_log_profile_idx on public.lifecycle_send_log (profile_id);
alter table public.lifecycle_send_log enable row level security;
revoke all on table public.lifecycle_send_log from public, anon, authenticated;
grant select, insert, update, delete on table public.lifecycle_send_log to service_role;
comment on table public.lifecycle_send_log is 'Service-only. One row per lifecycle email sent (kind, address, time), unique by dedupe_key. The cross-email cap counts these rows.';

commit;
