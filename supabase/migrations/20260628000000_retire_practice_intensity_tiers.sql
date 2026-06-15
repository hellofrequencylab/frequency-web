-- ── Retire per-practice intensity tiers (ADR-198 superseded) ────────────────────────────────
-- The Initiate / Adept / Master content-variant system was inert in the economy (never
-- affected Zaps or streaks). It only selected which practice content variant a member saw.
-- "The Quest" completion-model migration replaces it with weight_class on the practice itself.
-- Practices keep `weight_class`; the three tier columns + practice_tiers table are dropped.
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after the app code is deployed.

-- ── UP ───────────────────────────────────────────────────────────────────────────────────────

-- 1. Drop the content-tier table (cascade removes any FK constraints + indexes).
drop table if exists public.practice_tiers cascade;

-- 2. Drop the three columns that referenced the tier system.
alter table public.journey_plan_items
  drop column if exists default_tier;

alter table public.circles
  drop column if exists default_intensity_tier;

alter table public.journey_plan_adoptions
  drop column if exists tier_override;


-- ── DOWN (reversible — run to undo before types are regenerated) ──────────────────────────────
-- Uncomment and run the block below to reverse this migration.
--
-- -- Recreate practice_tiers table
-- create table if not exists public.practice_tiers (
--   id           uuid primary key default gen_random_uuid(),
--   practice_id  uuid not null references public.practices(id) on delete cascade,
--   tier         text not null check (tier in ('initiate', 'adept', 'master')),
--   title        text,
--   body         text,
--   est_minutes  integer,
--   created_at   timestamptz not null default now(),
--   updated_at   timestamptz not null default now(),
--   unique (practice_id, tier)
-- );
--
-- -- Recreate journey_plan_items.default_tier
-- alter table public.journey_plan_items
--   add column if not exists default_tier text not null
--     default 'adept'
--     check (default_tier in ('initiate', 'adept', 'master'));
--
-- -- Recreate circles.default_intensity_tier
-- alter table public.circles
--   add column if not exists default_intensity_tier text
--     check (default_intensity_tier in ('initiate', 'adept', 'master'));
--
-- -- Recreate journey_plan_adoptions.tier_override
-- alter table public.journey_plan_adoptions
--   add column if not exists tier_override text
--     check (tier_override in ('initiate', 'adept', 'master'));
