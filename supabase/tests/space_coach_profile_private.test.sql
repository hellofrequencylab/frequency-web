-- Release probe for 20270346025000. Run only against a disposable migrated database.
begin;
select plan(8);
select is(has_column_privilege('anon', 'public.space_private_state', 'coach_profile', 'select'), false,
  'anonymous visitors cannot read coach context');
select is(has_column_privilege('authenticated', 'public.space_private_state', 'coach_profile', 'select'), false,
  'browser sessions cannot read coach context');
select is(has_column_privilege('service_role', 'public.space_private_state', 'coach_profile', 'update'), true,
  'server role can update coach context');
insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');
insert into public.spaces(id,slug,name,type,entity_id,status,visibility,preferences) values
 ('00000000-0000-4000-c250-000000000001','coach-privacy-a','Coach A','business',
  (select id from public.entities where key='labs' limit 1),'active','network','{"theme":"keep"}'),
 ('00000000-0000-4000-c250-000000000002','coach-privacy-b','Coach B','business',
  (select id from public.entities where key='labs' limit 1),'active','network','{}');
insert into public.space_private_state(space_id,website_editor,program_overview,coach_profile) values
 ('00000000-0000-4000-c250-000000000001','{"draft":"keep"}','keep overview','{"goals":"A"}'),
 ('00000000-0000-4000-c250-000000000002',null,null,'{"goals":"B"}');
set local role service_role;
insert into public.space_private_state(space_id,coach_profile) values
 ('00000000-0000-4000-c250-000000000001','{"goals":"updated A"}')
 on conflict(space_id) do update set coach_profile=excluded.coach_profile;
select is((select website_editor->>'draft' from public.space_private_state where space_id='00000000-0000-4000-c250-000000000001'),'keep','coach save preserves website draft');
select is((select program_overview from public.space_private_state where space_id='00000000-0000-4000-c250-000000000001'),'keep overview','coach save preserves overview');
select is((select coach_profile->>'goals' from public.space_private_state where space_id='00000000-0000-4000-c250-000000000002'),'B','save stays in its own tenant');
update public.space_private_state set coach_profile=null where space_id='00000000-0000-4000-c250-000000000001';
select is((select coach_profile from public.space_private_state where space_id='00000000-0000-4000-c250-000000000001'),null::jsonb,'clear removes only private coach context');
select is((select preferences from public.spaces where id='00000000-0000-4000-c250-000000000001'),'{"theme":"keep"}'::jsonb,'private saves never write public preferences');
reset role;
select * from finish();
rollback;
