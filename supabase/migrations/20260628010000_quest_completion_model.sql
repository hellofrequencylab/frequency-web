-- =============================================================================
-- Quest Completion Model — rank 6→4, journey_completions, expression link,
-- per-journey windows (ADR-TBD; docs/GAMIFICATION-AUDIT.md §Quest migration)
--
-- Pre-launch beta: 12 test profiles, 0 journey enrollments. WIPE-and-reseed
-- confirmed. Data wipe is intentional and IRREVERSIBLE.
--
-- APPLY ORDER:
--   A. WIPE quest progress (enum swap requires all values to be 'ghost').
--   B. RANK ENUM 6→4: ghost/echo/signal/beacon/conduit/luminary → ghost/initiate/adept/master.
--      Replace after_zap_transaction() to remove rank-advance logic (rank now
--      advances via the completion path, built separately).
--   C. journey_completions table — canonical completion record.
--   D. season_challenges.journey_id — links Expression capstone to a Journey.
--   E. journey_plans window columns — per-Journey enrollment windows.
--   F. Deactivate all Season 1 challenges (dormant outreach).
--   G. Retire the Expression Journey (official=false, visibility=unlisted).
--
-- DOWN block at the bottom reverses every SCHEMA step.
-- NOTE: the data wipe (step A) is NOT reversible.
-- NOTE: regenerate lib/database.types.ts after apply.
-- =============================================================================


-- =============================================================================
-- A. WIPE QUEST PROGRESS
--    Reset all profile rank/zap state and purge progress tables so the enum
--    swap can proceed cleanly (all values become 'ghost' before the type drops).
-- =============================================================================

-- Reset profile season state (rank + zaps + challenge flag).
-- All current_season_rank / lifetime_rank values must be 'ghost' before we
-- swap the type below. The prevent_economy_self_edit trigger (20240304000000)
-- guards these columns against direct writes, so we disable it for the wipe.
ALTER TABLE public.profiles DISABLE TRIGGER prevent_economy_self_edit;
UPDATE public.profiles
  SET current_season_rank        = 'ghost',
      lifetime_rank              = 'ghost',
      current_season_zaps        = 0,
      season_challenges_complete = false;
ALTER TABLE public.profiles ENABLE TRIGGER prevent_economy_self_edit;

-- Purge per-season progress tables (IRREVERSIBLE).
DELETE FROM public.challenge_progress;
DELETE FROM public.season_trophies;
DELETE FROM public.journey_enrollments;
DELETE FROM public.journey_runs;

-- journey_lesson_progress exists (added in 20260617000000_journey_lesson_blocks.sql).
DELETE FROM public.journey_lesson_progress;


-- =============================================================================
-- B. RANK ENUM 6→4
--    ghost/echo/signal/beacon/conduit/luminary → ghost/initiate/adept/master
--
--    Cannot ALTER-remove values from a live enum, so we:
--      1. Replace after_zap_transaction() — strip the rank-advance block entirely,
--         preserve all other work (amplitude accrual, totals, lifetime_zaps).
--      2. Drop defaults on current_season_rank and lifetime_rank.
--      3. Create the new 4-value enum.
--      4. Cast both columns to the new type via USING 'ghost'.
--      5. Re-add defaults to 'ghost'.
--      6. Drop the old type and rename the new one to season_rank_enum.
-- =============================================================================

-- B.1. Replace after_zap_transaction().
--
--   Preserves from the 20260614200000_rewards_economy_v2.sql version:
--     * current_season_zaps accumulation
--     * lifetime_zaps accumulation
--     * amplitude accrual (including 2× hosting-class multiplier)
--     * lifetime_rank monotonic peak lock
--   REMOVED: the rank-advance CASE block that set current_season_rank to
--   echo/signal/beacon/conduit on zap thresholds. Under the completion model,
--   rank is NOT zap-driven; those enum values vanish → it would error on the
--   next zap. Rank now advances via the completion path (built in a later phase).

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
      lifetime_zaps       = lifetime_zaps + NEW.amount,
      amplitude           = amplitude + (NEW.amount::bigint *
        CASE WHEN NEW.action_type IN ('event_host','program_run','circle_start','circle_activate')
             THEN 2 ELSE 1 END)
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

  -- Lock the lifetime peak (monotonic — GREATEST never lowers it). The column
  -- stays: the retro rule `seasoned_agent` (lib/rewards/rules.ts) reads it even
  -- though Amplitude supersedes it as the member-facing lifetime layer.
  UPDATE profiles
  SET lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- B.2. Drop column defaults before type swap.
ALTER TABLE public.profiles
  ALTER COLUMN current_season_rank DROP DEFAULT,
  ALTER COLUMN lifetime_rank       DROP DEFAULT;

-- B.3. Create the new 4-value enum.
--      Declaration order is load-bearing for GREATEST() comparisons on lifetime_rank.
CREATE TYPE season_rank_enum_new AS ENUM ('ghost', 'initiate', 'adept', 'master');

-- B.4. Cast both columns.
--      All rows were reset to 'ghost' in step A, so the USING clause is safe.
ALTER TABLE public.profiles
  ALTER COLUMN current_season_rank
    TYPE season_rank_enum_new
    USING 'ghost'::season_rank_enum_new,
  ALTER COLUMN lifetime_rank
    TYPE season_rank_enum_new
    USING 'ghost'::season_rank_enum_new;

-- B.5. Restore defaults.
ALTER TABLE public.profiles
  ALTER COLUMN current_season_rank SET DEFAULT 'ghost'::season_rank_enum_new,
  ALTER COLUMN lifetime_rank       SET DEFAULT 'ghost'::season_rank_enum_new;

-- B.6. Drop the old type and promote the new one.
--      season_trophies.final_rank is TEXT — unaffected.
DROP TYPE season_rank_enum;
ALTER TYPE season_rank_enum_new RENAME TO season_rank_enum;


-- =============================================================================
-- C. COMPLETION TRACKING — journey_completions
--    One row per (profile, journey, season). Replaces the completed_at column
--    on journey_enrollments as the canonical completion record.
--
--    RLS mirrors journey_enrollments:
--      • member reads own (select by profile_id)
--      • writes are service-role (RLS enabled + no insert/update/delete policy)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.journey_completions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  journey_id  uuid        NOT NULL REFERENCES public.journey_plans(id) ON DELETE CASCADE,
  season      int         NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, journey_id, season)
);

CREATE INDEX IF NOT EXISTS journey_completions_profile_idx
  ON public.journey_completions (profile_id);
CREATE INDEX IF NOT EXISTS journey_completions_journey_idx
  ON public.journey_completions (journey_id, season);

ALTER TABLE public.journey_completions ENABLE ROW LEVEL SECURITY;

-- Member reads own completions.
DROP POLICY IF EXISTS "journey_completions: read own" ON public.journey_completions;
CREATE POLICY "journey_completions: read own"
  ON public.journey_completions
  FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid()));

-- Writes are service-role only (no INSERT/UPDATE/DELETE policy — RLS blocks
-- direct client writes; the completion path uses the admin client).

COMMENT ON TABLE public.journey_completions IS
  'Canonical completion record: one row per (profile, journey, season). Written by the completion path (service-role admin client). RLS: member reads own; writes service-role only. ADR-TBD.';


-- =============================================================================
-- D. EXPRESSION CAPSTONE — season_challenges.journey_id
--    Links a challenge of type "expression" to a Journey plan.
--    The `expression` challenge type rides the existing criteria jsonb as
--    {"type":"expression"}. The journey_id FK is nullable: null = not yet linked.
-- =============================================================================

ALTER TABLE public.season_challenges
  ADD COLUMN IF NOT EXISTS journey_id uuid REFERENCES public.journey_plans(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.season_challenges.journey_id IS
  'For expression-type challenges: the Journey plan whose completion satisfies this challenge. Null = not linked. ON DELETE SET NULL so retiring a Journey does not destroy the challenge row.';


-- =============================================================================
-- E. PER-JOURNEY ENROLLMENT WINDOWS — journey_plans.window_starts_at / window_ends_at
--    Controls when new enrollments are accepted for an official Journey.
--    Null = no window constraint (always open).
-- =============================================================================

ALTER TABLE public.journey_plans
  ADD COLUMN IF NOT EXISTS window_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS window_ends_at   timestamptz;

COMMENT ON COLUMN public.journey_plans.window_starts_at IS
  'Earliest timestamp at which new enrollments are accepted. Null = no constraint (always open).';
COMMENT ON COLUMN public.journey_plans.window_ends_at IS
  'Latest timestamp at which new enrollments are accepted. Null = no constraint (always open).';


-- =============================================================================
-- F. DORMANT OUTREACH — deactivate all Season 1 challenges.
--    Active challenges are re-seeded when the completion model launches.
--    Rows are never deleted (challenge_progress foreign keys them).
-- =============================================================================

UPDATE public.season_challenges
  SET is_active = false
  WHERE season = 1;


-- =============================================================================
-- G. RETIRE THE EXPRESSION JOURNEY
--    Marks official-1-expression as non-official and unlisted.
--    Enrolled members (0 at beta wipe) are unaffected.
-- =============================================================================

UPDATE public.journey_plans
  SET official    = false,
      visibility  = 'unlisted'
  WHERE slug = 'official-1-expression';


-- =============================================================================
-- ===== DOWN =====
-- Reverses every SCHEMA step above IN REVERSE ORDER.
-- WARNING: the data wipe (step A) is NOT reversible. Running DOWN only restores
-- the schema shape; it does NOT restore wiped rows.
--
-- To apply the DOWN block manually:
--   1. Run everything between the BEGIN and END below as a single transaction,
--      OR execute each statement individually in the listed order.
-- =============================================================================

/*

-- G DOWN: un-retire the Expression Journey.
UPDATE public.journey_plans
  SET official   = true,
      visibility = 'public'
  WHERE slug = 'official-1-expression';

-- F DOWN: re-activate Season 1 challenges.
UPDATE public.season_challenges
  SET is_active = true
  WHERE season = 1;

-- E DOWN: drop the per-Journey window columns.
ALTER TABLE public.journey_plans
  DROP COLUMN IF EXISTS window_starts_at,
  DROP COLUMN IF EXISTS window_ends_at;

-- D DOWN: drop the expression capstone link column.
ALTER TABLE public.season_challenges
  DROP COLUMN IF EXISTS journey_id;

-- C DOWN: drop journey_completions.
DROP TABLE IF EXISTS public.journey_completions;

-- B DOWN: restore the 6-value enum and the rank-advance trigger.

-- B.6 DOWN: re-create the original 6-value type.
--   Declaration order is load-bearing (ghost=1 … luminary=6) — do not reorder.
CREATE TYPE season_rank_enum_old AS ENUM (
  'ghost', 'echo', 'signal', 'beacon', 'conduit', 'luminary'
);

-- B.5 DOWN: drop defaults again before type swap.
ALTER TABLE public.profiles
  ALTER COLUMN current_season_rank DROP DEFAULT,
  ALTER COLUMN lifetime_rank       DROP DEFAULT;

-- B.4 DOWN: cast both columns back to the 6-value enum.
--   All rows are 'ghost' post-wipe, so the USING clause is safe.
ALTER TABLE public.profiles
  ALTER COLUMN current_season_rank
    TYPE season_rank_enum_old
    USING 'ghost'::season_rank_enum_old,
  ALTER COLUMN lifetime_rank
    TYPE season_rank_enum_old
    USING 'ghost'::season_rank_enum_old;

-- B.3 DOWN: drop the 4-value type.
DROP TYPE season_rank_enum;

-- B.2 DOWN / B.5 DOWN: restore defaults on the old type.
ALTER TABLE public.profiles
  ALTER COLUMN current_season_rank SET DEFAULT 'ghost'::season_rank_enum_old,
  ALTER COLUMN lifetime_rank       SET DEFAULT 'ghost'::season_rank_enum_old;

-- Rename old back to canonical name.
ALTER TYPE season_rank_enum_old RENAME TO season_rank_enum;

-- B.1 DOWN: restore after_zap_transaction() with the rank-advance block.
--   This is the 20260614200000_rewards_economy_v2.sql body verbatim.
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
      lifetime_zaps       = lifetime_zaps + NEW.amount,
      amplitude           = amplitude + (NEW.amount::bigint *
        CASE WHEN NEW.action_type IN ('event_host','program_run','circle_start','circle_activate')
             THEN 2 ELSE 1 END)
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('beacon', 'conduit', 'luminary')
         THEN 'beacon'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('signal', 'beacon', 'conduit', 'luminary')
         THEN 'signal'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('echo', 'signal', 'beacon', 'conduit', 'luminary')
         THEN 'echo'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  UPDATE profiles
  SET lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- A DOWN: not reversible — the data wipe cannot be undone from this migration.

*/
