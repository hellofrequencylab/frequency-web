-- Q1 P3 (backlog §Q1): adopting a community Journey. Adopting = the plan's
-- practices flow into your own member_practices (the free daily-log loop) and we
-- record the adoption (popularity + "your journeys"). No new run-engine; this
-- rides the existing practice loop, honoring "streaks stay free" (ECONOMY §5).
create table public.journey_plan_adoptions (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.journey_plans(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  active     boolean not null default true,
  adopted_at timestamptz not null default now(),
  unique (plan_id, profile_id)
);
create index journey_plan_adoptions_profile_idx on public.journey_plan_adoptions (profile_id, active);

alter table public.journey_plan_adoptions enable row level security;
create policy journey_plan_adoptions_select_own on public.journey_plan_adoptions
  for select using (profile_id = get_my_profile_id());
