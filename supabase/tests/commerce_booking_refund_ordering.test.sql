-- LIVE-882: both committed booking/refund orderings; order lock serializes concurrent writers.
begin;
select plan(8);
insert into auth.users(id,email) values('00000000-0000-4000-a882-000000000301','recovery-author@test.local'),('00000000-0000-4000-a882-000000000302','recovery-buyer@test.local');
delete from public.profiles where auth_user_id in('00000000-0000-4000-a882-000000000301','00000000-0000-4000-a882-000000000302');
insert into public.profiles(id,auth_user_id,display_name,handle,is_active) values
 ('00000000-0000-4000-b882-000000000301','00000000-0000-4000-a882-000000000301','Recovery Author','recovery-author-test',true),
 ('00000000-0000-4000-b882-000000000302','00000000-0000-4000-a882-000000000302','Recovery Buyer','recovery-buyer-test',true);
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility,plan) values
 ('00000000-0000-4000-c882-000000000301','booking-recovery-test','Recovery Test','business',(select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b882-000000000301','active','network','business');

insert into public.commerce_orders(id,buyer_profile_id,owner_kind,entity_id,amount_cents,currency,status)
select ('00000000-0000-4000-f882-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-b882-000000000302','platform',(select id from public.entities where key='labs' limit 1),1000,'usd','paid' from generate_series(301,302)i;
insert into public.space_bookings(id,space_id,member_profile_id,starts_at,ends_at,status,order_id)
select ('00000000-0000-4000-e882-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-c882-000000000301','00000000-0000-4000-b882-000000000302','2027-01-01T10:00:00Z'::timestamptz+(i-301)*interval '1 hour','2027-01-01T10:30:00Z'::timestamptz+(i-301)*interval '1 hour','pending',('00000000-0000-4000-f882-'||lpad(i::text,12,'0'))::uuid from generate_series(301,302)i;
-- Refund committed but financial cleanup failed before booking cancellation.
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000301';
select is(public.confirm_paid_commerce_booking('00000000-0000-4000-f882-000000000301'),false,'refund-first refuses delayed paid booking grant');
select is((select status from public.space_bookings where id='00000000-0000-4000-e882-000000000301'),'pending','failed cleanup cannot authorize new confirmation');
-- Confirmation won first; existing canonical cancellation releases the old grant.
select is(public.confirm_paid_commerce_booking('00000000-0000-4000-f882-000000000302'),true,'paid-first confirms held booking');
select is((select status from public.space_bookings where id='00000000-0000-4000-e882-000000000302'),'confirmed','paid booking is actually granted');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000302';
update public.space_bookings set status='cancelled' where order_id='00000000-0000-4000-f882-000000000302';
select is(public.confirm_paid_commerce_booking('00000000-0000-4000-f882-000000000302'),false,'refunded canceled hold cannot resurrect');
select is((select status from public.space_bookings where id='00000000-0000-4000-e882-000000000302'),'cancelled','cancellation survives replay');
select ok(not has_function_privilege('authenticated','public.confirm_paid_commerce_booking(uuid)','execute'),'client cannot invoke paid booking authority');
select ok(has_function_privilege('service_role','public.confirm_paid_commerce_booking(uuid)','execute'),'service retains paid booking authority');
select * from finish();
rollback;
