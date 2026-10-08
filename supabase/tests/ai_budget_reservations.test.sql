-- LIVE-883: reservation/usage atomicity, uncertain spend, idempotency and member-turn semantics.
-- Local/CI database only; every fixture and switch change rolls back.
begin;
select plan(18);
insert into public.profiles(id,display_name,handle,is_active)
values ('00000000-0000-4000-b883-000000000001','Budget fixture','budget-fixture-883',true);
update public.platform_flags set value=true where key='ai_enabled';
create function pg_temp.reserve_attempt(n integer, amount numeric default 0.3)
returns boolean language sql as $$
 select public.ai_reserve_attempt(('00000000-0000-4000-a883-'||lpad(n::text,12,'0'))::uuid,
 '00000000-0000-4000-a883-000000000099','vera-chat','fixture-model',amount,
 '00000000-0000-4000-b883-000000000001',null,25,0.5,0.5);
$$;
select ok(pg_temp.reserve_attempt(1),'first estimate fits');
select ok(not pg_temp.reserve_attempt(2),'second estimate cannot oversubscribe outstanding first');
select ok(public.ai_hold_attempt('00000000-0000-4000-a883-000000000001','provider_failed'),'unknown dispatch marked uncertain');
select is((select state from public.ai_budget_reservations where id='00000000-0000-4000-a883-000000000001'),'uncertain','unknown dispatch remains charged');
update public.ai_budget_reservations set created_at=created_at-interval '6 hours' where id='00000000-0000-4000-a883-000000000001';
select ok(not pg_temp.reserve_attempt(3),'age does not silently release unknown spend');
-- Restore the original UTC instant before asserting today's member-turn totals.
update public.ai_budget_reservations set created_at=created_at+interval '6 hours' where id='00000000-0000-4000-a883-000000000001';
select ok(public.ai_settle_attempt('00000000-0000-4000-a883-000000000001',10,2,0.1),'reconciliation writes real usage');
select ok(public.ai_settle_attempt('00000000-0000-4000-a883-000000000001',10,2,0.1),'identical settlement replay is safe');
select ok(not public.ai_settle_attempt('00000000-0000-4000-a883-000000000001',10,2,0.2),'conflicting replay refused');
select is((select count(*) from public.ai_usage where reservation_id='00000000-0000-4000-a883-000000000001'),1::bigint,'replay did not duplicate usage');
select ok(pg_temp.reserve_attempt(4),'settled actual frees unused estimate');
select ok(public.ai_settle_attempt('00000000-0000-4000-a883-000000000004',10,2,0.1),'second round settles independently');
select is(public.ai_member_turns_today('00000000-0000-4000-b883-000000000001'),1::bigint,'two provider rounds count as one member turn');
insert into public.ai_usage(feature,model,profile_id,cost_usd) values('vera-chat','legacy','00000000-0000-4000-b883-000000000001',0);
select is(public.ai_member_turns_today('00000000-0000-4000-b883-000000000001'),2::bigint,'legacy rows retain one-turn identity');
select ok(pg_temp.reserve_attempt(5,0.2),'remaining estimate fits');
select ok(public.ai_settle_attempt('00000000-0000-4000-a883-000000000005',10,2,0.8),'actual overage recorded truthfully');
select ok(not pg_temp.reserve_attempt(6,0.1),'actual overage stops subsequent admission');
set local role authenticated;
select throws_ok($$select public.ai_budget_status_today()$$,'42501',null,'members cannot read private accounting');
select throws_ok($$select public.ai_settle_attempt('00000000-0000-4000-a883-000000000005',10,2,0.1)$$,'42501',null,'members cannot mutate settlements');
reset role;
select * from finish();
rollback;
