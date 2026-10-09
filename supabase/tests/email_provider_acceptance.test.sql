-- EMAIL-003 local/CI only. Single-session consequences; inter-session race/crash still separate.
begin;
select plan(18);
insert into public.notification_queue(id,kind,payload,status) values
 ('00000000-0000-4000-a003-000000000001','email','{}','processing'),
 ('00000000-0000-4000-a003-000000000002','email','{}','processing'),
 ('00000000-0000-4000-a003-000000000003','email','{}','processing');
create function pg_temp.prepare_email_fixture(n integer) returns jsonb language sql as $$
 select public.prepare_email_provider_attempt(('00000000-0000-4000-a003-'||lpad(n::text,12,'0'))::uuid,
 '{"from":"fixture@send.example.test","to":"fixture@example.test","subject":"Fixture","html":"Fixture"}');
$$;
select is(pg_temp.prepare_email_fixture(1)->>'state','dispatching','first dispatch persisted before network');
select is((select state from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000001'),'dispatching','crash leaves durable unresolved state');
select is(pg_temp.prepare_email_fixture(1)->>'idempotencyKey','frequency/email/00000000-0000-4000-a003-000000000001','crash retry uses stable provider key');
select ok((select prior_unknown from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000001'),'crash retains unknown acceptance');
select ok(public.settle_email_provider_attempt('00000000-0000-4000-a003-000000000001',
 (select attempt_nonce from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000001'),
 'retryable',null,'429'),'retryable refusal recorded');
select ok((select prior_unknown from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000001'),'later refusal cannot erase earlier unknown');
update public.email_provider_attempts set first_attempt_at=now()-interval '25 hours' where queue_job_id='00000000-0000-4000-a003-000000000001';
select is(pg_temp.prepare_email_fixture(1)->>'state','held','expired unknown cannot call provider again');
select is((select payload->>'__providerAcceptanceRequired' from public.notification_queue where id='00000000-0000-4000-a003-000000000001'),'true','sticky job marker preserves ledger on rollout rollback');
select is(pg_temp.prepare_email_fixture(2)->>'state','dispatching','second independent job can prepare');
select ok(public.settle_email_provider_attempt('00000000-0000-4000-a003-000000000002',
 (select attempt_nonce from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000002'),
 'accepted','provider-fixture-2',null),'acceptance ID committed');
select is(pg_temp.prepare_email_fixture(2)->>'providerId','provider-fixture-2','accepted recovery skips provider');
select throws_ok($$select public.prepare_email_provider_attempt('00000000-0000-4000-a003-000000000002','{"subject":"Changed"}')$$,'22023',null,'payload changes refuse retry');
select is(public.read_accepted_email_provider_attempt('00000000-0000-4000-a003-000000000002')->>'providerId','provider-fixture-2','read-only acceptance replay recovers ID without fresh dispatch');
select is(pg_temp.prepare_email_fixture(3)->>'state','dispatching','third attempt starts');
select pg_temp.prepare_email_fixture(3); -- lost acknowledgement means prior unknown
select ok(public.settle_email_provider_attempt('00000000-0000-4000-a003-000000000003',
 (select attempt_nonce from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000003'),
 'failed',null,'422'),'later permanent refusal settles without erasing earlier uncertainty');
select is((select state from public.email_provider_attempts where queue_job_id='00000000-0000-4000-a003-000000000003'),'held','prior unknown plus refusal remains held, never definitive failure');
set local role authenticated;
select throws_ok($$select public.read_accepted_email_provider_attempt('00000000-0000-4000-a003-000000000002')$$,'42501',null,'ordinary clients cannot read provider acknowledgement replay');
select throws_ok($$select public.prepare_email_provider_attempt('00000000-0000-4000-a003-000000000002','{}')$$,'42501',null,'ordinary clients cannot prepare provider attempts');
reset role;
select * from finish();
rollback;
