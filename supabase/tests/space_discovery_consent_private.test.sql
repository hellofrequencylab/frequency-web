-- Disposable database only. No live SQL acceptance is claimed by this source test.
begin;
select plan(14);
select is(has_column_privilege('anon','public.space_private_state','discovery_consent','select'),false,'anon cannot read permission');
select is(has_column_privilege('authenticated','public.space_private_state','discovery_consent','select'),false,'browser cannot read permission');
select is(has_column_privilege('authenticated','public.space_private_state','discovery_consent','update'),false,'browser cannot grant permission');
select is(has_column_privilege('service_role','public.space_private_state','discovery_consent','update'),true,'server can write permission');
select is((select relrowsecurity from pg_class where oid='public.space_private_state'::regclass),true,'RLS stays enabled');
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit' where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,status,visibility,preferences) values
 ('00000000-0000-4000-c251-000000000001','discovery-privacy-a','Discovery A','business',(select id from public.entities where key='labs' limit 1),'active','network','{"theme":"keep"}'),
 ('00000000-0000-4000-c251-000000000002','discovery-privacy-b','Discovery B','business',(select id from public.entities where key='labs' limit 1),'active','network','{}');
insert into public.space_private_state(space_id,website_editor,program_overview,coach_profile,discovery_consent) values
 ('00000000-0000-4000-c251-000000000001','{"draft":"keep"}','keep overview','{"voice":"keep"}',null),
 ('00000000-0000-4000-c251-000000000002',null,null,null,'{"id":"other-grant"}');
set local role service_role;
insert into public.space_private_state(space_id,discovery_consent) values
 ('00000000-0000-4000-c251-000000000001','{"id":"grant-a","purpose":"discovery_coaching","revokedAt":null}')
 on conflict(space_id) do update set discovery_consent=excluded.discovery_consent;
select is((select website_editor->>'draft' from public.space_private_state where space_id='00000000-0000-4000-c251-000000000001'),'keep','grant preserves website draft');
select is((select program_overview from public.space_private_state where space_id='00000000-0000-4000-c251-000000000001'),'keep overview','grant preserves overview');
select is((select coach_profile->>'voice' from public.space_private_state where space_id='00000000-0000-4000-c251-000000000001'),'keep','grant preserves coaching preferences');
select is((select discovery_consent->>'id' from public.space_private_state where space_id='00000000-0000-4000-c251-000000000002'),'other-grant','grant does not change other tenant');
update public.space_private_state set discovery_consent=jsonb_set(discovery_consent,'{revokedAt}','"2026-10-26T12:00:00Z"') where space_id='00000000-0000-4000-c251-000000000001';
select is((select discovery_consent->>'revokedAt' from public.space_private_state where space_id='00000000-0000-4000-c251-000000000001'),'2026-10-26T12:00:00Z','revocation is durable');
select is((select preferences from public.spaces where id='00000000-0000-4000-c251-000000000001'),'{"theme":"keep"}'::jsonb,'permission never writes public preferences');
select throws_ok($$update public.space_private_state set discovery_consent='[]' where space_id='00000000-0000-4000-c251-000000000001'$$,'23514',null,'nonobject permission rejected');
select throws_ok($$update public.space_private_state set discovery_consent=jsonb_build_object('payload',repeat('x',4096)) where space_id='00000000-0000-4000-c251-000000000001'$$,'23514',null,'oversized permission rejected');
select is((select discovery_consent->>'id' from public.space_private_state where space_id='00000000-0000-4000-c251-000000000002'),'other-grant','revoke stays in its own tenant');
reset role;
select * from finish();
rollback;
