-- Generated with Supabase CLI as 20261008185317; renumbered068 after its table dependencies.
-- LIVE-765: consent-based Journey/Circle listings, never ownership or entry grants.
begin;
create table public.collective_cross_listings (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references public.journey_plans(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  subject_id uuid generated always as (coalesce(journey_id,circle_id)) stored,
  kind text generated always as (case when journey_id is not null then 'journey' else 'circle' end) stored,
  source_space_id uuid not null references public.spaces(id) on delete cascade,
  space_id uuid not null references public.spaces(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  responded_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((journey_id is null) <> (circle_id is null)),
  check (source_space_id <> space_id)
);
create unique index collective_cross_listings_live_idx on public.collective_cross_listings(kind,subject_id,space_id) where status in ('pending','accepted');
create index collective_cross_listings_journey_idx on public.collective_cross_listings(journey_id) where journey_id is not null;
create index collective_cross_listings_circle_idx on public.collective_cross_listings(circle_id) where circle_id is not null;
create index collective_cross_listings_source_idx on public.collective_cross_listings(source_space_id);
create index collective_cross_listings_space_idx on public.collective_cross_listings(space_id);
create index collective_cross_listings_requester_idx on public.collective_cross_listings(requested_by) where requested_by is not null;
create index collective_cross_listings_responder_idx on public.collective_cross_listings(responded_by) where responded_by is not null;
alter table public.collective_cross_listings enable row level security;
revoke all on public.collective_cross_listings from anon, authenticated;
grant all on public.collective_cross_listings to service_role;
comment on table public.collective_cross_listings is 'Consent-based multi-listing for Collective Journeys and Circles. Service role only; accepted listing never grants entry or editing. Readers recheck original visibility and current source ownership.';
commit;
