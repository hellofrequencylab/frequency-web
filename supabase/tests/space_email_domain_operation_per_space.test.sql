-- pgTAP behavioural guard for migration 20270346011100 (SCAN-830).
--
-- Before the migration, space_email_domain_operations.domain was unique across every Space, and
-- the row is inserted before any TXT ownership proof. A Space that typed a domain it did not own
-- held it for everyone. Now the operation row is unique per (space_id, domain) and the global
-- claim lives on space_email_domains, written only after the proof.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(5);

insert into auth.users (id,email) values
 ('00000000-0000-4000-a830-000000000001','domain-owner-a@test.local'),
 ('00000000-0000-4000-a830-000000000002','domain-owner-b@test.local');
insert into public.profiles(id,auth_user_id,display_name,handle) values
 ('00000000-0000-4000-b830-000000000001','00000000-0000-4000-a830-000000000001','Domain Owner A','domain-owner-a'),
 ('00000000-0000-4000-b830-000000000002','00000000-0000-4000-a830-000000000002','Domain Owner B','domain-owner-b');
delete from public.profiles where auth_user_id in
 ('00000000-0000-4000-a830-000000000001','00000000-0000-4000-a830-000000000002')
 and id not in ('00000000-0000-4000-b830-000000000001','00000000-0000-4000-b830-000000000002');
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility) values
 ('00000000-0000-4000-c830-000000000001','domain-space-a','Domain Space A','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b830-000000000001','active','network'),
 ('00000000-0000-4000-c830-000000000002','domain-space-b','Domain Space B','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b830-000000000002','active','network');

-- 1. The constraint moved: no global unique on domain, one unique on (space_id, domain).
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.space_email_domain_operations'::regclass
      and contype = 'u'
      and conkey = (select array_agg(attnum order by attnum) from pg_attribute
                     where attrelid = 'public.space_email_domain_operations'::regclass
                       and attname in ('space_id','domain'))),
  1,
  'space_email_domain_operations has a unique constraint on (space_id, domain)');
select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.space_email_domain_operations'::regclass
      and contype = 'u'
      and conkey = (select array_agg(attnum) from pg_attribute
                     where attrelid = 'public.space_email_domain_operations'::regclass
                       and attname = 'domain')),
  0,
  'space_email_domain_operations no longer has a global unique constraint on domain');

-- 2. Space A prepares an operation for a domain it does not own.
insert into public.space_email_domain_operations(id,space_id,owner_profile_id,domain)
values('00000000-0000-4000-f830-000000000001','00000000-0000-4000-c830-000000000001','00000000-0000-4000-b830-000000000001','victim.test');

-- 3. The real owner, Space B, can still prepare its own operation for the same domain.
select lives_ok(
  $$insert into public.space_email_domain_operations(id,space_id,owner_profile_id,domain)
    values('00000000-0000-4000-f830-000000000002','00000000-0000-4000-c830-000000000002','00000000-0000-4000-b830-000000000002','victim.test')$$,
  'a second Space can open its own setup operation for the same unproven domain');

-- 4. The same Space still gets one row per domain.
select throws_ok(
  $$insert into public.space_email_domain_operations(id,space_id,owner_profile_id,domain)
    values('00000000-0000-4000-f830-000000000003','00000000-0000-4000-c830-000000000002','00000000-0000-4000-b830-000000000002','victim.test')$$,
  '23505', null,
  'one Space cannot open two operations for one domain');

-- 5. The global claim is still exclusive where the proof is: space_email_domains.
insert into public.space_email_domains(id,space_id,domain,provider_domain_id) values
 ('00000000-0000-4000-d830-000000000002','00000000-0000-4000-c830-000000000002','victim.test','provider-830-b');
select throws_ok(
  $$insert into public.space_email_domains(id,space_id,domain,provider_domain_id) values
    ('00000000-0000-4000-d830-000000000001','00000000-0000-4000-c830-000000000001','victim.test','provider-830-a')$$,
  '23505', null,
  'a proven domain is still held by exactly one Space in space_email_domains');

select * from finish();
rollback;
