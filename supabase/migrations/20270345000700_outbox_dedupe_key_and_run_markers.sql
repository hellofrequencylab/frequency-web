-- Run-level idempotency for the crons that send once per period (scan two L2-02, 2026-09-05).
--
-- THE DEFECT. weekly-digest enqueued one email per active member per invocation and journey-prompt
-- inserted one notifications row per enrolled member per invocation, and neither could tell that
-- it had already covered a member this period. A second invocation in the same period (a manual
-- re-fire from the Vercel dashboard, a redeploy-triggered re-run, or the retry of a run that threw
-- midway) double-sent to everyone already covered. Nothing in the schema could refuse the second
-- row: notification_queue has no idempotency column and notifications has no unique index at all.
--
-- THE FIX, three additive pieces, all service-role only.
--
--   1. notification_queue.dedupe_key (nullable) plus a PARTIAL unique index where the key is not
--      null. lib/queue/outbox.ts enqueue() accepts an optional dedupeKey and reports whether the
--      row landed: a second insert with the same key fails with sqlstate 23505 and is read as
--      "already queued", not as an error. The index is partial so the millions of keyless rows
--      cost nothing and stay unconstrained; the app reads 23505 rather than using ON CONFLICT
--      because PostgREST cannot express the partial predicate ON CONFLICT would need.
--
--   2. notifications.dedupe_key (nullable) plus the same partial unique index. journey-prompt
--      writes `journey-prompt:<profile_id>:<YYYY-MM-DD>` so one member gets at most one next-step
--      prompt per day whatever the cron does. Every other writer of notifications leaves the
--      column null and is untouched. Chosen over routing the in-app prompt through the outbox
--      because the cron already writes the row directly: one column and one index against a new
--      job kind, a handler, and a second hop for the same row.
--
--   3. cron_run_markers, a claim table keyed by a caller-chosen string. weekly-digest's send path
--      runs through lib/email.ts sendWeeklyDigestEmail, which builds the outbox payload itself
--      and has no seam for a key, so the cron claims `weekly-digest:<profile_id>:<ISO week>` here
--      BEFORE it sends and skips the member when the claim was already taken. A send that throws
--      after the claim releases the marker so the next run retries that member. Once
--      sendWeeklyDigestEmail threads a dedupeKey through enqueueEmail the marker claim can move
--      onto piece 1 and this table can be dropped.
--
-- Additive and idempotent throughout. No function is added, so scripts/function-grants.txt is
-- unchanged. The marker table has RLS on and no policies: only the service role reads or writes
-- it, matching notification_queue.
--
-- Rollback: drop index notification_queue_dedupe_key_uidx; alter table notification_queue drop
-- column dedupe_key; drop index notifications_dedupe_key_uidx; alter table notifications drop
-- column dedupe_key; drop table cron_run_markers. Do the app side first (revert the cron routes
-- and enqueue()), or the crons will fail on the missing column.

begin;

-- 1. The outbox key.
alter table public.notification_queue add column if not exists dedupe_key text;

create unique index if not exists notification_queue_dedupe_key_uidx
  on public.notification_queue (dedupe_key)
  where dedupe_key is not null;

comment on column public.notification_queue.dedupe_key is
  'Optional caller-chosen idempotency key (lib/queue/outbox.ts enqueue). Unique where set; a second enqueue with the same key is skipped, not duplicated.';

-- 2. The notifications key.
alter table public.notifications add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe_key_uidx
  on public.notifications (dedupe_key)
  where dedupe_key is not null;

comment on column public.notifications.dedupe_key is
  'Optional idempotency key for once-per-period writers (journey-prompt cron: journey-prompt:<profile_id>:<day>). Unique where set; null everywhere else.';

-- 3. The run markers.
create table if not exists public.cron_run_markers (
  key        text primary key,
  created_at timestamptz not null default now()
);

alter table public.cron_run_markers enable row level security;
-- No policies: claimed and released by the crons through the service role only.

revoke all on table public.cron_run_markers from public, anon, authenticated;
grant all on table public.cron_run_markers to service_role;

comment on table public.cron_run_markers is
  'Per-period claim rows for crons whose send path has no idempotency seam (weekly-digest: weekly-digest:<profile_id>:<ISO week>). A row means the send for that key was claimed; the cron releases it if the send throws. Service-role only.';

commit;
