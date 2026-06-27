-- =============================================================================
-- Security advisor sweep — 2026-06-27
-- =============================================================================
-- Closes the two actionable, low-risk findings from get_advisors(security) that
-- are safely fixable in a migration. The remaining advisories are PostGIS-inherent
-- or fail-closed-safe and are documented in docs/AUDIT-2026-06-27.md (not "fixed"
-- here because the safe remediation is either a no-op or a dashboard toggle).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. function_search_path_mutable: pin the one trigger fn missing a search_path.
--    (lint 0011). circle_templates_touch_updated_at() is SECURITY INVOKER but had
--    no search_path set, so a malicious search_path could shadow an unqualified
--    object reference. Pin it to the trusted schemas — purely hardening, the
--    function body (a bump of updated_at) is unchanged.
-- ---------------------------------------------------------------------------
alter function public.circle_templates_touch_updated_at()
  set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. materialized_view_in_api: member_engagement_scores is a matview in the
--    public schema, so PostgREST's default grants expose it to anon/authenticated
--    over the Data API (lint 0016). It holds per-member resonance/churn/lifecycle
--    scoring — operator-only data. Every app read goes through the SERVICE-ROLE
--    admin client (lib/dashboard/scores.ts), which bypasses grants, so revoking
--    the API roles locks the matview out of the public API with ZERO app impact.
-- ---------------------------------------------------------------------------
revoke all on public.member_engagement_scores from anon, authenticated;

-- =============================================================================
-- NOT fixed here (documented as known/accepted in docs/AUDIT-2026-06-27.md):
--   • rls_disabled_in_public on `spatial_ref_sys` (ERROR) and extension_in_public
--     on `postgis`/`vector` — these are PostGIS/pgvector system objects owned by the
--     extensions. spatial_ref_sys is static public reference data (EPSG codes);
--     enabling RLS on it / relocating the extensions post-hoc is risky and offers
--     no real confidentiality gain. Left as-is by design.
--   • 68 × rls_enabled_no_policy (INFO) — these tables have RLS ON with no policy,
--     which is FAIL-CLOSED (deny-all to anon/authenticated). They're written/read
--     only via the service-role admin client server-side, so deny-all is the
--     correct posture, not a gap.
--   • 136 × auth_allow_anonymous_sign_ins (WARN) — public discover/landing reads are
--     intentionally anon-readable; the policies are scoped to public content.
--   • auth_leaked_password_protection disabled (WARN) — a project AUTH setting, not a
--     schema change. Recommend enabling HaveIBeenPwned checks in the Supabase
--     dashboard (Authentication → Policies). Cannot be set from a migration.
-- =============================================================================
