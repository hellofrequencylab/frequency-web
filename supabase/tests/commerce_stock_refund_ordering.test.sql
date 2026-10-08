-- LIVE-882: run both serial orderings against the actual inventory RPCs.
-- Simultaneous transactions serialize on the order lock; these pgTAP fixtures
-- prove each possible committed ordering, not a multi-connection concurrency run.
begin;
select plan(9);
insert into public.commerce_products(id,owner_kind,entity_id,product_kind,vertical,title,price_cents,status,stock)
values('00000000-0000-4000-e882-000000000201','platform',(select id from public.entities where key='labs' limit 1),'physical','maker','Recovery Stock Fixture',1000,'active',10);
insert into public.commerce_orders(id,guest_email,owner_kind,entity_id,amount_cents,currency,status)
select ('00000000-0000-4000-f882-'||lpad(i::text,12,'0'))::uuid,'stock-recovery@test.local','platform',(select id from public.entities where key='labs' limit 1),1000,'usd','paid' from generate_series(201,202)i;
insert into public.commerce_order_items(order_id,product_id,title,qty,unit_cents,subtotal_cents)
select ('00000000-0000-4000-f882-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-e882-000000000201','Recovery Stock Fixture',2,500,1000 from generate_series(201,202)i;
-- Refund wins before a delayed decrement; restoring untouched inventory is a no-op.
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000201';
select public.restore_commerce_stock_atomic('00000000-0000-4000-f882-000000000201');
select throws_ok($$select public.decrement_commerce_stock_atomic('00000000-0000-4000-f882-000000000201')$$,'P0001','order_not_paid','refund-first refuses delayed inventory mutation');
select is((select stock from public.commerce_products where id='00000000-0000-4000-e882-000000000201'),10,'refund-first leaves shelf intact');
select is((select coalesce((metadata->>'inventory_decremented')::boolean,false) from public.commerce_orders where id='00000000-0000-4000-f882-000000000201'),false,'refunded order acquires no inventory marker');
-- Decrement wins first; refund then restores exactly once through the existing marker.
select public.decrement_commerce_stock_atomic('00000000-0000-4000-f882-000000000202');
select public.decrement_commerce_stock_atomic('00000000-0000-4000-f882-000000000202');
select is((select stock from public.commerce_products where id='00000000-0000-4000-e882-000000000201'),8,'paid decrement remains exactly once');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-f882-000000000202';
select public.restore_commerce_stock_atomic('00000000-0000-4000-f882-000000000202');
select public.restore_commerce_stock_atomic('00000000-0000-4000-f882-000000000202');
select is((select stock from public.commerce_products where id='00000000-0000-4000-e882-000000000201'),10,'stock-first refund restores exactly once');
select throws_ok($$select public.decrement_commerce_stock_atomic('00000000-0000-4000-f882-000000000202')$$,'P0001','order_not_paid','refunded restored order cannot subtract stock again');
select is((select stock from public.commerce_products where id='00000000-0000-4000-e882-000000000201'),10,'post-refund replay leaves restored shelf intact');
select ok(not has_function_privilege('authenticated','public.decrement_commerce_stock_atomic(uuid)','execute'),'client cannot invoke paid inventory authority');
select ok(has_function_privilege('service_role','public.decrement_commerce_stock_atomic(uuid)','execute'),'service role retains inventory authority');
select * from finish();
rollback;
