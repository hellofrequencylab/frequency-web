-- =============================================================================
-- Naming Canon 2026 — Wave 2 (2/5): tiers  spark/current/deep → initiate/adept/master
-- Canon: docs/NAMING.md · Plan: docs/naming/PLAN.md §Wave 2 · ADR-198 · ADR-208
--
-- WHY: practice depth tiers are locked as Initiate / Adept / Master; the old
-- Spark / Current / Deep set is RETIRED (NAMING.md §The Quest). The default stays the
-- MIDDLE tier — old default `'current'` → new default `'adept'` — preserving exactly
-- the prior behavior ("this step runs the middle tier unless overridden"). Tier never
-- touches Zap or streak math; this is a pure label rename of stored text values + the
-- CHECK constraints + column defaults that enumerate them.
--
-- DESIGN (data-preserving, idempotent):
--   Four columns store tier text behind a `check (… in ('spark','current','deep'))`:
--     practice_tiers.tier                      (NOT NULL, no default)
--     journey_plan_items.default_tier          (NOT NULL default 'current')
--     circles.default_intensity_tier           (nullable, no default)
--     journey_plan_adoptions.tier_override      (nullable, no default)
--   For each: DROP the existing CHECK (found by catalog lookup so the auto-generated
--   name is irrelevant and re-runs are safe), then UPDATE the stored values
--   spark→initiate / current→adept / deep→master, then re-add a NAMED CHECK over the
--   canon set. Defaults flip 'current' → 'adept'. Order matters — constraints down,
--   data across, constraints up — so no row ever violates a live constraint.
--   The 48 seeded practice_tiers rows (16 practices × 3 tiers, 20260609103000) and
--   every default_tier='current' seed row are caught by the blanket UPDATEs.
--
-- RLS: none touched (no policy references tier text).
--
-- NOTE: lib/database.types.ts must be regenerated after apply (the tier string
--   unions change). Wave-3 flips the TS constants/types (initiate/adept/master).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper-free, explicit per-column handling. Each block:
--   (a) drops every CHECK constraint currently defined on the column,
--   (b) is followed by the data UPDATE + a re-added named CHECK below.
-- Dropping by catalog lookup makes this independent of auto-generated names and
-- idempotent (re-run finds the new canon constraint, which still references the
-- column, so we also guard the re-add with IF NOT EXISTS via name).
-- ---------------------------------------------------------------------------

-- 1. Drop the old tier CHECKs on all four columns (any constraint mentioning the
--    retired values, located by definition text so the generated name is moot).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public'
      AND con.contype = 'c'
      AND rel.relname IN ('practice_tiers','journey_plan_items','circles','journey_plan_adoptions')
      AND pg_get_constraintdef(con.oid) ILIKE '%''spark''%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
  END LOOP;
END $$;

-- 2. Drop the old default on journey_plan_items.default_tier so the data UPDATE
--    is not re-stamped, then flip it to the canon middle tier afterward.
ALTER TABLE public.journey_plan_items ALTER COLUMN default_tier DROP DEFAULT;

-- 3. Data — rename every stored tier value across all four columns.
UPDATE public.practice_tiers
   SET tier = CASE tier WHEN 'spark' THEN 'initiate'
                        WHEN 'current' THEN 'adept'
                        WHEN 'deep' THEN 'master' ELSE tier END
 WHERE tier IN ('spark','current','deep');

UPDATE public.journey_plan_items
   SET default_tier = CASE default_tier WHEN 'spark' THEN 'initiate'
                                        WHEN 'current' THEN 'adept'
                                        WHEN 'deep' THEN 'master' ELSE default_tier END
 WHERE default_tier IN ('spark','current','deep');

UPDATE public.circles
   SET default_intensity_tier = CASE default_intensity_tier WHEN 'spark' THEN 'initiate'
                                                            WHEN 'current' THEN 'adept'
                                                            WHEN 'deep' THEN 'master' ELSE default_intensity_tier END
 WHERE default_intensity_tier IN ('spark','current','deep');

UPDATE public.journey_plan_adoptions
   SET tier_override = CASE tier_override WHEN 'spark' THEN 'initiate'
                                          WHEN 'current' THEN 'adept'
                                          WHEN 'deep' THEN 'master' ELSE tier_override END
 WHERE tier_override IN ('spark','current','deep');

-- 4. Re-add named CHECKs over the canon set, and restore the (now canon) default.
--    DROP IF EXISTS by name first so a re-run does not error on a duplicate add.
ALTER TABLE public.practice_tiers DROP CONSTRAINT IF EXISTS practice_tiers_tier_check;
ALTER TABLE public.practice_tiers
  ADD CONSTRAINT practice_tiers_tier_check
  CHECK (tier IN ('initiate','adept','master'));

ALTER TABLE public.journey_plan_items
  ALTER COLUMN default_tier SET DEFAULT 'adept';
ALTER TABLE public.journey_plan_items DROP CONSTRAINT IF EXISTS journey_plan_items_default_tier_check;
ALTER TABLE public.journey_plan_items
  ADD CONSTRAINT journey_plan_items_default_tier_check
  CHECK (default_tier IN ('initiate','adept','master'));

ALTER TABLE public.circles DROP CONSTRAINT IF EXISTS circles_default_intensity_tier_check;
ALTER TABLE public.circles
  ADD CONSTRAINT circles_default_intensity_tier_check
  CHECK (default_intensity_tier IN ('initiate','adept','master'));

ALTER TABLE public.journey_plan_adoptions DROP CONSTRAINT IF EXISTS journey_plan_adoptions_tier_override_check;
ALTER TABLE public.journey_plan_adoptions
  ADD CONSTRAINT journey_plan_adoptions_tier_override_check
  CHECK (tier_override IN ('initiate','adept','master'));

-- 5. Re-canonicalize the column comments.
COMMENT ON TABLE public.practice_tiers IS
  'Initiate/Adept/Master content per practice (ADR-198; NAMING.md). Selection lives on journey items / circles / adoptions; tier never affects Zap or streak math.';
COMMENT ON COLUMN public.circles.default_intensity_tier IS
  'Host-set default Initiate/Adept/Master tier for the circle''s members (ADR-198). Null = inherit the journey item default.';
COMMENT ON COLUMN public.journey_plan_adoptions.tier_override IS
  'A member''s personal Initiate/Adept/Master override for this adopted Journey (ADR-198). Null = inherit circle/item default.';
