-- =====================================================================
-- Migration: Rename season ranks — old martial-arts names → The Field
-- Canonical reference: notion.so/36bfb0d4b941810db128cf207401745e
--
-- Old → New mapping (season_rank_enum / profiles.current_season_rank):
--   crew        → ghost
--   deshi       → runner
--   sempai      → operative
--   sensei      → agent
--   sifu        → conduit
--   bodhisattva → luminary
--
-- IMPORTANT: Only updates current_season_rank.
-- profiles.community_role 'crew' is a separate concept and is NOT touched.
-- =====================================================================

-- 1. Drop dependent functions (CASCADE removes the trigger on crew_completions).
--    They reference old enum literals and would block enum changes.
DROP FUNCTION IF EXISTS after_crew_completion() CASCADE;
DROP FUNCTION IF EXISTS reset_season();

-- 2. Move the old enum aside so we can create a new one with the canonical name.
ALTER TYPE season_rank_enum RENAME TO season_rank_enum_legacy;

-- 3. Create the new enum with the locked rank names.
CREATE TYPE season_rank_enum AS ENUM (
  'ghost', 'runner', 'operative', 'agent', 'conduit', 'luminary'
);

-- 4. Swap the column type, mapping old values → new values.
ALTER TABLE profiles ALTER COLUMN current_season_rank DROP DEFAULT;

ALTER TABLE profiles
  ALTER COLUMN current_season_rank TYPE season_rank_enum
  USING (
    CASE current_season_rank::text
      WHEN 'crew'        THEN 'ghost'::season_rank_enum
      WHEN 'deshi'       THEN 'runner'::season_rank_enum
      WHEN 'sempai'      THEN 'operative'::season_rank_enum
      WHEN 'sensei'      THEN 'agent'::season_rank_enum
      WHEN 'sifu'        THEN 'conduit'::season_rank_enum
      WHEN 'bodhisattva' THEN 'luminary'::season_rank_enum
    END
  );

ALTER TABLE profiles ALTER COLUMN current_season_rank SET DEFAULT 'ghost'::season_rank_enum;

-- 5. Drop the legacy enum now that nothing references it.
DROP TYPE season_rank_enum_legacy;

-- 6. Recreate the auto-advance trigger function with new rank names.
--    Auto-advances on crew_completion insert; luminary remains a manual
--    promotion (admin button) gated by season_challenges_complete.
CREATE OR REPLACE FUNCTION after_crew_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.zaps_earned
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

  -- Auto-advance up to conduit; luminary is manually assigned via admin
  -- panel and requires season_challenges_complete = true.
  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('agent', 'conduit', 'luminary')
         THEN 'agent'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('operative', 'agent', 'conduit', 'luminary')
         THEN 'operative'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('runner', 'operative', 'agent', 'conduit', 'luminary')
         THEN 'runner'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_crew_completion ON crew_completions;
CREATE TRIGGER trg_after_crew_completion
  AFTER INSERT ON crew_completions
  FOR EACH ROW
  EXECUTE FUNCTION after_crew_completion();

-- 7. Recreate reset_season() with new default rank.
--    season_challenges_complete is now ALSO reset so luminary must be
--    re-earned each season.
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      season_challenges_complete = false
  WHERE TRUE;
END;
$$;
