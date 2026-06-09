-- =============================================================================
-- Journey completion rules + page config + review status
--   (ADR-197 completion arc, ADR-200 rewards; docs/JOURNEYS.md §4, §10, §12)
--
-- Completion is DERIVED from practice_logs against the season's fixed 91-day / 13-week
-- buckets (lib/journey-arc.ts) — there is no progress table. These columns hold the
-- RULES (how many qualifying weeks, the minimum per day, the reward) and the page
-- LAYOUT (page_config), not progress.
--
-- status default = 'approved' GRANDFATHERS every existing plan (the public library stays
-- visible). Going forward the create/publish actions own status: new plans start 'draft';
-- a member publishing to Public sets 'pending' (Guide+ approves); Mentor+ auto-approves.
-- =============================================================================

alter table public.journey_plans
  add column if not exists status text not null default 'approved'
    check (status in ('draft','pending','approved','rejected')),
  -- ordered array of widget descriptors {id, enabled, settings}; null → hardcoded default
  -- in lib/journey-plans.ts. The per-Journey page layout the author configures.
  add column if not exists page_config jsonb,
  -- a "qualifying day" needs at least this many practice logs (Season 1 default = 1).
  add column if not exists min_practices_per_day int not null default 1
    check (min_practices_per_day between 1 and 4),
  -- qualifying weeks needed to COMPLETE the Journey (default 8 of the 13).
  add column if not exists target_weeks int not null default 8
    check (target_weeks between 1 and 13),
  -- official Journeys lock to their quest's season; library Journeys can be evergreen
  -- (anchor = the member's adoption date, a rolling 13-week window).
  add column if not exists season_locked boolean not null default false,
  -- Gems granted on completion (ADR-139: completion is a season payoff → Gems).
  add column if not exists completion_gems int not null default 30
    check (completion_gems between 0 and 100);

create index if not exists journey_plans_status_idx on public.journey_plans (status);

comment on column public.journey_plans.status is
  'Review state: draft/pending/approved/rejected. Default approved grandfathers existing plans; create/publish actions set it thereafter (ADR-197).';
comment on column public.journey_plans.page_config is
  'Per-Journey page layout — ordered widget descriptors. Null = hardcoded default in lib/journey-plans.ts (docs/JOURNEYS.md §10).';
