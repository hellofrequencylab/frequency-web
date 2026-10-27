-- HYG-205: actual full-migration-schema behavior. Single transaction/session; separate real-PG
-- concurrency evidence covers blocking/rechecks. Everything here rolls back; no production execution.
begin;
select plan(24);
select is((select count(*)::int from supabase_migrations.schema_migrations where version='20261027033306'),1,'CLI ledger records the registered migration after full ordered replay');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.profiles(id,display_name,handle) values
('00000000-0000-4000-b205-000000000001','Room One','atomic_room_test_one'),
('00000000-0000-4000-b205-000000000002','Room Two','atomic_room_test_two'),
('00000000-0000-4000-b205-000000000003','Room Three','atomic_room_test_three'),
('00000000-0000-4000-b205-000000000004','Room Stranger','atomic_room_test_stranger');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')),3,'all three registered RPCs exist after full ordered replay');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')and not prosecdef),3,'RPCs remain security invoker');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')and proconfig @> array['search_path=""']),3,'all RPCs have pinned empty search path');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')and has_function_privilege('anon',oid,'EXECUTE')),0,'anon cannot execute any atomic RPC');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')and has_function_privilege('authenticated',oid,'EXECUTE')),0,'authenticated cannot execute any atomic RPC');
select is((select count(*)::int from pg_proc where pronamespace='public'::regnamespace and proname in('room_create_atomic','room_set_member_admin_atomic','room_remove_member_atomic')and has_function_privilege('service_role',oid,'EXECUTE')),3,'service role can execute all atomic RPCs');
set local role anon;
select throws_ok($$select public.room_create_atomic('00000000-0000-4000-b205-000000000001','Denied',null,'public')$$,'42501',null,'anon actual invocation is denied');
reset role;
set local role authenticated;
select throws_ok($$select public.room_create_atomic('00000000-0000-4000-b205-000000000001','Denied',null,'public')$$,'42501',null,'signed-in actual invocation is denied');
reset role;
set local role service_role;
select lives_ok($$select public.room_create_atomic('00000000-0000-4000-b205-000000000001','  Atomic full schema test  ','  Notes  ','private')$$,'service creates room and creator membership atomically');
select is((select count(*)::int from public.rooms r join public.room_members m on m.room_id=r.id where r.name='Atomic full schema test'and r.description='Notes'and r.visibility='private'and m.profile_id='00000000-0000-4000-b205-000000000001'and m.is_admin),1,'trimmed private room has creator-admin membership');
insert into public.room_members(room_id,profile_id,is_admin) select id,'00000000-0000-4000-b205-000000000002',false from public.rooms where name='Atomic full schema test';
insert into public.room_members(room_id,profile_id,is_admin) select id,'00000000-0000-4000-b205-000000000003',false from public.rooms where name='Atomic full schema test';
select throws_ok($$select room_set_member_admin_atomic('00000000-0000-4000-b205-000000000004',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000002',true)$$,'42501',null,'stranger cannot promote');
select throws_ok($$select room_set_member_admin_atomic('00000000-0000-4000-b205-000000000003',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000002',true)$$,'42501',null,'ordinary member cannot promote');
select lives_ok($$select room_set_member_admin_atomic('00000000-0000-4000-b205-000000000001',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000002',true)$$,'admin can promote member');
select lives_ok($$select room_set_member_admin_atomic('00000000-0000-4000-b205-000000000001',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000001',false)$$,'admin can demote self with another admin');
select throws_ok($$select room_set_member_admin_atomic('00000000-0000-4000-b205-000000000001',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000002',false)$$,'42501',null,'former admin authority is rechecked');
select throws_ok($$select room_set_member_admin_atomic('00000000-0000-4000-b205-000000000002',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000002',false)$$,'23514',null,'last-admin demotion denied');
select throws_ok($$select room_remove_member_atomic('00000000-0000-4000-b205-000000000002',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000002')$$,'23514',null,'last-admin leave denied');
select throws_ok($$select room_remove_member_atomic('00000000-0000-4000-b205-000000000003',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000001')$$,'42501',null,'ordinary member cannot kick another');
select lives_ok($$select room_remove_member_atomic('00000000-0000-4000-b205-000000000003',(select id from rooms where name='Atomic full schema test'),'00000000-0000-4000-b205-000000000003')$$,'ordinary member can leave self');
select is((select count(*)::int from room_members where room_id=(select id from rooms where name='Atomic full schema test')),2,'failed mutations preserve members and successful leave removes only target');
select throws_ok($$select room_create_atomic('00000000-0000-4000-b205-000000000001','No scoped mint',null,'circle')$$,'22023',null,'manual create cannot mint scoped room');
select throws_ok($$select room_create_atomic(null,'No actor',null,'public')$$,'42501',null,'missing actor denied');
select is((select count(*)::int from room_members where room_id=(select id from rooms where name='Atomic full schema test')and is_admin),1,'exactly one admin survives all manual actions');
reset role;
select * from finish();
rollback;
