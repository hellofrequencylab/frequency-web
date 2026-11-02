-- SCAN-1184: events had no updated-at column, so 209 of the sitemap's 588 URLs (every event) carried
-- no lastmod. This adds `events.updated_at`, backfills it from the row's publish or create instant,
-- and keeps it current with the existing public.set_updated_at() trigger function.
--
-- Additive and idempotent. ROLLBACK: drop trigger trg_events_updated_at on public.events;
-- alter table public.events drop column updated_at.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.events
  add column if not exists updated_at timestamptz not null default now();

-- Backfill once: the best true "last changed" instant we have for a pre-existing row.
update public.events
   set updated_at = coalesce(published_at, created_at, now());

drop trigger if exists trg_events_updated_at on public.events;
create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

commit;
