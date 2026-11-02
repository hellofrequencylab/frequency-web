-- SEC-016: platform_flags was readable by anyone holding the anon key ("platform_flags: public read", using true).
-- Its 33 rows are operator switches (billing_live, host_payouts_enabled, vera_autonomy_enabled, domain_purchase_enabled ...),
-- so the public REST API told outsiders which money and AI paths are armed. Every reader in app/, lib/ and components/
-- goes through createAdminClient (the service role bypasses RLS), so nothing needs the policy.
-- After this: RLS stays on, no policy, no anon or authenticated privilege. Idempotent.
drop policy if exists "platform_flags: public read" on public.platform_flags;
alter table public.platform_flags enable row level security;
revoke all on table public.platform_flags from anon, authenticated;
-- Verify AFTER (expect zero rows):
--   select policyname from pg_policies where schemaname='public' and tablename='platform_flags';
--   select 1 where has_table_privilege('anon','public.platform_flags','select');
