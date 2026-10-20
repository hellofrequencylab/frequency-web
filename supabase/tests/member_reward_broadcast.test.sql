-- pgTAP guard for the member reward broadcast (LIVE-671, migration 20270346002200).
--
-- Pins the shape: both ledgers carry the trigger, the function runs as owner with execute revoked,
-- a reward write and a reversal both still land (the broadcast can never fail a reward), and the
-- one Realtime policy admits a member to their OWN member topic only.
--
-- ⚠️ NOT COVERED: delivery to a socket. Whether realtime.messages receives the row depends on the
-- Realtime partitions of the local stack; realtime.send downgrades a missing partition to a WARNING
-- by design, so this file asserts the write survives, not that a message was delivered. Delivery
-- was checked by hand against production after apply.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(9);

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-0000-0000-00000000b671', 'Rewarded', 'reward_live');

select ok(
  exists (select 1 from pg_trigger where tgname = 'trg_broadcast_zap_reward'
           and tgrelid = 'public.zap_transactions'::regclass and not tgisinternal),
  'zap_transactions publishes rewards'
);
select ok(
  exists (select 1 from pg_trigger where tgname = 'trg_broadcast_gem_reward'
           and tgrelid = 'public.gem_transactions'::regclass and not tgisinternal),
  'gem_transactions publishes rewards'
);
select ok(
  (select prosecdef from pg_proc where oid = 'private.broadcast_member_reward()'::regprocedure),
  'the publisher runs as its owner, whatever role wrote the ledger row'
);
select ok(
  not has_function_privilege('authenticated', 'private.broadcast_member_reward()', 'execute')
  and not has_function_privilege('anon', 'private.broadcast_member_reward()', 'execute'),
  'nobody can call the publisher directly'
);

select lives_ok(
  $$insert into public.zap_transactions (profile_id, action_type, amount, metadata)
    values ('00000000-0000-0000-0000-00000000b671', 'manual', 5, '{}'::jsonb)$$,
  'a Zap reward still lands with the broadcast on it'
);
select lives_ok(
  $$insert into public.zap_transactions (profile_id, action_type, amount, metadata)
    values ('00000000-0000-0000-0000-00000000b671', 'practice_log_reversed', -5, '{}'::jsonb)$$,
  'a reversal still lands (and publishes nothing)'
);
select lives_ok(
  $$insert into public.gem_transactions (profile_id, action_type, amount, metadata)
    values ('00000000-0000-0000-0000-00000000b671', 'achievement', 3, '{}'::jsonb)$$,
  'a Gem reward still lands with the broadcast on it'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'realtime: a member receives their own member channel'
      and cmd = 'SELECT' and roles = '{authenticated}'),
  1,
  'one SELECT policy, signed-in members only'
);
select ok(
  (select qual from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and policyname = 'realtime: a member receives their own member channel')
    ~ 'member:'
  and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and cmd in ('INSERT', 'ALL')),
  'it is keyed on the member topic, and members cannot publish'
);

select * from finish();
rollback;
