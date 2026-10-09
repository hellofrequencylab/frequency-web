-- Draft behavior proof: lease claim, provider ambiguity and tenant defaults. Not run locally.
begin;
select plan(8);
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

insert into public.space_email_domain_operations(id,space_id,owner_profile_id,domain)
values('00000000-0000-4000-f012-000000000001','00000000-0000-4000-c011-000000000001','00000000-0000-4000-b011-000000000001','a.identity.test');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a011-000000000001","role":"authenticated"}',true);
select throws_ok($$select * from public.space_email_domain_operations$$,'42501',null,'owner cannot read internal provisioning operation tokens');
select throws_ok($$select public.claim_space_email_domain_operation('00000000-0000-4000-f012-000000000001')$$,'42501',null,'owner cannot bypass server lease authorization');
set local role anon;
select throws_ok($$select * from public.space_email_identity_defaults$$,'42501',null,'anonymous cannot read tenant sender defaults');
set local role service_role;
select is(public.claim_space_email_domain_operation('00000000-0000-4000-f012-000000000001')->>'mode','create','first durable claim permits one provider create');
select is(public.claim_space_email_domain_operation('00000000-0000-4000-f012-000000000001')->>'mode','busy','second active claim cannot repeat provider create');
update public.space_email_domain_operations set lease_until=now()-interval '1 second' where id='00000000-0000-4000-f012-000000000001';
select is(public.claim_space_email_domain_operation('00000000-0000-4000-f012-000000000001')->>'mode','reconcile','expired unknown provider outcome requires reconciliation');
update public.space_email_domain_operations set provider_domain_id='provider-a',lease_until=now()-interval '1 second' where id='00000000-0000-4000-f012-000000000001';
select is(public.claim_space_email_domain_operation('00000000-0000-4000-f012-000000000001')->>'mode','persist','known provider identity replays persistence rather than create');
select throws_ok($$insert into public.space_email_identity_defaults(space_id,purpose,identity_id)
 values('00000000-0000-4000-c011-000000000002','marketing','00000000-0000-4000-e011-000000000001')$$,'23503',null,'sender default cannot reference another tenant identity');
select * from finish();
rollback;
