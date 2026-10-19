-- pgTAP behavioural guard for migration 20270346011000 (SCAN-1013).
--
-- joinEmailHasAccount used to page auth.admin.listUsers to answer "does this address have an
-- account". auth_email_exists(text) is the one-probe replacement. It is an account-existence
-- oracle, so the grant IS the lock: service_role only, never anon or authenticated.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a013-000000000001', 'regular@test.local');

-- ── 1. The grant is the lock ────────────────────────────────────────────────────────────────────

select is(has_function_privilege('anon', 'public.auth_email_exists(text)', 'execute'), false,
  'anon cannot execute auth_email_exists');
select is(has_function_privilege('authenticated', 'public.auth_email_exists(text)', 'execute'), false,
  'authenticated cannot execute auth_email_exists');
select is(has_function_privilege('service_role', 'public.auth_email_exists(text)', 'execute'), true,
  'service_role can execute auth_email_exists');

-- ── 2. The answer ───────────────────────────────────────────────────────────────────────────────

select is(public.auth_email_exists('regular@test.local'), true,
  'a seeded address exists');
select is(public.auth_email_exists('  Regular@Test.Local '), true,
  'case and surrounding whitespace are normalised the way GoTrue stores them');
select is(public.auth_email_exists('nobody@test.local'), false,
  'an unknown address does not exist');
select is(public.auth_email_exists(''), false,
  'a blank address is false, not an error');
select is(public.auth_email_exists(null), false,
  'a null address is false, not an error');

select * from finish();
rollback;
