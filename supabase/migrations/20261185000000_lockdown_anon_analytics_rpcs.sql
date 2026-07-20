-- SECURITY: revoke anon/authenticated EXECUTE on three SECURITY DEFINER functions that do NOT scope to
-- auth.uid(), so they must never be callable directly via the public anon key at /rest/v1/rpc/<fn>.
--   • find_contact_matches(p_owner uuid) — trusts a client-supplied owner id → IDOR: reads any member's
--     imported contacts + email/phone reconciliation.
--   • member_interaction_stats(_days) / interaction_surface_stats(_days,_limit) — return platform-wide
--     per-member behavioral analytics with no caller predicate.
-- All three are ONLY called server-side through the service-role admin client (lib/connections/matching.ts,
-- lib/traits/refresh.ts, lib/studio/recommendations.ts), which bypasses GRANTs — so revoking anon +
-- authenticated closes the exposure with zero app impact. service_role + owner keep EXECUTE. Idempotent.
revoke execute on function public.find_contact_matches(uuid) from anon, authenticated;
revoke execute on function public.member_interaction_stats(integer) from anon, authenticated;
revoke execute on function public.interaction_surface_stats(integer, integer) from anon, authenticated;
