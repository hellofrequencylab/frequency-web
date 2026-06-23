-- =============================================================================
-- Security forward-fix to 20260726_round2_concurrency_guards (ADR-371).
--
-- The round-2 migration created two SECURITY DEFINER spend RPCs (gift_gems_atomic,
-- redeem_store_item_atomic) and one SECURITY DEFINER trigger function
-- (enforce_circle_member_cap), and locked them with `revoke all ... from public` +
-- `grant execute ... to service_role`. That is NOT enough on Supabase: a new public
-- function is auto-granted EXECUTE to `anon` AND `authenticated` DIRECTLY (not via
-- PUBLIC), so revoking PUBLIC leaves those two role grants in place. The post-apply
-- security advisor caught it (anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable).
--
-- Impact: gift_gems_atomic / redeem_store_item_atomic take the SPENDER as a parameter
-- and run as the definer (bypassing RLS), so while those grants stood a logged-in
-- member could POST /rest/v1/rpc/gift_gems_atomic with an arbitrary _giver and move
-- Gems out of any account. These RPCs are only ever called from already-authorized
-- server actions through the SERVICE ROLE, so revoking anon + authenticated is safe
-- and changes no app behavior. enforce_circle_member_cap is a trigger function: the
-- trigger fires regardless of EXECUTE privilege, so locking it down loses nothing.
--
-- Idempotent + SAFE to re-run. Applied to production 2026-06-23 via MCP
-- (recorded as lock_down_atomic_rpcs).
--
-- ROLLBACK (not recommended; this closes a real hole):
--   grant execute on function public.gift_gems_atomic(uuid, uuid, integer)        to anon, authenticated;
--   grant execute on function public.redeem_store_item_atomic(uuid, uuid, integer) to anon, authenticated;
-- =============================================================================

revoke execute on function public.gift_gems_atomic(uuid, uuid, integer)        from public, anon, authenticated;
revoke execute on function public.redeem_store_item_atomic(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.enforce_circle_member_cap()                   from public, anon, authenticated;

grant execute on function public.gift_gems_atomic(uuid, uuid, integer)        to service_role;
grant execute on function public.redeem_store_item_atomic(uuid, uuid, integer) to service_role;
