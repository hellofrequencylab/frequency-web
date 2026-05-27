-- =====================================================================
-- Migration: Season Ranks & Zaps rename
-- 1. Rename points_value → zaps_value in crew_tasks
-- 2. Rename points_earned → zaps_earned in crew_completions
-- 3. Add season rank enum + profile fields
-- 4. Trigger to auto-advance season rank on completion
-- =====================================================================

-- 1. Rename points columns
ALTER TABLE crew_tasks       RENAME COLUMN points_value  TO zaps_value;
ALTER TABLE crew_completions RENAME COLUMN points_earned TO zaps_earned;

-- 2. Season rank enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'season_rank_enum') THEN
    CREATE TYPE season_rank_enum AS ENUM (
      'crew', 'deshi', 'sempai', 'sensei', 'sifu', 'bodhisattva'
    );
  END IF;
END
$$;

-- 3. Add season fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS current_season_rank        season_rank_enum NOT NULL DEFAULT 'crew',
  ADD COLUMN IF NOT EXISTS current_season_zaps        integer          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS season_challenges_complete boolean          NOT NULL DEFAULT false;

-- 4. Trigger: on each crew_completion insert, increment current_season_zaps
--    and auto-advance current_season_rank (crew→sifu; bodhisattva is manually gated)
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

  -- Auto-advance rank up to sifu; bodhisattva requires season_challenges_complete
  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('sifu', 'bodhisattva')
         THEN 'sifu'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('sensei', 'sifu', 'bodhisattva')
         THEN 'sensei'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('sempai', 'sensei', 'sifu', 'bodhisattva')
         THEN 'sempai'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('deshi', 'sempai', 'sensei', 'sifu', 'bodhisattva')
         THEN 'deshi'::season_rank_enum
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

-- 5. Season reset helper (call via admin or cron at end of 13-week season)
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET current_season_zaps = 0,
      current_season_rank = 'crew'::season_rank_enum
  WHERE TRUE;
  -- season_challenges_complete is intentionally NOT reset here;
  -- that is managed per-profile by admins.
END;
$$;
