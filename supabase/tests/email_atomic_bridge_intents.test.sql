-- EMAIL-002 consequence draft. Isolated local/CI database only; never shared production.
-- Single-session pgTAP does not establish inter-session races or worker crash recovery.
begin;
select plan(16);
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-a002-000000000001','actor002@example.test',now()),
 ('00000000-0000-4000-a002-000000000002','member002@example.test',now());
insert into public.profiles(id,auth_user_id,display_name,handle,is_active,web_role) values
 ('00000000-0000-4000-b002-000000000001','00000000-0000-4000-a002-000000000001','Actor','actor-email-002',true,'admin'),
 ('00000000-0000-4000-b002-000000000002','00000000-0000-4000-a002-000000000002','Member','member-email-002',true,'member');
insert into public.comms_conversations(id,subject,owner_profile_id,assigned_to,external_email,member_profile_id) values
 ('00000000-0000-4000-c002-000000000001','Atomic fixture','00000000-0000-4000-b002-000000000001',
  '00000000-0000-4000-b002-000000000001','member002@example.test','00000000-0000-4000-b002-000000000002');
create function pg_temp.atomic_bridge_fixture(receipt text,subject text default 'Atomic fixture') returns jsonb language sql as $$
 select public.enqueue_conversation_email_intent('00000000-0000-4000-c002-000000000001',
 '00000000-0000-4000-b002-000000000001',receipt,'actor002@example.test','Body',
 jsonb_build_object('to','injected@example.test','subject',subject,'html','<p>Body</p>'));
$$;
set local role service_role;
select lives_ok($$select pg_temp.atomic_bridge_fixture('<atomic002-1>')$$,'service-role transaction creates delivery including auth lookup');
reset role;
select is((select count(*) from public.email_delivery_intents where conversation_id='00000000-0000-4000-c002-000000000001'),1::bigint,'one durable intent');
select is((select count(*) from public.comms_messages where external_message_id='<atomic002-1>'),1::bigint,'one message');
select is((select count(*) from public.notification_queue where dedupe_key='bridge:00000000-0000-4000-c002-000000000001:<atomic002-1>'),1::bigint,'one queue job');
select is((select payload->>'to' from public.email_delivery_intents where logical_send_key like '%<atomic002-1>'),'member002@example.test','recipient comes from conversation');
select is((select delivery_status from public.comms_messages where external_message_id='<atomic002-1>'),'queued','message never claims sent on enqueue');
select is(pg_temp.atomic_bridge_fixture('<atomic002-1>')->>'duplicate','true','replay returns existing intent');
select throws_ok($$select pg_temp.atomic_bridge_fixture('<atomic002-1>','Different')$$,'22023',null,'conflicting replay cannot silently change payload');
create function pg_temp.fail_email_queue_write() returns trigger language plpgsql as $$
begin if new.payload->>'subject'='FAIL_TX' then raise exception 'injected queue failure' using errcode='P0001'; end if; return new; end $$;
create trigger atomic_fixture_failure before insert on public.notification_queue for each row execute function pg_temp.fail_email_queue_write();
select throws_ok($$select pg_temp.atomic_bridge_fixture('<atomic002-fault>','FAIL_TX')$$,'P0001',null,'queue failure aborts transaction');
select is((select count(*) from public.comms_messages where external_message_id='<atomic002-fault>'),0::bigint,'failed queue transaction leaves no message');
select is((select count(*) from public.email_delivery_intents where logical_send_key like '%<atomic002-fault>'),0::bigint,'failed queue transaction leaves no intent');
drop trigger atomic_fixture_failure on public.notification_queue;
select lives_ok($$select pg_temp.atomic_bridge_fixture('<atomic002-fault>','FAIL_TX')$$,'retry after crash/fault commits complete intent');
select throws_ok($$select public.enqueue_conversation_email_intent('00000000-0000-4000-c002-000000000001',
'00000000-0000-4000-b002-000000000001','<spoof>','other@example.test','Body','{"subject":"No","html":"No"}')$$,'42501',null,'observed sender bound to current agent');
set local role authenticated;
select throws_ok($$select public.enqueue_conversation_email_intent('00000000-0000-4000-c002-000000000001',
'00000000-0000-4000-b002-000000000001','<client>','actor002@example.test','Body','{"subject":"No","html":"No"}')$$,'42501',null,'ordinary clients cannot invoke privileged bridge');
reset role;
select is((select count(*) from public.notification_queue where dedupe_key='bridge:00000000-0000-4000-c002-000000000001:<atomic002-1>'),1::bigint,'all replays leave exactly one outbox job');
select is((select status from public.comms_conversations where id='00000000-0000-4000-c002-000000000001'),'waiting','conversation change commits with intent');
select * from finish();
rollback;
