-- Security: lock down four SECURITY DEFINER functions that were EXECUTE-able by anon +
-- authenticated with NO internal authorization check. SECURITY DEFINER runs as the owner and
-- bypasses RLS, so any anonymous caller could invoke these directly (PostgREST exposes every
-- public function as an RPC endpoint). Verified anon_exec=true on the live DB before this fix.
--
--   reset_season()                        -- forces a platform-wide season rollover (converts
--                                            zaps->gems, resets ranks). Anyone could reset the season.
--   adjust_ticket_sold(uuid, int)         -- mutates event_ticket_types.sold by an arbitrary delta.
--                                            Anyone could tamper with any tier's inventory.
--   set_node_geo(uuid, float, float, int) -- moves/resizes any node's geofence. Anyone could
--                                            relocate or null out a ghost-node's capture radius.
--   refresh_member_engagement_scores()    -- expensive full-table recompute. Anon-callable => DoS.
--                                            (Its prior migration revoked only from `public`, which
--                                            does NOT drop Supabase's explicit anon/authenticated grants.)
--
-- Every legitimate caller uses the service_role admin client (createAdminClient), which KEEPS
-- EXECUTE, so this is behavior-preserving:
--   reset_season                     -> lib/seasons.ts (db() = createAdminClient)
--   adjust_ticket_sold               -> lib/billing/tickets.ts (db() = createAdminClient)
--   set_node_geo                     -> app/(main)/admin/qr/actions.ts (createAdminClient)
--   refresh_member_engagement_scores -> lib/traits/refresh.ts (createAdminClient)
--
-- Same additive lockdown pattern as 20260926/27000000 and award_gems_atomic: revoke from
-- public + anon + authenticated explicitly (not just public), grant execute to service_role.

revoke all on function public.reset_season() from public, anon, authenticated;
grant execute on function public.reset_season() to service_role;

revoke all on function public.adjust_ticket_sold(uuid, integer) from public, anon, authenticated;
grant execute on function public.adjust_ticket_sold(uuid, integer) to service_role;

revoke all on function public.set_node_geo(uuid, double precision, double precision, integer) from public, anon, authenticated;
grant execute on function public.set_node_geo(uuid, double precision, double precision, integer) to service_role;

revoke all on function public.refresh_member_engagement_scores() from public, anon, authenticated;
grant execute on function public.refresh_member_engagement_scores() to service_role;
