-- LIVE-2291: prospective contracts and actual immutable support snapshots.
-- Fixtures are rolled back. These assertions do not apply production SQL or award currency.
begin;
select plan(24);
select has_column('public','journey_enrollments','completion_policy','enrollment has a separate policy snapshot'); -- 1
select has_column('public','practice_logs','support_pillar_ids','full support associations are separate from reward allocation'); -- 2
select has_column('public','practice_logs','support_evidence_version','historical unknown differs from recorded empty'); -- 3
select ok(not has_function_privilege('anon','public.freeze_journey_completion_policy()','execute'),'anonymous cannot invoke enrollment policy trigger'); -- 4
select ok(not has_function_privilege('authenticated','public.freeze_journey_completion_policy()','execute'),'members cannot invoke enrollment policy trigger'); -- 5
select ok(not has_function_privilege('anon','public.freeze_practice_support_evidence()','execute'),'anonymous cannot invoke support trigger'); -- 6
select ok(not has_function_privilege('authenticated','public.freeze_practice_support_evidence()','execute'),'members cannot invoke support trigger'); -- 7
select ok(has_function_privilege('service_role','public.freeze_journey_completion_policy()','execute'),'service role retains trigger privilege'); -- 8
select ok(has_function_privilege('service_role','public.freeze_practice_support_evidence()','execute'),'service role retains support trigger privilege'); -- 9

insert into auth.users(id,email) values
 ('00000000-0000-4000-a291-000000000001','support-policy-one@test.local'),
 ('00000000-0000-4000-a291-000000000002','support-policy-two@test.local');
delete from public.profiles where auth_user_id in('00000000-0000-4000-a291-000000000001','00000000-0000-4000-a291-000000000002');
insert into public.profiles(id,auth_user_id,display_name,handle,is_active) values
 ('00000000-0000-4000-b291-000000000001','00000000-0000-4000-a291-000000000001','Support One','support-policy-one-test',true),
 ('00000000-0000-4000-b291-000000000002','00000000-0000-4000-a291-000000000002','Support Two','support-policy-two-test',true);
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility,plan) values
 ('00000000-0000-4000-c291-000000000001','support-policy-test','Support Policy Test','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b291-000000000001','active','network','business');
insert into public.practices(id,title,created_by,space_id,domain_id,secondary_domain_id,primary_pct,focus_details) values
 ('00000000-0000-4000-e291-000000000001','Support policy practice','00000000-0000-4000-b291-000000000001','00000000-0000-4000-c291-000000000001',
 (select id from public.pillars where slug='body'),(select id from public.pillars where slug='mind'),75,
 jsonb_build_object((select id::text from public.pillars where slug='spirit'),jsonb_build_object('instructions','','timing','')));
-- An existing library enrollment stays on its original contract when its plan later becomes official.
insert into public.journey_plans(id,slug,title,author_id,space_id,official,ranked_eligible,window_starts_at,window_ends_at) values
 ('00000000-0000-4000-d291-000000000001','support-policy-journey','Support Policy Journey','00000000-0000-4000-b291-000000000001',
 '00000000-0000-4000-c291-000000000001',false,true,'2026-11-01T00:00Z','2026-11-28T23:59Z');
insert into public.journey_plan_items(plan_id,practice_id,domain_id) values
 ('00000000-0000-4000-d291-000000000001','00000000-0000-4000-e291-000000000001',(select id from public.pillars where slug='mind'));
insert into public.journey_enrollments(id,profile_id,plan_id) values
 ('00000000-0000-4000-f291-000000000001','00000000-0000-4000-b291-000000000001','00000000-0000-4000-d291-000000000001');
update public.journey_plans set official=true where id='00000000-0000-4000-d291-000000000001';
select is((select completion_policy from public.journey_enrollments where id='00000000-0000-4000-f291-000000000001'),null::jsonb,'old enrollment is not silently upgraded'); -- 10
insert into public.journey_enrollments(id,profile_id,plan_id,completion_policy) values
 ('00000000-0000-4000-f291-000000000002','00000000-0000-4000-b291-000000000002','00000000-0000-4000-d291-000000000001','{"version":99}');
select is((select completion_policy->>'version' from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'2','new official enrollment receives the actual policy, not caller input'); -- 11
select is((select completion_policy->>'daysRequired' from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'14','existing day threshold is unchanged'); -- 12
select is((select completion_policy->>'expressionRequired' from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'false','Expression is optional only in the new policy'); -- 13
update public.journey_plans set window_starts_at='2026-12-01',window_ends_at='2026-12-28' where id='00000000-0000-4000-d291-000000000001';
select is((select completion_policy->>'windowStart' from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'2026-11-01','later plan edits cannot move an enrolled window'); -- 14
update public.journey_enrollments set completion_policy='{"version":99}' where id='00000000-0000-4000-f291-000000000002';
select is((select completion_policy->>'version' from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'2','policy patch cannot forge another contract'); -- 15
update public.journey_enrollments set completion_policy='{"version":2}' where id='00000000-0000-4000-f291-000000000001';
select is((select completion_policy from public.journey_enrollments where id='00000000-0000-4000-f291-000000000001'),null::jsonb,'legacy NULL cannot be converted through an update'); -- 16
select throws_ok($$update public.journey_enrollments set started_at='2026-12-01' where id='00000000-0000-4000-f291-000000000002'$$,'42501','completion_contract_is_immutable','new contract cannot be reassigned to another start'); -- 17

insert into public.practice_logs(id,profile_id,practice_id,logged_for,completed,zaps_awarded,support_pillar_ids,support_evidence_version) values
 ('00000000-0000-4000-1291-000000000001','00000000-0000-4000-b291-000000000002','00000000-0000-4000-e291-000000000001',current_date,false,1,
 array['00000000-0000-4000-d291-000000000001'::uuid],99);
select is((select support_evidence_version::int from public.practice_logs where id='00000000-0000-4000-1291-000000000001'),1,'caller cannot forge an evidence version'); -- 18
select is((select support_pillar_ids from public.practice_logs where id='00000000-0000-4000-1291-000000000001'),
 (select array_agg(id order by id) from public.pillars where slug in('mind','body','spirit')),'first log freezes all actual declared supports'); -- 19
update public.practices set domain_id=(select id from public.pillars where slug='expression'),secondary_domain_id=null,focus_details='{}' where id='00000000-0000-4000-e291-000000000001';
update public.practice_logs set completed=true,zaps_awarded=12,support_pillar_ids='{}',support_evidence_version=1 where id='00000000-0000-4000-1291-000000000001';
select is((select support_pillar_ids from public.practice_logs where id='00000000-0000-4000-1291-000000000001'),
 (select array_agg(id order by id) from public.pillars where slug in('mind','body','spirit')),'partial-to-full updates and reclassification preserve log-time support'); -- 20
select is((select zaps_awarded from public.practice_logs where id='00000000-0000-4000-1291-000000000001'),12,'snapshot guard does not prevent reward bookkeeping'); -- 21
select ok((select completed from public.practice_logs where id='00000000-0000-4000-1291-000000000001'),'snapshot guard does not prevent timer completion'); -- 22
update public.journey_enrollments set completed_at=now() where id='00000000-0000-4000-f291-000000000002';
select ok((select completed_at is not null from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'policy immutability does not prevent completion stamps'); -- 23
select is((select completion_policy->>'expressionRequired' from public.journey_enrollments where id='00000000-0000-4000-f291-000000000002'),'false','completion does not erase the enrolled optional contract'); -- 24
select * from finish();
rollback;
