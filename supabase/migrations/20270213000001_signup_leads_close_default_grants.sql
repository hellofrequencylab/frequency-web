-- Close the default grants the signup_leads migration assumed were not there (ADR-959 follow-up).
--
-- WHAT WENT WRONG. 20270213000000_signup_leads.sql ends with a revoke/grant pair whose stated intent
-- is that anon may call capture and update but NOT mark_signup_lead_converted, and that anon holds no
-- table grant at all. Verified against the database after applying, neither was true:
-- mark_signup_lead_converted was anon-callable, and anon/authenticated held 14 table grants.
--
-- WHY. Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public` granting anon/authenticated EXECUTE
-- on new functions and ALL on new tables. Those arrive as EXPLICIT per-role grants, not as the PUBLIC
-- pseudo-role, so `REVOKE ... FROM public` does not remove them. The revoke ran, reported success, and
-- removed nothing. This is the trap in every "revoke from public, then grant back" block in this repo:
-- on stock Postgres it is airtight, on Supabase it is a no-op against the roles that matter.
--
-- The behaviour was never exposed - mark_signup_lead_converted reads auth.uid(), which is null for
-- anon, so the ownership check failed closed - and RLS-on-with-no-policy already denied every anon
-- read and write of the table. Both of those are the SECOND lock. This migration restores the first.
-- A grant that only RLS is holding back is one policy mistake away from being live.

revoke execute on function public.mark_signup_lead_converted(uuid, uuid) from anon;

revoke all on table public.signup_leads from anon, authenticated;
