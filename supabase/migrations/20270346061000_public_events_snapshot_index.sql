-- SCAN-1210: public.public_events timed out (57014) 576 times since September on /discover, the city pages
-- and the feed. The function's WHERE clause (published, not cancelled, not removed, public, not demo) is a fixed
-- shape, and the only usable index (events_upcoming_series_idx) is keyed by series, not by start time, so the
-- planner sorted every public row on each call. This adds a narrow partial index that matches the listing gate
-- exactly and is ordered by starts_at: the public list reads index entries only, ahead of the first upcoming row.
-- The app side keeps a last-good snapshot (lib/public-events-snapshot.ts) so a slow read never caches an empty list.
--
-- Additive and idempotent. ROLLBACK: drop index if exists public.events_public_events_snapshot_idx;
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create index if not exists events_public_events_snapshot_idx
  on public.events (starts_at, id)
  where status = 'published' and is_cancelled = false and removed_at is null
    and visibility = 'public' and is_demo = false;

commit;
