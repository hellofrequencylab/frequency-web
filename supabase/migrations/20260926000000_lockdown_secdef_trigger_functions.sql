-- Advisor lockdown, phase 1 (trigger functions only — zero risk). Applied to prod + reconciled.
--
-- These 15 SECURITY DEFINER functions are trigger handlers: they fire as part of DML in the
-- table owner's context and are never called directly, so EXECUTE privilege is irrelevant to
-- their operation. Revoking it from public/anon/authenticated clears the
-- anon/authenticated_security_definer_function_executable advisor for them with no behavior
-- change. Verified: none is called via .rpc() in app code, none is referenced in an RLS policy.
--
-- NOT touched (needs a tested per-function pass — see docs/META-SCAN-STATUS.md): the ~73
-- STANDALONE SECURITY DEFINER functions. Many are legitimate PostgREST RPCs or RLS-policy
-- helpers that MUST keep EXECUTE (a function used in a USING/WITH CHECK clause needs the
-- querying role's EXECUTE, so a blind revoke would break RLS). Those require cross-checking
-- the .rpc() call set + policy references and running the suite before revoking.

revoke execute on function public.after_achievement_unlocked() from public, anon, authenticated;
revoke execute on function public.after_crew_completion() from public, anon, authenticated;
revoke execute on function public.after_gem_transaction() from public, anon, authenticated;
revoke execute on function public.after_store_redemption() from public, anon, authenticated;
revoke execute on function public.after_zap_transaction() from public, anon, authenticated;
revoke execute on function public.enforce_event_rsvp_capacity() from public, anon, authenticated;
revoke execute on function public.enforce_member_not_suspended() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.prevent_economy_self_edit() from public, anon, authenticated;
revoke execute on function public.prevent_role_self_escalation() from public, anon, authenticated;
revoke execute on function public.provision_channel_room() from public, anon, authenticated;
revoke execute on function public.sync_contact_from_profile() from public, anon, authenticated;
revoke execute on function public.trg_decrement_reply_count() from public, anon, authenticated;
revoke execute on function public.trg_increment_reply_count() from public, anon, authenticated;
revoke execute on function public.trg_stewardships_recompute_level() from public, anon, authenticated;
