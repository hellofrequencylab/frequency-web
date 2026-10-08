-- LIVE-763: transactional capacity, ownership and cancellation-safe detach. Rollback-only fixtures.
begin;
select plan(30);
select ok((select relrowsecurity from pg_class where oid = 'public.spaces'::regclass), 'Space relationship rows are protected by RLS');
select ok(not exists(select 1 from pg_policy where polrelid = 'public.spaces'::regclass and polcmd in ('a','w','d','*')), 'browser clients have no direct Space write policy to bypass the owner-checked RPC');
insert into auth.users (id, email) values
 ('00000000-0000-4000-a763-000000000001', 'collective-owner@test.local'),
 ('00000000-0000-4000-a763-000000000002', 'collective-stranger@test.local');
delete from public.profiles where auth_user_id in
 ('00000000-0000-4000-a763-000000000001', '00000000-0000-4000-a763-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
 ('00000000-0000-4000-b763-000000000001', '00000000-0000-4000-a763-000000000001', 'Collective Owner', 'collective-owner', true),
 ('00000000-0000-4000-b763-000000000002', '00000000-0000-4000-a763-000000000002', 'Collective Stranger', 'collective-stranger', true);
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan)
select ('00000000-0000-4000-c763-' || lpad(n::text, 12, '0'))::uuid,
 'collective-fixture-' || n, 'Collective fixture ' || n, 'business',
 (select id from public.entities where key = 'labs' limit 1),
 case when n = 8 then '00000000-0000-4000-b763-000000000002'::uuid else '00000000-0000-4000-b763-000000000001'::uuid end,
 'active', 'network', case when n = 0 then 'collective' else 'free' end
from generate_series(0, 11) n;

select ok(not has_function_privilege('anon', 'public.set_collective_member_space(uuid,uuid,uuid,boolean)', 'execute'), 'anonymous callers cannot forge the owner argument');
select ok(not has_function_privilege('authenticated', 'public.set_collective_member_space(uuid,uuid,uuid,boolean)', 'execute'), 'browser clients cannot forge the owner argument');
select ok(not has_function_privilege('authenticated', 'public.begin_collective_space_change(uuid,uuid,integer,uuid)', 'execute'), 'browser clients cannot reserve forged quantities');
select ok(not has_function_privilege('authenticated', 'public.finish_collective_space_change(uuid,uuid)', 'execute'), 'browser clients cannot clear capacity reservations');
select ok(has_function_privilege('service_role', 'public.set_collective_member_space(uuid,uuid,uuid,boolean)', 'execute'), 'authenticated server seam may execute');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000008', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_forbidden', 'a Collective cannot take another owner''s Space');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000001', '00000000-0000-4000-b763-000000000002', true)$$, 'P0001', 'collective_forbidden', 'a stranger cannot mutate an owned Collective');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000000', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_invalid', 'a Space cannot contain itself');
update public.spaces set type = 'root' where id = '00000000-0000-4000-c763-000000000010';
update public.spaces set plan = 'collective' where id = '00000000-0000-4000-c763-000000000011';
update public.spaces set parent_id = '00000000-0000-4000-c763-000000000007' where id = '00000000-0000-4000-c763-000000000008';
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000010', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_forbidden', 'root Spaces cannot become members');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000011', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_invalid', 'Collectives cannot nest as members');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000007', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_invalid', 'containing Spaces cannot nest as members');
update public.spaces set parent_id = '00000000-0000-4000-c763-000000000011' where id = '00000000-0000-4000-c763-000000000000';
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000001', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_invalid', 'a nested containing Space cannot acquire members');
update public.spaces set parent_id = null where id = '00000000-0000-4000-c763-000000000000';
select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', ('00000000-0000-4000-c763-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-4000-b763-000000000001', true) from generate_series(1, 5) n;
select is((select count(*)::int from public.spaces where parent_id = '00000000-0000-4000-c763-000000000000'), 5, 'five member Spaces attach');
select lives_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000001', '00000000-0000-4000-b763-000000000001', true)$$, 'attaching an existing member is idempotent even at capacity');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000006', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_full', 'a sixth Space is refused without purchased capacity');
insert into public.space_subscription_items (space_id, item_key, quantity, status)
values ('00000000-0000-4000-c763-000000000000', 'collective_space', 2, 'canceled');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000006', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_full', 'canceled extras grant no capacity');
update public.space_subscription_items set status = 'active' where space_id = '00000000-0000-4000-c763-000000000000';
select lives_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000006', '00000000-0000-4000-b763-000000000001', true)$$, 'active purchased quantity admits another Space');
update public.space_subscription_items set status = 'canceled' where space_id = '00000000-0000-4000-c763-000000000000';
select is((select count(*)::int from public.spaces where parent_id = '00000000-0000-4000-c763-000000000000'), 6, 'capacity reduction preserves existing attachments');
select is((select plan::text from public.spaces where id = '00000000-0000-4000-c763-000000000001'), 'free', 'inheritance never overwrites the stored child plan');
select throws_ok($$select public.begin_collective_space_change('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-b763-000000000001', 0, '00000000-0000-4000-d763-000000000001')$$, 'P0001', 'collective_quantity_floor', 'quantity cannot drop below the attached-Space floor');
select is(public.begin_collective_space_change('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-b763-000000000001', 1, '00000000-0000-4000-d763-000000000001'), true, 'first quantity change gets the parent reservation');
select is(public.begin_collective_space_change('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-b763-000000000001', 2, '00000000-0000-4000-d763-000000000002'), false, 'overlapping billing changes cannot double-add an item');
update public.space_subscription_items set status = 'active' where space_id = '00000000-0000-4000-c763-000000000000';
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000009', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_full', 'a pending reduction restricts new attachments under the same lock');
select public.finish_collective_space_change('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-d763-000000000002');
select is((select collective_space_change_token from public.spaces where id = '00000000-0000-4000-c763-000000000000'), '00000000-0000-4000-d763-000000000001'::uuid, 'an old or forged token cannot clear another reservation');
select public.finish_collective_space_change('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-d763-000000000001');
select is((select collective_space_change_token from public.spaces where id = '00000000-0000-4000-c763-000000000000'), null::uuid, 'the matching completion token releases the reservation');
update public.spaces set plan = 'free' where id = '00000000-0000-4000-c763-000000000000';
select lives_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000001', '00000000-0000-4000-b763-000000000001', false)$$, 'detach remains possible after Collective cancellation');
select is((select parent_id from public.spaces where id = '00000000-0000-4000-c763-000000000001'), null::uuid, 'detach clears only the membership relation');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c763-000000000000', '00000000-0000-4000-c763-000000000007', '00000000-0000-4000-b763-000000000001', true)$$, 'P0001', 'collective_invalid', 'a canceled Collective cannot attach another Space');
select * from finish();
rollback;
