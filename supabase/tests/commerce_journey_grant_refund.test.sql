-- LIVE-882: both grant/refund orderings and immutable paid access provenance.
-- Sequential ordering proves consequences; actual simultaneous sessions require
-- the order FOR UPDATE lock retained in both RPCs (not claimed as a pgTAP concurrency test).
begin;
select plan(38);
select ok(not has_function_privilege(r,f,'execute'),r || ' cannot execute ' || f)
 from unnest(array['anon','authenticated']) r cross join unnest(array[
 'public.grant_paid_commerce_journey(uuid,uuid,uuid)','public.revoke_refunded_commerce_journeys(uuid)']) f;
select ok(has_function_privilege('service_role',f,'execute'),'service role can execute ' || f)
 from unnest(array['public.grant_paid_commerce_journey(uuid,uuid,uuid)','public.revoke_refunded_commerce_journeys(uuid)']) f;
select ok(not p.prosecdef,'paid access function remains invoker: ' || p.proname)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in('grant_paid_commerce_journey','revoke_refunded_commerce_journeys','protect_paid_journey_provenance');
select has_column('public','journey_plan_adoptions','order_id','actual lesson permission has order provenance');
insert into auth.users(id,email) values('00000000-0000-4000-a882-000000000101','recovery-author@test.local'),('00000000-0000-4000-a882-000000000102','recovery-buyer@test.local');
delete from public.profiles where auth_user_id in('00000000-0000-4000-a882-000000000101','00000000-0000-4000-a882-000000000102');
insert into public.profiles(id,auth_user_id,display_name,handle,is_active) values
 ('00000000-0000-4000-b882-000000000101','00000000-0000-4000-a882-000000000101','Recovery Author','recovery-author-test',true),
 ('00000000-0000-4000-b882-000000000102','00000000-0000-4000-a882-000000000102','Recovery Buyer','recovery-buyer-test',true);
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility,plan) values
 ('00000000-0000-4000-c882-000000000101','recovery-test','Recovery Test','business',(select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b882-000000000101','active','network','business');
insert into public.journey_plans(id,slug,title,visibility,status,author_id,space_id,enroll_cap) values
 ('00000000-0000-4000-d882-000000000101','recovery-test-journey','Recovery Test Journey','public','approved','00000000-0000-4000-b882-000000000101','00000000-0000-4000-c882-000000000101',12);
insert into public.commerce_products(id,owner_kind,owner_space_id,entity_id,product_kind,vertical,title,price_cents,status,journey_plan_id) values
 ('00000000-0000-4000-e882-000000000101','space','00000000-0000-4000-c882-000000000101',(select id from public.entities where key='labs' limit 1),'journey','maker','Recovery Test Journey',1000,'active','00000000-0000-4000-d882-000000000101');
insert into public.commerce_orders(id,buyer_profile_id,owner_kind,owner_space_id,entity_id,amount_cents,currency,status)
 select ('00000000-0000-4000-f882-' || lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-b882-000000000102','space','00000000-0000-4000-c882-000000000101',(select id from public.entities where key='labs' limit 1),1000,'usd','paid' from generate_series(101,105)i;
insert into public.commerce_order_items(order_id,product_id,title,qty,unit_cents,subtotal_cents)
 select ('00000000-0000-4000-f882-' || lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-e882-000000000101','Recovery Test Journey',1,1000,1000 from generate_series(101,105)i;
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000101','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102')->>'state','granted','paid buyer grants permission');
-- First call above already inserted adoption; this replay cannot mint another.
select is((select count(*)::int from public.journey_plan_adoptions where order_id='00000000-0000-4000-f882-000000000101'),1,'exactly one order-owned lesson permission');
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000101','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102')->>'new_adoption','false','replay is not a fresh adoption');
select is((select count(*)::int from public.journey_enrollments where order_id='00000000-0000-4000-f882-000000000101'),1,'exactly one order-owned enrollment');
select is((select order_id from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),'00000000-0000-4000-f882-000000000101'::uuid,'permission captures original order');
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000101','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000101')->>'state','refused','other profile cannot consume the order');
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000101','00000000-0000-4000-d882-000000000999','00000000-0000-4000-b882-000000000102')->>'state','refused','different Journey is not a line of the order');
select is(public.revoke_refunded_commerce_journeys('00000000-0000-4000-f882-000000000101'),false,'not-yet-refunded order cannot be revoked');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000101';
select is(public.revoke_refunded_commerce_journeys('00000000-0000-4000-f882-000000000101'),true,'grant-first ordering revokes after refund');
select is((select active from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),false,'actual lesson permission is removed');
select is((select count(*)::int from public.journey_enrollments where order_id='00000000-0000-4000-f882-000000000101'),0,'unfinished order-owned enrollment is removed');
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000101','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102')->>'state','refused','paid replay cannot resurrect refunded access');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000102';
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000102','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102')->>'state','refused','refund-first ordering refuses a late grant');
select is((select count(*)::int from public.journey_enrollments where plan_id='00000000-0000-4000-d882-000000000101'),0,'late grant creates no temporary enrollment');
-- Preexisting free grants are not payment provenance, and must stay free.
delete from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101';
insert into public.journey_enrollments(profile_id,plan_id) values('00000000-0000-4000-b882-000000000102','00000000-0000-4000-d882-000000000101');
insert into public.journey_plan_adoptions(profile_id,plan_id) values('00000000-0000-4000-b882-000000000102','00000000-0000-4000-d882-000000000101');
select is(public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000103','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102')->>'state','granted','paid order may reuse preexisting free access');
select is((select order_id from public.journey_enrollments where plan_id='00000000-0000-4000-d882-000000000101'),null::uuid,'free enrollment is not retagged');
select is((select order_id from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),null::uuid,'free lesson permission is not retagged');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000103';
select is(public.revoke_refunded_commerce_journeys('00000000-0000-4000-f882-000000000103'),true,'refund of redundant paid order is safe');
select is((select count(*)::int from public.journey_enrollments where plan_id='00000000-0000-4000-d882-000000000101'),1,'free enrollment survives refund');
select is((select active from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),true,'free lesson permission survives refund');
delete from public.journey_enrollments where plan_id='00000000-0000-4000-d882-000000000101';
delete from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101';
do $$begin perform public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000104','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102');perform public.grant_paid_commerce_journey('00000000-0000-4000-f882-000000000105','00000000-0000-4000-d882-000000000101','00000000-0000-4000-b882-000000000102');end $$;
select is((select order_id from public.journey_enrollments where plan_id='00000000-0000-4000-d882-000000000101'),'00000000-0000-4000-f882-000000000104'::uuid,'other-order enrollment provenance remains immutable');
select is((select order_id from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),'00000000-0000-4000-f882-000000000104'::uuid,'other-order lesson permission remains immutable');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000105';
do $$begin perform public.revoke_refunded_commerce_journeys('00000000-0000-4000-f882-000000000105');end $$;
select is((select count(*)::int from public.journey_enrollments where order_id='00000000-0000-4000-f882-000000000104'),1,'unrelated order enrollment survives');
select is((select active from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),true,'unrelated order permission survives');
update public.journey_enrollments set completed_at=now() where order_id='00000000-0000-4000-f882-000000000104';
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000104';
do $$begin perform public.revoke_refunded_commerce_journeys('00000000-0000-4000-f882-000000000104');end $$;
select is((select count(*)::int from public.journey_enrollments where order_id='00000000-0000-4000-f882-000000000104'),1,'completed enrollment survives refund');
select is((select active from public.journey_plan_adoptions where plan_id='00000000-0000-4000-d882-000000000101'),true,'completed lesson permission survives refund');
create policy paid_journey_recovery_test_only on public.journey_plan_adoptions for all to authenticated using(profile_id='00000000-0000-4000-b882-000000000102') with check(profile_id='00000000-0000-4000-b882-000000000102');
grant select,insert,update on public.journey_plan_adoptions to authenticated;
set local role authenticated;
select throws_ok($$update public.journey_plan_adoptions set order_id=null where plan_id='00000000-0000-4000-d882-000000000101'$$,'42501','paid_journey_provenance_is_service_only','client cannot strip paid provenance');
select throws_ok($$insert into public.journey_plan_adoptions(profile_id,plan_id,order_id) values('00000000-0000-4000-b882-000000000102','00000000-0000-4000-d882-000000000101','00000000-0000-4000-f882-000000000104')$$,'42501','paid_journey_provenance_is_service_only','client cannot forge paid provenance');
reset role;
select * from finish();
rollback;
