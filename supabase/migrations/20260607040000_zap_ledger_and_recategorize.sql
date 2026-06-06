-- =============================================================================
-- Zap ledger + reward recategorization (ADR-139)
--
-- WHY: Gems already have a ledger (gem_transactions → after_gem_transaction
-- keeps profile totals in lockstep). Zaps did NOT — every grant wrote
-- profiles.current_season_zaps / lifetime_zaps directly from ~6 call sites
-- (awardZaps, the crew-completion trigger, the achievement trigger, and the
-- challenge/quest engine). That left two problems:
--   1. No "how you earned" history for zaps → the Vault points log was impossible.
--   2. The meta-layer (achievements, season challenges, quests) granted ZAPS for
--      ONLINE milestones (e.g. unlocking "First Post" or finishing the
--      "Content Creator" quest step paid zaps), violating the model
--      "online → Gems, real-life → Zaps". And achievements double-awarded:
--      app code paid the reward as gems while this trigger paid the same as zaps.
--
-- FIX: give zaps a transaction ledger that mirrors gems, route EVERY zap grant
-- through it (so totals + rank advance in one place and every grant is logged),
-- and stop the achievement trigger from paying zaps — the application layer now
-- pays each reward in the currency that matches the action's nature
-- (lib/engagement/currency.ts → currencyForCriteria).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Zap transaction ledger (mirrors gem_transactions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS zap_transactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  action_type text        NOT NULL,
  amount      integer     NOT NULL,
  metadata    jsonb       DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zap_transactions_profile ON zap_transactions (profile_id);
CREATE INDEX IF NOT EXISTS idx_zap_transactions_action  ON zap_transactions (action_type);
CREATE INDEX IF NOT EXISTS idx_zap_transactions_created ON zap_transactions (created_at);

ALTER TABLE zap_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zap_transactions: read own or host reads all" ON zap_transactions;
CREATE POLICY "zap_transactions: read own or host reads all"
  ON zap_transactions FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'host'
  );

-- ---------------------------------------------------------------------------
-- 2. Trigger: a zap transaction is the ONE place season/lifetime totals AND the
--    season rank move. Auto-advances rank up to Conduit (1500); Luminary stays a
--    manual admin promotion gated on season_challenges_complete (see GLOSSARY).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_zap_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.amount,
      lifetime_zaps       = lifetime_zaps + NEW.amount
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

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

DROP TRIGGER IF EXISTS trg_after_zap_transaction ON zap_transactions;
CREATE TRIGGER trg_after_zap_transaction
  AFTER INSERT ON zap_transactions
  FOR EACH ROW
  EXECUTE FUNCTION after_zap_transaction();

-- ---------------------------------------------------------------------------
-- 3. Route crew-task completions through the ledger.
--    Crew/outreach tasks are real-life work → zaps. Previously this trigger wrote
--    profile columns directly (invisible to the log); now it appends a ledger row
--    and lets after_zap_transaction own totals + rank. Single count (the direct
--    profile update is removed).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_crew_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.zaps_earned, 0) > 0 THEN
    INSERT INTO zap_transactions (profile_id, action_type, amount, metadata)
    VALUES (NEW.profile_id, 'crew_task', NEW.zaps_earned,
            jsonb_build_object('task_id', NEW.task_id));
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Achievements no longer pay zaps from the DB trigger.
--    The application layer (lib/achievements.ts) now awards each achievement's
--    reward in the currency that matches its criteria — online achievements pay
--    gems, in-person ones pay zaps — going through the relevant ledger. The
--    trigger keeps ONLY its non-economic job: bumping achievement_count. This
--    removes the long-standing double-award (gems in code + zaps in the trigger).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_achievement_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET achievement_count = achievement_count + 1
  WHERE id = NEW.profile_id;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Doc/code drift fix: gem_config row for 'achievement' described the old
--    (wrong) behavior. Achievement rewards are paid per-achievement in the
--    currency that fits the milestone; this config row is the gems path only.
-- ---------------------------------------------------------------------------

UPDATE gem_config
SET description = 'Unlocked an online achievement (amount is the achievement''s reward; in-person achievements pay zaps instead).'
WHERE action_type = 'achievement';

-- ---------------------------------------------------------------------------
-- 6. season rollover: zero the new ledger-fed columns is unnecessary (reset_season
--    already zeroes current_season_zaps); the ledger is a permanent history and is
--    intentionally NOT cleared at season end (it is the lifetime "how you earned"
--    record, same as gem_transactions).
-- ---------------------------------------------------------------------------
