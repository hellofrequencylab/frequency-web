-- Advisor lockdown, phase 2 (standalone SECURITY DEFINER helpers — the safe subset).
-- Applied to prod + version-reconciled.
--
-- Of the 70 standalone SECURITY DEFINER functions flagged executable, 68 MUST keep EXECUTE:
-- 49 are legitimate PostgREST RPCs (called via supabase.rpc(...) from app code) and 18 are
-- RLS-policy helpers (referenced in USING/WITH CHECK; revoking would break RLS for the
-- querying role — verified via pg_depend), plus 1 PostGIS system function (st_estimatedextent).
-- Those advisor warnings are expected/"won't fix": the functions are intentionally callable.
--
-- Only these 2 are genuinely internal and safe to lock down:
--   recompute_community_level(uuid) — called only inside another function body (runs in that
--     SECURITY DEFINER caller's context; never needs the caller's own EXECUTE).
--   get_my_group_ids() — called nowhere (not an RPC, not policy-referenced, not in any body);
--     a legacy helper superseded by get_my_circle_ids()/get_my_hub_ids().

revoke execute on function public.recompute_community_level(uuid) from public, anon, authenticated;
revoke execute on function public.get_my_group_ids() from public, anon, authenticated;
