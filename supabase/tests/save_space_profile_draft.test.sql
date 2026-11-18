-- pgTAP behavioural guard for migration 20270346120000 (PROG-E5 item 1).
--
-- save_space_profile_draft is the one write of a Space page draft for the canvas and the Space page builder. It must
-- refuse an actor who may not manage the Space, refuse a stale expected revision, set only the draft key and move
-- the counter, remove the draft on a null, leave every other key as it was, and be callable by service_role only.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(14);

insert into auth.users (id,email) values
 ('00000000-0000-4000-a5e5-000000000001','draft-owner@test.local'),
 ('00000000-0000-4000-a5e5-000000000002','draft-editor@test.local'),
 ('00000000-0000-4000-a5e5-000000000003','draft-stranger@test.local');
insert into public.profiles(id,auth_user_id,display_name,handle) values
 ('00000000-0000-4000-b5e5-000000000001','00000000-0000-4000-a5e5-000000000001','Draft Owner','draft-owner'),
 ('00000000-0000-4000-b5e5-000000000002','00000000-0000-4000-a5e5-000000000002','Draft Editor','draft-editor'),
 ('00000000-0000-4000-b5e5-000000000003','00000000-0000-4000-a5e5-000000000003','Draft Stranger','draft-stranger');
delete from public.profiles where auth_user_id in ('00000000-0000-4000-a5e5-000000000001','00000000-0000-4000-a5e5-000000000002','00000000-0000-4000-a5e5-000000000003')
 and id not in ('00000000-0000-4000-b5e5-000000000001','00000000-0000-4000-b5e5-000000000002','00000000-0000-4000-b5e5-000000000003');
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,owner_profile_id,status,visibility,preferences) values
 ('00000000-0000-4000-c5e5-000000000001','draft-space','Draft Space','business',
 (select id from public.entities where key='labs' limit 1),'00000000-0000-4000-b5e5-000000000001','active','network',
 '{"theme":"classic","websiteEditor":{"revision":7},"profileLayout":{"rows":[]}}'::jsonb);
insert into public.space_members(space_id,profile_id,role,status) values
 ('00000000-0000-4000-c5e5-000000000001','00000000-0000-4000-b5e5-000000000002','editor','active');

-- 1. The grant is the lock.
select is(has_function_privilege('anon', 'public.save_space_profile_draft(uuid, uuid, jsonb, bigint)', 'execute'), false,
  'anon cannot execute save_space_profile_draft');
select is(has_function_privilege('authenticated', 'public.save_space_profile_draft(uuid, uuid, jsonb, bigint)', 'execute'), false,
  'authenticated cannot execute save_space_profile_draft');
select is(has_function_privilege('service_role', 'public.save_space_profile_draft(uuid, uuid, jsonb, bigint)', 'execute'), true,
  'service_role can execute save_space_profile_draft');

-- 2. Access is checked inside.
select is(public.save_space_profile_draft('00000000-0000-4000-b5e5-000000000003','00000000-0000-4000-c5e5-000000000001','{"rows":[1]}'::jsonb, null),
  '{"status":"forbidden"}'::jsonb, 'a stranger is refused');
select is((select preferences ? 'profileLayoutDraft' from public.spaces where id='00000000-0000-4000-c5e5-000000000001'), false,
  'a refused write changes nothing');

-- 3. The builder (no expected revision) writes the draft and moves the counter.
select is(public.save_space_profile_draft('00000000-0000-4000-b5e5-000000000002','00000000-0000-4000-c5e5-000000000001','{"rows":[2]}'::jsonb, null),
  '{"status":"written","revision":1}'::jsonb, 'an editor saves and the counter moves to 1');
select is((select preferences -> 'profileLayoutDraft' from public.spaces where id='00000000-0000-4000-c5e5-000000000001'),
  '{"rows":[2]}'::jsonb, 'the draft key is set');
select is((select preferences - 'profileLayoutDraft' - 'profileLayoutDraftRevision' from public.spaces where id='00000000-0000-4000-c5e5-000000000001'),
  '{"theme":"classic","websiteEditor":{"revision":7},"profileLayout":{"rows":[]}}'::jsonb,
  'every other key, the published page and the websiteEditor stub included, is untouched');

-- 4. The canvas compares the revision in the write: a tab behind the builder save is stale.
select is(public.save_space_profile_draft('00000000-0000-4000-b5e5-000000000001','00000000-0000-4000-c5e5-000000000001','{"rows":[3]}'::jsonb, 0),
  '{"status":"stale","revision":1}'::jsonb, 'a canvas tab on revision 0 is stale after the builder saved');
select is((select preferences -> 'profileLayoutDraft' from public.spaces where id='00000000-0000-4000-c5e5-000000000001'),
  '{"rows":[2]}'::jsonb, 'a stale write changes nothing');
select is(public.save_space_profile_draft('00000000-0000-4000-b5e5-000000000001','00000000-0000-4000-c5e5-000000000001','{"rows":[4]}'::jsonb, 1),
  '{"status":"written","revision":2}'::jsonb, 'the owner on the stored revision writes');

-- 5. A null draft removes the key and still moves the counter; bad input and unknown Spaces.
select is(public.save_space_profile_draft('00000000-0000-4000-b5e5-000000000002','00000000-0000-4000-c5e5-000000000001', null, null),
  '{"status":"written","revision":3}'::jsonb, 'a null draft is written as a removal');
select is((select preferences ? 'profileLayoutDraft' from public.spaces where id='00000000-0000-4000-c5e5-000000000001'), false,
  'the draft key is gone');
select throws_ok(
  $$select public.save_space_profile_draft('00000000-0000-4000-b5e5-000000000001','00000000-0000-4000-c5e5-000000000001','[1]'::jsonb, null)$$,
  '22023', null, 'a draft that is not an object is refused');

select * from finish();
rollback;
