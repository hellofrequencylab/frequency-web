-- LIVE-756 / ADR-1709: Crew gives one Boost a month to a Circle or a Space, lifting it in discovery
-- for a week. See docs/BUILD-BACKLOG.json for status; this file explains the work.
--
-- One row per Boost. `boost_month` is the first day of the calendar month (UTC) the Boost was given
-- in, and the unique (giver_profile_id, boost_month) key is what makes it ONE a month: a second give
-- in the same month is a duplicate-key refusal, never a second row. Exactly one target is set, and it
-- matches `target_kind`.
--
-- The lift is read by discovery (lib/crew/boost.ts activeBoostIds): a target with a Boost given in
-- the last 7 days sorts ahead in the default Circle and Space orders. The row itself never expires;
-- the window is applied at read time, so the history stays for the giver.
--
-- Reads and writes go through the service role only (lib/crew/boost.ts giveBoost checks Crew and the
-- self-boost rule), so the table grant is `internal` (scripts/table-grants.txt). The select-own
-- policy states who a row belongs to if a client read is ever granted.
--
-- Additive and idempotent. ROLLBACK: drop table public.crew_boosts;

create table if not exists public.crew_boosts (
  id               uuid primary key default gen_random_uuid(),
  giver_profile_id uuid not null references public.profiles(id) on delete cascade,
  target_kind      text not null check (target_kind in ('circle', 'space')),
  circle_id        uuid references public.circles(id) on delete cascade,
  space_id         uuid references public.spaces(id) on delete cascade,
  boost_month      date not null,
  given_at         timestamptz not null default now(),
  constraint crew_boosts_one_target check (
    (target_kind = 'circle' and circle_id is not null and space_id is null)
    or (target_kind = 'space' and space_id is not null and circle_id is null)
  ),
  constraint crew_boosts_month_is_first_day check (extract(day from boost_month) = 1),
  constraint crew_boosts_one_a_month unique (giver_profile_id, boost_month)
);

comment on table public.crew_boosts is
  'Crew Boosts (LIVE-756, ADR-1709): one per Crew member per calendar month, given to a Circle or a Space. A Boost given in the last 7 days lifts its target in the default discovery order (lib/crew/boost.ts). Service-role writes only.';
comment on column public.crew_boosts.boost_month is
  'First day (UTC) of the calendar month the Boost was given in. Unique per giver: the one-a-month rule.';

create index if not exists crew_boosts_circle_given_idx
  on public.crew_boosts (circle_id, given_at desc) where circle_id is not null;
create index if not exists crew_boosts_space_given_idx
  on public.crew_boosts (space_id, given_at desc) where space_id is not null;

alter table public.crew_boosts enable row level security;

revoke all on table public.crew_boosts from anon, authenticated;

drop policy if exists crew_boosts_select_own on public.crew_boosts;
create policy crew_boosts_select_own on public.crew_boosts
  for select to authenticated
  using (giver_profile_id = (select private.get_my_profile_id()));
