-- =============================================================================
-- Close a self-edit hole: guard profiles.lifetime_rank from non-service-role writes.
--
-- prevent_economy_self_edit (20240304000000) blocks self-edits to the economy/rank
-- columns, but lifetime_rank (added later, 20260608060000) was never added to the
-- guard list. The "profiles: self update" RLS policy lets an authenticated user
-- UPDATE their own row, so a member could run, from the browser anon client,
--   supabase.from('profiles').update({ lifetime_rank: 'master' }).eq('id', self)
-- and self-grant the peak lifetime rank. That isn't cosmetic: the `seasoned_agent`
-- retroactive reward (lib/rewards/rules.ts) pays 200 Gems to anyone whose
-- lifetime_rank reached Adept or above, so the hole is an economic self-grant.
--
-- All legitimate writes to lifetime_rank go through the service-role admin client
-- (the completion path in lib/quest/complete.ts) or SECURITY DEFINER triggers/RPCs
-- (after_zap_transaction, reset_season), which run as service_role and bypass this
-- guard. Adding lifetime_rank to the condition closes the direct-write path without
-- affecting any of them.
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

-- ── UP ───────────────────────────────────────────────────────────────────────
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
     OR NEW.lifetime_rank              IS DISTINCT FROM OLD.lifetime_rank
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

-- ── DOWN ───────────────────────────────────────────────────────────────────────
-- Re-run 20240304000000_lock_economy_columns.sql to drop lifetime_rank from the guard.
