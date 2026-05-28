-- =============================================================================
-- Migration: Community Gems Economy — dual currency, daily caps, season trophies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Gem action types and config
-- ---------------------------------------------------------------------------

CREATE TABLE gem_config (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text    UNIQUE NOT NULL,
  gems_amount integer NOT NULL DEFAULT 1,
  daily_cap   integer,
  description text    NOT NULL,
  is_active   boolean NOT NULL DEFAULT true
);

INSERT INTO gem_config (action_type, gems_amount, daily_cap, description) VALUES
  ('post_create',     3, 2,    'Create a post in the feed'),
  ('comment_reply',   1, 5,    'Reply or comment on a post'),
  ('reaction',        1, 3,    'React to a post'),
  ('daily_login',     1, 1,    'Log in for the day'),
  ('welcome_member',  5, NULL, 'Reply to a member who joined in the last 7 days'),
  ('event_rsvp',      5, NULL, 'RSVP going to an event'),
  ('circle_join',     3, NULL, 'Join a circle'),
  ('achievement',     0, NULL, 'Unlock an achievement (amount = achievement zaps_reward)'),
  ('quest_complete',  25, NULL, 'Complete a quest chain'),
  ('challenge_complete', 10, NULL, 'Complete a season challenge'),
  ('season_convert',  0, NULL, 'End-of-season zap conversion (amount varies by rank)')
ON CONFLICT (action_type) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Gem transaction ledger
-- ---------------------------------------------------------------------------

CREATE TABLE gem_transactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  action_type text        NOT NULL,
  amount      integer     NOT NULL,
  metadata    jsonb       DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gem_transactions_profile  ON gem_transactions (profile_id);
CREATE INDEX idx_gem_transactions_action   ON gem_transactions (action_type);
CREATE INDEX idx_gem_transactions_created  ON gem_transactions (created_at);
CREATE INDEX idx_gem_transactions_daily    ON gem_transactions (profile_id, action_type, created_at);

-- ---------------------------------------------------------------------------
-- 3. Season trophies — permanent record of each member's season performance
-- ---------------------------------------------------------------------------

CREATE TABLE season_trophies (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  season         integer     NOT NULL,
  final_rank     text        NOT NULL,
  final_zaps     integer     NOT NULL DEFAULT 0,
  gems_converted integer     NOT NULL DEFAULT 0,
  challenges_completed integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, season)
);

CREATE INDEX idx_season_trophies_profile ON season_trophies (profile_id);
CREATE INDEX idx_season_trophies_season  ON season_trophies (season);

-- ---------------------------------------------------------------------------
-- 4. Add gem columns to profiles
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lifetime_gems       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_season_gems integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE gem_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE gem_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_trophies  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gem_config: public read"
  ON gem_config FOR SELECT USING (true);

CREATE POLICY "gem_transactions: read own or host reads all"
  ON gem_transactions FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'host'
  );

CREATE POLICY "season_trophies: public read"
  ON season_trophies FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 6. Trigger: auto-increment profile gem counts on transaction insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_gem_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET lifetime_gems       = lifetime_gems + NEW.amount,
      current_season_gems = current_season_gems + NEW.amount
  WHERE id = NEW.profile_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_gem_transaction
  AFTER INSERT ON gem_transactions
  FOR EACH ROW
  EXECUTE FUNCTION after_gem_transaction();

-- ---------------------------------------------------------------------------
-- 7. Updated reset_season() — converts zaps to gems + mints trophies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_season_num integer;
  r RECORD;
  conversion_rate numeric;
  converted integer;
  challenges_done integer;
BEGIN
  -- Determine season number (count existing trophy seasons + 1)
  SELECT COALESCE(MAX(season), 0) + 1 INTO current_season_num FROM season_trophies;

  -- For each active profile with zaps > 0, mint trophy and convert
  FOR r IN
    SELECT id, current_season_rank, current_season_zaps, season_challenges_complete
    FROM profiles
    WHERE current_season_zaps > 0
  LOOP
    -- Rank-based conversion rate
    conversion_rate := CASE r.current_season_rank::text
      WHEN 'luminary'  THEN 1.0 / 1.5
      WHEN 'conduit'   THEN 1.0 / 2.0
      WHEN 'agent'     THEN 1.0 / 3.0
      WHEN 'operative' THEN 1.0 / 4.0
      ELSE                  1.0 / 5.0
    END;

    converted := FLOOR(r.current_season_zaps * conversion_rate);

    -- Count completed challenges
    SELECT COUNT(*) INTO challenges_done
    FROM challenge_progress
    WHERE profile_id = r.id AND completed_at IS NOT NULL;

    -- Mint season trophy
    INSERT INTO season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    VALUES (r.id, current_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    ON CONFLICT (profile_id, season) DO NOTHING;

    -- Award converted gems
    IF converted > 0 THEN
      INSERT INTO gem_transactions (profile_id, action_type, amount, metadata)
      VALUES (r.id, 'season_convert', converted,
        jsonb_build_object('season', current_season_num, 'rank', r.current_season_rank::text, 'zaps', r.current_season_zaps));
    END IF;
  END LOOP;

  -- Reset seasonal counters
  UPDATE profiles
  SET current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      current_season_gems        = 0,
      season_challenges_complete = false
  WHERE TRUE;

  -- Reset streaks
  UPDATE streaks
  SET current_count    = 0,
      last_activity_at = NULL,
      updated_at       = now()
  WHERE TRUE;

  -- Clear challenge progress
  DELETE FROM challenge_progress;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Pre-populate crew tasks for things we can implement now
-- ---------------------------------------------------------------------------

INSERT INTO crew_tasks (name, task_type, zaps_value, is_repeatable, requires_verification) VALUES
  ('Invite someone who joins',       'referral',      15, true,  true),
  ('Host a weekly gathering',        'hosting',       25, true,  true),
  ('Post a circle recap',            'content',       10, true,  false),
  ('Welcome 3 new members this week','volunteering',  10, true,  true),
  ('Share Frequency with someone',   'referral',       5, true,  false),
  ('Organize a community outing',    'hosting',       30, false, true),
  ('Set up a new channel',           'other',         15, false, false)
ON CONFLICT DO NOTHING;
