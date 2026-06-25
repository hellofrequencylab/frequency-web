-- SECURITY FIX (IDOR): lock the dashboard analytics RPCs to the service role, mirroring ADR-371.
--
-- THE HOLE: dashboard_health_summary() and dashboard_space_health_summary(_space_id uuid) are
-- SECURITY DEFINER (they bypass RLS to aggregate operator analytics) and were EXECUTE-granted to
-- `authenticated` (20260801000000_engagement_scores.sql:147-148). A new public function on Supabase
-- is also auto-granted EXECUTE to `anon`/`authenticated` directly, so the table was wide open: any
-- signed-in member could POST /rest/v1/rpc/dashboard_space_health_summary with an ARBITRARY _space_id
-- and read platform-wide / per-space operator health numbers they should never see. Exactly the
-- gotcha 20260728000000_lock_down_atomic_rpcs.sql (ADR-371) closed for the spend RPCs.
--
-- WHY SAFE: both RPCs are only ever called from already-authorized server code through the SERVICE
-- ROLE (lib/dashboard/scores.ts uses createAdminClient at lines 101 + 139). The authenticated/anon
-- grant is unused by the app, so revoking it changes no app behavior — it only removes the direct
-- PostgREST reach. Idempotent + safe to re-run.
--
-- NOTE (owner): like ADR-371, the repo migration does not retroactively revoke the grant on the
-- LIVE database — apply this to production (Supabase MCP / dashboard) and record it, or the deployed
-- `authenticated` grant stands until then.
--
-- ROLLBACK (not recommended; this closes a real IDOR):
--   grant execute on function public.dashboard_health_summary()           to authenticated;
--   grant execute on function public.dashboard_space_health_summary(uuid) to authenticated;

revoke execute on function public.dashboard_health_summary()           from public, anon, authenticated;
revoke execute on function public.dashboard_space_health_summary(uuid) from public, anon, authenticated;

grant execute on function public.dashboard_health_summary()           to service_role;
grant execute on function public.dashboard_space_health_summary(uuid) to service_role;
