-- Badge requests: a member asks a Space for a scannable badge, and staff program it (LIVE-1180).
-- See docs/BUILD-BACKLOG.json for status and docs/LOYALTY.md "Counter scanners" for the program; this
-- file explains the schema, it does not track the work.
--
-- A member taps "Get a scannable badge" on a Space's page. That files one pending row here. The
-- CyberUnicorn console in the admin menu (Admin and Janitor) lists the pending rows, and writing the
-- member's card for that Space marks the row done and points it at the card (member_cards).
--   • One pending request per member per Space (partial unique index), so a second tap is a no-op.
--   • status: pending, done (a card was written), cancelled (staff cleared it).
--
-- Service role only, like member_cards (lib/devices does the tenancy). No money moves. No existing
-- table changes.
--
-- Additive and idempotent. ROLLBACK:
--   drop table if exists public.badge_requests;

begin;

create table if not exists public.badge_requests (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'cancelled')),
  card_id uuid references public.member_cards(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index if not exists badge_requests_one_pending_idx on public.badge_requests(space_id, profile_id) where status = 'pending';
create index if not exists badge_requests_pending_idx on public.badge_requests(created_at) where status = 'pending';
create index if not exists badge_requests_space_idx on public.badge_requests(space_id);
create index if not exists badge_requests_profile_idx on public.badge_requests(profile_id);
create index if not exists badge_requests_card_idx on public.badge_requests(card_id) where card_id is not null;
alter table public.badge_requests enable row level security;
revoke all on table public.badge_requests from public, anon, authenticated;
grant all on public.badge_requests to service_role;
comment on table public.badge_requests is 'LIVE-1180: a member asked a Space for a scannable badge (an NFC member card). Staff write it from the CyberUnicorn console in the admin menu; done rows point at the card. Service role only.';

commit;
