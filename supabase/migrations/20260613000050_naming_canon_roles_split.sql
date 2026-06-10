-- =============================================================================
-- Naming Canon 2026 — Wave 2 (5/5): split STAFF off community_role → web_role
-- Canon: docs/NAMING.md · Plan: docs/naming/PLAN.md §Wave 2 · ADR-208 (cf. ADR-207)
--
-- WHY: roles are two INDEPENDENT axes (NAMING.md §Roles). The community trust ladder
-- (member < crew < host < guide < mentor) is aspirational; the operational STAFF axis
-- (web_role: none | admin | janitor — "Site Admin" / "Executive Admin") is who may
-- enter admin surfaces and the janitor-only crown jewels. Today both live smashed into
-- ONE enum (community_role … < admin < janitor), so staff gates read `get_my_role() >=
-- 'admin'` / `= 'janitor'`. This introduces the dedicated `profiles.web_role`, moves
-- staff onto it, and rewrites ONLY the genuinely-STAFF RLS policies to read it. The
-- community ladder (`>= 'host'` etc.) is left entirely alone.
--
-- DESIGN (data-preserving, idempotent):
--   1. Add `profiles.web_role text NOT NULL DEFAULT 'none' CHECK IN ('none','admin',
--      'janitor')`.
--   2. Backfill from the soon-to-be-deprecated community_role rungs:
--        community_role = 'janitor' → web_role 'janitor'
--        community_role = 'admin'   → web_role 'admin'
--      (Run BEFORE any read flips so the gate authority is in place atomically.)
--   3. `get_my_web_role()` SECURITY DEFINER helper (mirrors get_my_role()).
--   4. Rewrite ONLY the staff-meaning policies — recreated from their NEWEST gen with
--      the comparison swapped to read get_my_web_role():
--        • studio_site_changes  "…: admin reads"  (20260608100000)  >= 'admin'  → staff
--        • reward_grants        "…: own or admin reads" (20260608110000) >= 'admin' → staff
--        • admin_audit_log      "…: admin reads"  (20260608130000)  >= 'admin'  → staff
--        • topical_channels     public-read / insert / update / delete (20240201000000) = 'janitor' → web janitor
--        • topical_channel_memberships "tcm: read own" (20240201000000)        = 'janitor' → web janitor
--      "staff" = web_role IN ('admin','janitor'); "janitor-only" = web_role = 'janitor'.
--      Community-ladder policies (`>= 'host'`, `>= 'member'`, the reports host+/janitor
--      moderation gate) are NOT touched — left as community_role.
--   5. community_role 'admin'/'janitor' enum VALUES are KEPT as DEPRECATED no-ops
--      (dropping a PG enum value requires recreating the type + rewriting every
--      dependent column/policy/function — disruptive; enum ORDER is load-bearing for
--      the remaining `>= 'rung'` community comparisons). Documented on the type, exactly
--      the ADR-207 'crew' precedent (20260612060000). Rows are NOT moved off the rungs
--      here; the staff authority now lives on web_role and the rewritten policies read
--      it, so the community_role admin/janitor rungs are simply no longer consulted by
--      staff gates.
--
--   The billing-webhook crew auto-set is CODE (Wave 3), NOT this migration.
--
-- HUMAN-REVIEW REPORT (capture at APPLY time — cannot be enumerated from the repo):
--   The exact set of profiles that received web_role = 'admin' or 'janitor' by the
--   step-2 backfill MUST be captured at apply time (SELECT id, handle, community_role,
--   web_role FROM profiles WHERE web_role <> 'none') and attached to the Wave-2
--   human-review report — this is the precise list of members granted staff access
--   under the new axis.
--
-- NOTE: lib/database.types.ts regen required after apply. Wave-3 (track B) rewires
--   lib/core/roles.ts, capabilities, auth.ts, requireAdmin/guard to the web_role axis.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The web_role column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS web_role text NOT NULL DEFAULT 'none'
    CHECK (web_role IN ('none','admin','janitor'));

COMMENT ON COLUMN public.profiles.web_role IS
  'Operational STAFF axis (NAMING.md §Roles, ADR-208): none | admin (Site Admin) | janitor (Executive Admin). Independent of the community_role trust ladder. Who may enter admin surfaces; janitor holds the crown jewels. The team_members matrix (ADR-127) stays as the fine-grained per-domain layer.';

-- ---------------------------------------------------------------------------
-- 2. Backfill staff from the (now-deprecated) community_role rungs. The
--    prevent_role_self_escalation() guard fires only on community_role changes, so it
--    does NOT need disabling here (web_role is a new column it does not watch).
-- ---------------------------------------------------------------------------
UPDATE public.profiles SET web_role = 'janitor'
  WHERE community_role = 'janitor' AND web_role <> 'janitor';
UPDATE public.profiles SET web_role = 'admin'
  WHERE community_role = 'admin'   AND web_role NOT IN ('admin','janitor');

-- ---------------------------------------------------------------------------
-- 3. get_my_web_role() — SECURITY DEFINER, pinned search_path (mirrors get_my_role).
--    Returns 'none' for unauthenticated / unmatched callers so `in (...)` / `=`
--    comparisons are null-safe in policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_my_web_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT web_role FROM profiles WHERE auth_user_id = auth.uid()),
    'none'
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Rewrite the STAFF-meaning RLS policies to read web_role.
-- ---------------------------------------------------------------------------

-- 4a. studio_site_changes — admin+ read  (newest gen 20260608100000). STAFF gate.
DROP POLICY IF EXISTS "studio_site_changes: admin reads" ON public.studio_site_changes;
CREATE POLICY "studio_site_changes: admin reads"
  ON public.studio_site_changes FOR SELECT
  USING (get_my_web_role() IN ('admin','janitor'));

-- 4b. reward_grants — own or admin+ read  (newest gen 20260608110000). STAFF gate
--     (the own-row branch is unchanged).
DROP POLICY IF EXISTS "reward_grants: own or admin reads" ON public.reward_grants;
CREATE POLICY "reward_grants: own or admin reads"
  ON public.reward_grants FOR SELECT
  USING (profile_id = get_my_profile_id() OR get_my_web_role() IN ('admin','janitor'));

-- 4c. admin_audit_log — admin+ read  (newest gen 20260608130000). STAFF gate.
DROP POLICY IF EXISTS "admin_audit_log: admin reads" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log: admin reads"
  ON public.admin_audit_log FOR SELECT
  USING (get_my_web_role() IN ('admin','janitor'));

-- 4d. topical_channels — the janitor-only write/visibility gates (newest gen
--     20240201000000). `= 'janitor'` meant the Executive-Admin crown-jewel; now
--     web_role = 'janitor'. Predicates otherwise verbatim.
DROP POLICY IF EXISTS "topical_channels: public read active" ON public.topical_channels;
CREATE POLICY "topical_channels: public read active"
  ON public.topical_channels FOR SELECT
  USING (is_active = true OR get_my_web_role() = 'janitor');

DROP POLICY IF EXISTS "topical_channels: janitor insert" ON public.topical_channels;
CREATE POLICY "topical_channels: janitor insert"
  ON public.topical_channels FOR INSERT
  WITH CHECK (get_my_web_role() = 'janitor');

DROP POLICY IF EXISTS "topical_channels: janitor update" ON public.topical_channels;
CREATE POLICY "topical_channels: janitor update"
  ON public.topical_channels FOR UPDATE
  USING (get_my_web_role() = 'janitor');

DROP POLICY IF EXISTS "topical_channels: janitor delete" ON public.topical_channels;
CREATE POLICY "topical_channels: janitor delete"
  ON public.topical_channels FOR DELETE
  USING (get_my_web_role() = 'janitor');

-- 4e. topical_channel_memberships read — own OR janitor (newest gen 20240201000000).
--     The janitor branch is the staff override; the own-row branch is unchanged.
DROP POLICY IF EXISTS "tcm: read own" ON public.topical_channel_memberships;
CREATE POLICY "tcm: read own"
  ON public.topical_channel_memberships FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_web_role() = 'janitor'
  );

-- ---------------------------------------------------------------------------
-- 5. Mark the community_role admin/janitor rungs DEPRECATED (kept for enum-order
--    safety — the remaining community `>= 'rung'` comparisons still depend on order).
--    Same precedent as the 'crew' value (ADR-207, 20260612060000).
-- ---------------------------------------------------------------------------
COMMENT ON TYPE public.community_role IS
  'Community trust ladder: member < crew < host < guide < mentor < admin < janitor. The ''crew'' value is DEPRECATED (20260612060000). The ''admin'' and ''janitor'' values are now ALSO DEPRECATED for STAFF gating (20260613000050 / ADR-208): operational staff lives on profiles.web_role and the staff RLS policies read get_my_web_role(). The enum VALUES are kept (dropping a PG enum value is disruptive) and enum ORDER remains load-bearing for the community-ladder >= comparisons (host/guide/mentor); staff gates no longer consult these rungs.';
