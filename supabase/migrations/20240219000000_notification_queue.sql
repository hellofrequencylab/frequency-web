-- Phase 3 (ENGAGEMENT-ARCHITECTURE §5; ROADMAP P7.29): durable async job queue.
--
-- Side-effects that shouldn't block a request — or silently drop if a provider is
-- down mid-dispatch (the current inline-cron risk) — get enqueued here and drained
-- by /api/cron/process-queue with retries + exponential backoff. Service-role only.
-- Additive. After applying, regenerate types.

create table if not exists public.notification_queue (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null,                      -- handler key: 'push' | 'email' | …
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'pending',    -- pending | done | failed
  attempts     integer not null default 0,
  max_attempts integer not null default 5,
  run_after    timestamptz not null default now(), -- next eligible run (backoff)
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notification_queue_due_idx
  on public.notification_queue (status, run_after);

alter table public.notification_queue enable row level security;
-- No policies: the queue is written/drained by the service role only
-- (enqueue() + the cron processor). Clients have no access.

comment on table public.notification_queue is
  'Durable async job queue (outbox). Drained by /api/cron/process-queue with retries + exponential backoff. Service-role only. See docs/ENGAGEMENT-ARCHITECTURE.md.';
