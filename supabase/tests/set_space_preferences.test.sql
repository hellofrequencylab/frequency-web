-- pgTAP behavioural guard for migration 20270346011200 (SCAN-833).
--
-- set_space_preferences is the key-scoped writer for spaces.preferences. It must set only the keys
-- it is given, delete a key on a JSON null, leave every other key (the websiteEditor stub above
-- all) exactly as it was, refuse the two keys SCAN-827 moved to space_private_state, and be callable
-- by service_role only.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(9);

insert into auth.users (id,email) values ('00000000-0000-4000-a833-000000000001','prefs-owner@test.local');
insert into public.profiles(id,auth_user_id,display_name,handle) values
 ('00000000-0000-4000-b833-000000000001','00000000-0000-4000-a833-000000000001','Prefs Owner','prefs-owner');
delete from public.profiles where auth_user_id = '00000000-0000-4000-a833-000000000001'
 and id <> '00000000-0000-4000-b833-000000000001';
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility,preferences) values
 ('00000000-0000-4000-c833-000000000001','prefs-space','Prefs Space','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b833-000000000001','active','network',
 '{"theme":"classic","skyMarkers":true,"websiteEditor":{"revision":7,"published":true}}'::jsonb);

-- 1. The grant is the lock.
select is(has_function_privilege('anon', 'public.set_space_preferences(uuid, jsonb)', 'execute'), false,
  'anon cannot execute set_space_preferences');
select is(has_function_privilege('authenticated', 'public.set_space_preferences(uuid, jsonb)', 'execute'), false,
  'authenticated cannot execute set_space_preferences');
select is(has_function_privilege('service_role', 'public.set_space_preferences(uuid, jsonb)', 'execute'), true,
  'service_role can execute set_space_preferences');

-- 2. Set one key, delete another, touch nothing else.
select is(public.set_space_preferences('00000000-0000-4000-c833-000000000001',
  '{"siteMenu":{"v":1,"items":[]},"skyMarkers":null}'::jsonb), true,
  'a patch on an existing Space returns true');
select is((select preferences -> 'siteMenu' from public.spaces where id='00000000-0000-4000-c833-000000000001'),
  '{"v":1,"items":[]}'::jsonb, 'the named key is set');
select is((select preferences ? 'skyMarkers' from public.spaces where id='00000000-0000-4000-c833-000000000001'),
  false, 'a JSON null deletes its key');
select is((select preferences - 'siteMenu' from public.spaces where id='00000000-0000-4000-c833-000000000001'),
  '{"theme":"classic","websiteEditor":{"revision":7,"published":true}}'::jsonb,
  'every other key, the websiteEditor stub included, is untouched');

-- 3. The private-state keys are refused; an unknown Space is false.
select throws_ok(
  $$select public.set_space_preferences('00000000-0000-4000-c833-000000000001', '{"websiteEditor":{}}'::jsonb)$$,
  '22023', null, 'websiteEditor cannot be written through set_space_preferences');
select is(public.set_space_preferences('00000000-0000-4000-c833-0000000000ff', '{"theme":"bold"}'::jsonb), false,
  'an unknown Space returns false');

select * from finish();
rollback;
