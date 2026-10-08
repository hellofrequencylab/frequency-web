-- =============================================================================
-- Ongoing Journeys: a Journey that repeats each year instead of ending (owner, 2026-10-07)
--
-- WHAT: journey_plans.ongoing. When true, the Journey has no finish line in the member's view: once
-- every phase has opened, the cycle starts again at phase 1 (the course home names the year, and the
-- current phase follows the calendar). Progress is never reset: a lesson done in year one stays done.
-- The owner's ruling on the decision card: "Repeat each year".
--
-- Paired with the monthly cadence, which needs no column: drip_interval_days is already clamped to
-- 1..30 by updatePlan, and 30 now reads as "one phase each calendar month" (lib/journeys/schedule.ts).
--
-- Additive: one column with a default, so every existing row reads false and behaves as today.
-- Reversible: alter table public.journey_plans drop column ongoing.
-- =============================================================================

begin;

alter table public.journey_plans
  add column if not exists ongoing boolean not null default false;

comment on column public.journey_plans.ongoing is
  'Repeats each year: once every phase has opened, the cycle starts again at phase 1. Progress is kept. Owner ruling 2026-10-07.';

commit;
