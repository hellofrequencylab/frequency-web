-- LIVE-882: SQL payment binding, fencing and client mutation boundary.
-- Sequential lease assertions do not prove simultaneous multi-session execution;
-- the dispatcher replay tests and FOR UPDATE claim provide that separate boundary.
begin;
select plan(28);
select ok(not has_function_privilege(r, f, 'execute'), r || ' cannot execute ' || f)
  from unnest(array['anon','authenticated']) r
  cross join unnest(array[
    'public.claim_commerce_settlement(uuid,text,text,integer,text,uuid)',
    'public.advance_commerce_settlement(uuid,uuid,text)',
    'public.release_commerce_settlement(uuid,uuid)']) f;
select ok(has_function_privilege('service_role',f,'execute'),'service role can execute ' || f)
  from unnest(array[
    'public.claim_commerce_settlement(uuid,text,text,integer,text,uuid)',
    'public.advance_commerce_settlement(uuid,uuid,text)',
    'public.release_commerce_settlement(uuid,uuid)']) f;
select ok(not p.prosecdef,'recovery function remains invoker: ' || p.proname)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('claim_commerce_settlement','advance_commerce_settlement','release_commerce_settlement','protect_commerce_settlement_columns');
select has_column('public','commerce_orders','settlement_steps','durable step checkpoints exist');
select has_column('public','commerce_orders','settlement_lease','claim token exists');
select has_column('public','commerce_orders','settlement_lease_until','bounded lease exists');
insert into public.commerce_orders(id,guest_email,owner_kind,entity_id,amount_cents,currency,status,stripe_checkout_session_id,stripe_payment_intent_id)
 values('00000000-0000-4000-a882-000000000001','recovery@example.test','platform',
 (select id from public.entities where key='labs' limit 1),1000,'usd','paid','cs_recovery_db','pi_recovery_db');
select is((select settlement_steps from public.commerce_orders where id='00000000-0000-4000-a882-000000000001'),'{}'::jsonb,'new paid orders have no fabricated completion');
select is(public.claim_commerce_settlement('00000000-0000-4000-a882-000000000001','cs_recovery_db','pi_recovery_db',1000,'usd','00000000-0000-4000-a882-000000000010')->>'state','claimed','verified original payment claims work');
select is(public.claim_commerce_settlement('00000000-0000-4000-a882-000000000001','cs_recovery_db','pi_recovery_db',1000,'usd','00000000-0000-4000-a882-000000000011')->>'state','busy','another active lease is fenced');
select is(public.advance_commerce_settlement('00000000-0000-4000-a882-000000000001','00000000-0000-4000-a882-000000000011','inventory'),false,'another token cannot checkpoint');
select is(public.advance_commerce_settlement('00000000-0000-4000-a882-000000000001','00000000-0000-4000-a882-000000000010','inventory'),true,'holder checkpoints successful inventory');
select is(public.claim_commerce_settlement('00000000-0000-4000-a882-000000000001','cs_recovery_db','pi_recovery_db',1000,'usd','00000000-0000-4000-a882-000000000010')->'steps','{"inventory":true}'::jsonb,'successful progress survives a replay');
select is(public.claim_commerce_settlement('00000000-0000-4000-a882-000000000001','cs_recovery_db','pi_foreign',1000,'usd','00000000-0000-4000-a882-000000000010')->>'state','refused','foreign payment cannot grant access');
update public.commerce_orders set status='refunded' where id='00000000-0000-4000-a882-000000000001';
select is(public.claim_commerce_settlement('00000000-0000-4000-a882-000000000001','cs_recovery_db','pi_recovery_db',1000,'usd','00000000-0000-4000-a882-000000000010')->>'state','refused','refund cannot resurrect access');
-- Grant a fixture-only row policy inside this rolled-back test. The trigger is
-- still required even where an owner-facing policy permits the ordinary edit.
create policy commerce_recovery_test_only on public.commerce_orders for all to authenticated
 using(id in ('00000000-0000-4000-a882-000000000001','00000000-0000-4000-a882-000000000002'))
 with check(id in ('00000000-0000-4000-a882-000000000001','00000000-0000-4000-a882-000000000002'));
grant select,insert,update on public.commerce_orders to authenticated;
set local role authenticated;
select throws_ok($$update public.commerce_orders set settlement_steps='{}' where id='00000000-0000-4000-a882-000000000001'$$,'42501','settlement_columns_are_service_only','client cannot reset checkpoints');
select throws_ok($$update public.commerce_orders set settlement_lease=null where id='00000000-0000-4000-a882-000000000001'$$,'42501','settlement_columns_are_service_only','client cannot steal a token');
select throws_ok($$update public.commerce_orders set settlement_lease_until=null where id='00000000-0000-4000-a882-000000000001'$$,'42501','settlement_columns_are_service_only','client cannot shorten a lease');
select throws_ok($$insert into public.commerce_orders(id,guest_email,owner_kind,entity_id,amount_cents,currency,status,settlement_steps) values('00000000-0000-4000-a882-000000000002','forged@example.test','platform','1ab50000-0000-4000-a000-000000000002',1000,'usd','pending','{"journey":true}')$$,'42501','settlement_columns_are_service_only','client cannot fabricate progress on insert');
reset role;
select * from finish();
rollback;
