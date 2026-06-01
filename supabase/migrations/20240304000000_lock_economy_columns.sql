-- =============================================================================
-- Lock economy / rank / status / cosmetic columns on profiles from self-edit.
--
-- Background: the "profiles: self update" policy (20240101000001_rls_policies.sql)
-- lets an authenticated user UPDATE any column on their own row. A prior
-- migration (20240205000000) closed community_role self-escalation with a
-- trigger, but the gamification economy left every other sensitive column open:
-- a signed-in user could run, from the browser anon client,
--   supabase.from('profiles').update({ lifetime_gems: 999999,
--     current_season_rank: 'luminary', season_challenges_complete: true })
-- and self-grant the entire economy, leaderboard rank, store-purchasing power,
-- and even un-suspend themselves (is_active).
--
-- All legitimate writes to these columns go through server actions using the
-- service-role admin client (zaps/gems award, gem store, moderation, season
-- rollover), so a BEFORE UPDATE trigger that rejects changes from anyone other
-- than the service role closes the hole without affecting normal profile edits
-- (display_name, bio, avatar_url, presence, region).
-- =============================================================================

CREATE OR REPLACE FUNCTION prevent_economy_self_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND (
        NEW.current_season_zaps        IS DISTINCT FROM OLD.current_season_zaps
     OR NEW.lifetime_zaps              IS DISTINCT FROM OLD.lifetime_zaps
     OR NEW.current_season_gems        IS DISTINCT FROM OLD.current_season_gems
     OR NEW.lifetime_gems              IS DISTINCT FROM OLD.lifetime_gems
     OR NEW.current_season_rank        IS DISTINCT FROM OLD.current_season_rank
     OR NEW.season_challenges_complete IS DISTINCT FROM OLD.season_challenges_complete
     OR NEW.is_active                  IS DISTINCT FROM OLD.is_active
     OR NEW.profile_border             IS DISTINCT FROM OLD.profile_border
     OR NEW.profile_flair              IS DISTINCT FROM OLD.profile_flair
     OR NEW.custom_title               IS DISTINCT FROM OLD.custom_title
     OR NEW.profile_theme              IS DISTINCT FROM OLD.profile_theme
  ) THEN
    RAISE EXCEPTION
      'economy, rank, status, and cosmetic columns cannot be modified by users - use server actions'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;
  RETURN NEW;
END;
$$;

-- Early-exits when none of the guarded columns change, so ordinary profile
-- edits pay only a cheap column comparison.
DROP TRIGGER IF EXISTS prevent_economy_self_edit ON profiles;
CREATE TRIGGER prevent_economy_self_edit
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_economy_self_edit();
