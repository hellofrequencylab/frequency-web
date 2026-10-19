-- pgTAP for space_private_state (migration 20270346009800, SCAN-827): website drafts, review
-- comments and the Executive Overview are not readable with the anon key.
--
-- WHY THIS FILE EXISTS. TypeScript pins the app wiring. Only this file can pin the SQL: that
-- anon/authenticated cannot read the private row; that save_website_editor writes the full state
-- there and a comment-free stub onto spaces.preferences; that publish_due_websites reads scheduled
-- state from the private row.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(12);

insert into public.entities(id,key,name,kind) select gen_random_uuid(),'labs','Labs','for_profit'
 where not exists(select 1 from public.entities where key='labs');

insert into public.spaces(id,slug,name,type,entity_id,status,visibility,preferences) values
 ('00000000-0000-4000-c827-000000000001','scan-827','SCAN 827','business',
  (select id from public.entities where key='labs' limit 1),'active','network',
  '{"theme":"kept"}'::jsonb);

-- ── 0. Grants: the private table is not a browser RPC ────────────────────────────────────────
select is(has_table_privilege('anon', 'public.space_private_state', 'select'), false,
  'anon cannot select space_private_state');
select is(has_table_privilege('authenticated', 'public.space_private_state', 'select'), false,
  'authenticated cannot select space_private_state');
select is(has_function_privilege('anon', 'public.website_editor_public_stub(jsonb)', 'execute'), false,
  'anon cannot execute website_editor_public_stub');
select is(has_function_privilege('anon', 'public.save_website_editor(uuid,integer,jsonb,boolean)', 'execute'), false,
  'anon cannot execute save_website_editor');

set local role authenticated;
select throws_ok(
  $$ insert into public.space_private_state(space_id, program_overview)
     values ('00000000-0000-4000-c827-000000000001', 'secret overview') $$,
  '42501',
  null,
  'authenticated cannot insert the private overview'
);
reset role;

-- ── 1. save_website_editor writes private state and a public stub ────────────────────────────
set local role service_role;
select is(
  public.save_website_editor(
    '00000000-0000-4000-c827-000000000001',
    0,
    '{"v":1,"revision":1,"draft":{"theme":"DAWN","secret":"draft-copy","pages":[]},"published":{"theme":"DAWN","pages":[{"slug":"home","comments":[{"author":"Ada","text":"fix this"}]}]},"scheduled":null,"versions":[{"id":"1","snapshot":{"secret":"old"}}]}'::jsonb,
    true
  ),
  true,
  'service_role can save the first website revision'
);

select is(
  (select website_editor #>> '{draft,secret}' from public.space_private_state
    where space_id = '00000000-0000-4000-c827-000000000001'),
  'draft-copy',
  'the private row keeps the unpublished draft'
);
select is(
  (select website_editor #>> '{published,pages,0,comments,0,author}' from public.space_private_state
    where space_id = '00000000-0000-4000-c827-000000000001'),
  'Ada',
  'the private row keeps review comments'
);
select is(
  (select preferences -> 'websiteEditor' ? 'draft' from public.spaces
    where id = '00000000-0000-4000-c827-000000000001'),
  false,
  'the public Space row does not carry the draft'
);
select is(
  (select preferences #>> '{websiteEditor,published,pages,0,comments}' from public.spaces
    where id = '00000000-0000-4000-c827-000000000001'),
  '[]',
  'the public published snapshot has no review comments'
);
select is(
  (select preferences ->> 'theme' from public.spaces
    where id = '00000000-0000-4000-c827-000000000001'),
  'kept',
  'other preferences keys are untouched'
);

-- ── 2. publish_due_websites reads the private scheduled snapshot ─────────────────────────────
update public.space_private_state
   set website_editor = website_editor || jsonb_build_object(
     'scheduled', jsonb_build_object(
       'at', '2000-01-01T00:00:00Z',
       'author', 'Ada',
       'snapshot', '{"theme":"DAWN","pages":[{"slug":"home","comments":[]}]}'::jsonb
     )
   )
 where space_id = '00000000-0000-4000-c827-000000000001';

select is(
  (select count(*)::int from public.publish_due_websites('2000-01-02T00:00:00Z') where slug = 'scan-827'),
  1,
  'publish_due_websites activates a due snapshot from the private row'
);

select * from finish();
rollback;
