-- pgTAP behavioural guard for migration 20270346180000 (SEC-026).
--
-- "profiles: self update" checks ownership alone, so before SEC-026 a member could PATCH their own
-- row with web_role = 'admin', membership_tier, stripe_account_id or suspended_at = null. Each forged
-- write below is made AS the member through the policy, the way PostgREST makes it, and must be
-- refused; the member's own settings writes must still land; the admin client must be untouched.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a026-000000000001', 'sec026-member@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b026-000000000001', '00000000-0000-4000-a026-000000000001', 'SEC026 Member', 'sec026-member');

delete from public.profiles
where auth_user_id = '00000000-0000-4000-a026-000000000001'
  and id <> '00000000-0000-4000-b026-000000000001';

select is(
  (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'profiles' and t.tgname = 'trg_a_profiles_privileged_column_guard'),
  1, 'the guard trigger is attached to profiles');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a026-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$update public.profiles set web_role = 'admin' where id = '00000000-0000-4000-b026-000000000001'$$,
  '42501', null, 'a member cannot make themselves staff');
select throws_ok(
  $$update public.profiles set membership_tier = 'crew' where id = '00000000-0000-4000-b026-000000000001'$$,
  '42501', null, 'a member cannot grant themselves a paid tier');
select throws_ok(
  $$update public.profiles set stripe_account_id = 'acct_forged', stripe_charges_enabled = true where id = '00000000-0000-4000-b026-000000000001'$$,
  '42501', null, 'a member cannot point payouts at a Stripe account');
select throws_ok(
  $$update public.profiles set is_founding_member = true where id = '00000000-0000-4000-b026-000000000001'$$,
  '42501', null, 'a member cannot make themselves a Founding Member');

select lives_ok(
  $$update public.profiles set display_name = 'SEC026 Renamed', bio = 'hi' where id = '00000000-0000-4000-b026-000000000001'$$,
  'the member can still edit their own settings columns');

reset role;

select lives_ok(
  $$update public.profiles set suspended_at = now(), web_role = 'none' where id = '00000000-0000-4000-b026-000000000001'$$,
  'the server (postgres / service role) still writes the frozen columns');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a026-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.profiles set suspended_at = null where id = '00000000-0000-4000-b026-000000000001'$$,
  '42501', null, 'a suspended member cannot lift their own suspension');
reset role;

select * from finish();
rollback;
