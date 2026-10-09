-- Behavioral ownership, grants and tenant FK checks. NOT executed until local replay available.
begin;
select plan(11);
insert into auth.users (id,email) values
 ('00000000-0000-4000-a011-000000000001','email-owner-a@test.local'),
 ('00000000-0000-4000-a011-000000000002','email-owner-b@test.local');
insert into public.profiles(id,auth_user_id,display_name,handle) values
 ('00000000-0000-4000-b011-000000000001','00000000-0000-4000-a011-000000000001','Email Owner A','email-owner-a'),
 ('00000000-0000-4000-b011-000000000002','00000000-0000-4000-a011-000000000002','Email Owner B','email-owner-b');
delete from public.profiles where auth_user_id in
 ('00000000-0000-4000-a011-000000000001','00000000-0000-4000-a011-000000000002')
 and id not in ('00000000-0000-4000-b011-000000000001','00000000-0000-4000-b011-000000000002');
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility) values
 ('00000000-0000-4000-c011-000000000001','email-registry-a','Email Registry A','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b011-000000000001','active','network'),
 ('00000000-0000-4000-c011-000000000002','email-registry-b','Email Registry B','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b011-000000000002','active','network');
insert into public.space_email_domains(id,space_id,domain,provider_domain_id) values
 ('00000000-0000-4000-d011-000000000001','00000000-0000-4000-c011-000000000001','a.identity.test','provider-a'),
 ('00000000-0000-4000-d011-000000000002','00000000-0000-4000-c011-000000000002','b.identity.test','provider-b');
insert into public.space_email_identities(id,space_id,domain_id,local_part,display_name) values
 ('00000000-0000-4000-e011-000000000001','00000000-0000-4000-c011-000000000001','00000000-0000-4000-d011-000000000001','hello','Owner A'),
 ('00000000-0000-4000-e011-000000000002','00000000-0000-4000-c011-000000000002','00000000-0000-4000-d011-000000000002','hello','Owner B');
select throws_ok($$insert into public.space_email_identities(space_id,domain_id,local_part,display_name)
 values('00000000-0000-4000-c011-000000000002','00000000-0000-4000-d011-000000000001','cross','Cross')$$,
 '23503',null,'composite FK rejects assigning another Space domain');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a011-000000000001","role":"authenticated"}',true);
select results_eq($$select domain from public.space_email_domains order by domain$$,$$values('a.identity.test'::text)$$,
 'owner A sees only its domain using auth-user to profile mapping');
select results_eq($$select display_name from public.space_email_identities order by display_name$$,$$values('Owner A'::text)$$,
 'owner A sees only its identity');
select throws_ok($$update public.space_email_domains set sending_verified=true$$,'42501',null,'owner cannot self-attest provider verification');
select throws_ok($$delete from public.space_email_identities$$,'42501',null,'owner cannot bypass server mutation boundary');
select throws_ok($$insert into public.space_email_identities(space_id,domain_id,local_part,display_name)
 values('00000000-0000-4000-c011-000000000001','00000000-0000-4000-d011-000000000001','forged','Forged')$$,
 '42501',null,'owner cannot create an identity directly');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a011-000000000002","role":"authenticated"}',true);
select results_eq($$select domain from public.space_email_domains order by domain$$,$$values('b.identity.test'::text)$$,'owner B sees only its domain');
set local role anon;
select throws_ok($$select * from public.space_email_domains$$,'42501',null,'anonymous cannot read domains');
select throws_ok($$select * from public.space_email_identities$$,'42501',null,'anonymous cannot read identities');
set local role service_role;
select lives_ok($$update public.space_email_domains set sending_verified=true,last_verified_at=now()
 where id='00000000-0000-4000-d011-000000000001'$$,'service-role provider path can record verification');
select lives_ok($$update public.space_email_identities set paused_at=now()
 where id='00000000-0000-4000-e011-000000000001'$$,'service-role can pause a sender');
select * from finish();
rollback;
