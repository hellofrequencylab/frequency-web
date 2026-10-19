-- SCAN-1008: a Network's chapter capacity is its ten included chapters plus its live network_chapter
-- quantity, never past 25, and the chapter quantity can be reserved like a Collective's extra Spaces.
-- Rollback-only fixtures.
begin;
select plan(11);
insert into auth.users (id, email) values ('00000000-0000-4000-a764-000000000001', 'network-owner@test.local');
delete from public.profiles where auth_user_id = '00000000-0000-4000-a764-000000000001';
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
 ('00000000-0000-4000-b764-000000000001', '00000000-0000-4000-a764-000000000001', 'Network Owner', 'network-owner', true);
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
-- Space 0 is the Network; 1..27 are its owner's free Spaces.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan)
select ('00000000-0000-4000-c764-' || lpad(n::text, 12, '0'))::uuid,
 'network-fixture-' || n, 'Network fixture ' || n, 'business',
 (select id from public.entities where key = 'labs' limit 1),
 '00000000-0000-4000-b764-000000000001'::uuid,
 'active', 'network', case when n = 0 then 'network' else 'free' end
from generate_series(0, 27) n;

select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', ('00000000-0000-4000-c764-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-4000-b764-000000000001', true) from generate_series(1, 10) n;
select is((select count(*)::int from public.spaces where parent_id = '00000000-0000-4000-c764-000000000000'), 10, 'the ten included chapters attach');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-c764-000000000011', '00000000-0000-4000-b764-000000000001', true)$$, 'P0001', 'collective_full', 'an eleventh chapter is refused without purchased chapters');

insert into public.space_subscription_items (space_id, item_key, quantity, status)
values ('00000000-0000-4000-c764-000000000000', 'network_chapter', 2, 'canceled');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-c764-000000000011', '00000000-0000-4000-b764-000000000001', true)$$, 'P0001', 'collective_full', 'canceled chapters grant no capacity');
update public.space_subscription_items set status = 'active' where space_id = '00000000-0000-4000-c764-000000000000';
select lives_ok($$select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-c764-000000000011', '00000000-0000-4000-b764-000000000001', true)$$, 'an active purchased chapter admits another Space');

-- A Collective's extra Spaces never count as chapters.
insert into public.space_subscription_items (space_id, item_key, quantity, status)
values ('00000000-0000-4000-c764-000000000000', 'collective_space', 5, 'active');
select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-c764-000000000012', '00000000-0000-4000-b764-000000000001', true);
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-c764-000000000013', '00000000-0000-4000-b764-000000000001', true)$$, 'P0001', 'collective_full', 'collective_space quantity does not expand a Network');

-- The 25-chapter ceiling holds whatever quantity is on the subscription.
update public.space_subscription_items set quantity = 40 where space_id = '00000000-0000-4000-c764-000000000000' and item_key = 'network_chapter';
select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', ('00000000-0000-4000-c764-' || lpad(n::text,12,'0'))::uuid, '00000000-0000-4000-b764-000000000001', true) from generate_series(13, 25) n;
select is((select count(*)::int from public.spaces where parent_id = '00000000-0000-4000-c764-000000000000'), 25, 'twenty-five chapters attach with enough purchased quantity');
select throws_ok($$select public.set_collective_member_space('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-c764-000000000026', '00000000-0000-4000-b764-000000000001', true)$$, 'P0001', 'collective_full', 'a twenty-sixth chapter is a quote, never self-serve');

-- The reservation admits a Network, floors at the chapters past the ten included, and caps at 15 extra.
select throws_ok($$select public.begin_collective_space_change('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-b764-000000000001', 14, '00000000-0000-4000-d764-000000000001')$$, 'P0001', 'collective_quantity_floor', 'chapter quantity cannot drop below the attached chapters past the ten included');
select throws_ok($$select public.begin_collective_space_change('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-b764-000000000001', 16, '00000000-0000-4000-d764-000000000001')$$, 'P0001', 'collective_invalid', 'a Network cannot reserve more than fifteen extra chapters');
select is(public.begin_collective_space_change('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-b764-000000000001', 15, '00000000-0000-4000-d764-000000000001'), true, 'a Network owner can reserve a chapter quantity change');
select public.finish_collective_space_change('00000000-0000-4000-c764-000000000000', '00000000-0000-4000-d764-000000000001');
select is((select collective_space_change_token from public.spaces where id = '00000000-0000-4000-c764-000000000000'), null::uuid, 'the matching token releases the reservation');
select * from finish();
rollback;
