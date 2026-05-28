-- =============================================================================
-- Prevent profile.community_role self-escalation.
--
-- Background: the "profiles: self update" policy added in
-- 20240101000001_rls_policies.sql allows authenticated users to update any
-- column on their own row (USING auth_user_id = auth.uid()). The comment
-- says "role changes must be done via service-role or trigger" but the
-- policy doesn't actually enforce that, so a determined user can promote
-- themselves to mentor via a direct UPDATE.
--
-- This migration adds a BEFORE UPDATE trigger that rejects community_role
-- changes unless the caller is the service_role. Admin actions in
-- app/(main)/admin/actions.ts and upgrade/actions.ts already use the
-- service-role client, so legitimate role changes continue to work.
-- =============================================================================


CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce when community_role is actually changing.
  IF NEW.community_role IS DISTINCT FROM OLD.community_role
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION
      'community_role cannot be modified by users — use admin actions'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;
  RETURN NEW;
END;
$$;


-- Trigger fires on every UPDATE; the function early-exits when the column
-- isn't actually changing, so the cost is negligible for normal profile
-- edits (display_name, bio, avatar_url, last_seen_at, etc.).
DROP TRIGGER IF EXISTS prevent_role_self_escalation ON profiles;
CREATE TRIGGER prevent_role_self_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_self_escalation();
