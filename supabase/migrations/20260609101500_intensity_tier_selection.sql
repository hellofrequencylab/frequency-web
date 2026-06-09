-- =============================================================================
-- Intensity tiers — selection (ADR-198; docs/JOURNEYS.md §5)
--
-- Which version of a practice a member sees/does resolves most-specific-first:
--   member override  (journey_plan_adoptions.tier_override)
--   → circle default (circles.default_intensity_tier — the Host sets it for the room)
--   → item default   (journey_plan_items.default_tier)
--   → 'current'
-- The resolver is resolveTier() in lib/journey-tiers.ts. Tier changes only the practice
-- CONTENT shown — never the Zap reward or the streak, by design.
-- =============================================================================

-- Per-step default for the Journey author ("this step runs Current unless overridden").
alter table public.journey_plan_items
  add column if not exists default_tier text not null default 'current'
    check (default_tier in ('spark','current','deep'));

-- The circle Host's default for the whole room (null = no circle-level default).
-- A beginner circle runs Spark; a seasoned circle runs Deep. Human-calibrated, no algorithm.
alter table public.circles
  add column if not exists default_intensity_tier text
    check (default_intensity_tier in ('spark','current','deep'));

-- The member's personal override for one adopted Journey (null = inherit the chain above).
alter table public.journey_plan_adoptions
  add column if not exists tier_override text
    check (tier_override in ('spark','current','deep'));

comment on column public.circles.default_intensity_tier is
  'Host-set default Spark/Current/Deep tier for the circle''s members (ADR-198). Null = inherit the journey item default.';
comment on column public.journey_plan_adoptions.tier_override is
  'A member''s personal Spark/Current/Deep override for this adopted Journey (ADR-198). Null = inherit circle/item default.';
