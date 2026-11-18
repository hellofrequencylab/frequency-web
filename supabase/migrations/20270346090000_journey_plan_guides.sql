-- =============================================================================
-- Journey Guides: the PEOPLE who lead a Journey (owner 2026-11-17)
--
-- WHAT: a Journey has a HOST, its home Space (journey_plans.space_id), plus any co-host Spaces
-- (journey_plan_space_shares), and now any number of GUIDES: the people who lead it. Owner's words:
-- "For Journeys we can have a host space as well as a guide. If it's just the space, they are host and
-- guide", and "multiple guides could be a part of a journey". So: zero or more guides per Journey, in
-- order. With none, the Journey page shows its host Space as the guide.
--
-- WHAT A GUIDE MAY DO (owner ruling 2026-11-17, "Credit + host Runs"): a guide is credited on the
-- Journey page and may start and host a Run (a live cohort) of THAT Journey in a Circle of its home
-- Space, then schedule each week's sessions for it. A guide does NOT edit the lessons, settings or
-- price; those stay with the Space's team (getJourneyCapabilities is unchanged). Mirrors the Event
-- split: people are Cohosts and lead, Spaces are Collaborators and are credited (docs/NAMING.md).
--
-- ACCESS MODEL: RLS ENABLED, NO POLICIES, service-role only, the same posture as
-- journey_plan_space_shares (listed in scripts/rls-deny-all.txt and `internal` in
-- scripts/table-grants.txt). Every read and write goes through the admin client in
-- lib/journeys/guides.ts, gated by the Space steward check in the server actions.
--
-- Reversible: drop table public.journey_plan_guides.
-- =============================================================================

create table if not exists public.journey_plan_guides (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.journey_plans(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  sort_order  integer not null default 0,
  added_by    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  -- A person guides a Journey at most once.
  constraint journey_plan_guides_unique unique (plan_id, profile_id)
);

create index if not exists journey_plan_guides_plan_idx on public.journey_plan_guides (plan_id, sort_order);
create index if not exists journey_plan_guides_profile_idx on public.journey_plan_guides (profile_id);

comment on table public.journey_plan_guides is
  'The people who lead a Journey (owner 2026-11-17). Credited on the Journey page; may host Runs of it in its home Space. No content or settings access. Service role only.';

alter table public.journey_plan_guides enable row level security;
revoke all on table public.journey_plan_guides from anon, authenticated;
