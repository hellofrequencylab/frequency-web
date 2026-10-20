-- PROG-A3: a Space's module switch is enforced inside RLS. Pins the policy shape and the helper's
-- default-ON rule (absent key = on, only an explicit false = off) without a seed graph.
begin;
select plan(13);

select is(
  (select count(*)::int from pg_policy
    where polrelid in ('public.circles'::regclass, 'public.events'::regclass, 'public.practices'::regclass,
                       'public.journey_plans'::regclass, 'public.programs'::regclass)
      and polname like '%\_module\_enabled'
      and not polpermissive and polcmd = 'r'),
  5,
  'all five content tables carry a RESTRICTIVE select *_module_enabled policy'
);

select is(private.space_function_enabled(null, 'events'), true, 'a null space_id stays visible');

select is(
  has_function_privilege('anon', 'private.space_function_enabled(uuid,text)', 'execute'),
  true,
  'anon holds execute (an RLS policy runs as the invoking role)'
);

-- Behaviour against real rows: build throwaway spaces inside the transaction.
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility, entitlements)
select gen_random_uuid(), 'mod-rls-' || n, 'Module RLS ' || n, 'business',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network', e
from (values
  (1, '{}'::jsonb),
  (2, '{"events": false}'::jsonb),
  (3, '{"events": true}'::jsonb),
  (4, '{"events": "no"}'::jsonb),
  (5, '{"billing": {"events": false}}'::jsonb)
) as t(n, e);

select is(private.space_function_enabled((select id from public.spaces where slug = 'mod-rls-1'), 'events'), true,
  'empty entitlements: every function ON');
select is(private.space_function_enabled((select id from public.spaces where slug = 'mod-rls-2'), 'events'), false,
  'explicit false turns the function OFF');
select is(private.space_function_enabled((select id from public.spaces where slug = 'mod-rls-2'), 'circles'), true,
  'other functions on the same Space stay ON');
select is(private.space_function_enabled((select id from public.spaces where slug = 'mod-rls-3'), 'events'), true,
  'explicit true is ON');
select is(private.space_function_enabled((select id from public.spaces where slug = 'mod-rls-4'), 'events'), true,
  'a non-boolean value never hides content');
select is(private.space_function_enabled((select id from public.spaces where slug = 'mod-rls-5'), 'events'), true,
  'the reserved billing object is not a switch');

select matches(
  pg_get_functiondef('private.space_function_enabled(uuid,text)'::regprocedure),
  'p_space_id is null',
  'unpartitioned rows stay visible'
);

select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.events'::regclass and polname = 'events_module_enabled'
      and pg_get_expr(polqual, polrelid) like '%can_write_space_content%'),
  1,
  'the Space''s own writers still see a disabled module (can_write_space_content arm)'
);

select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.programs'::regclass and polname = 'programs_module_enabled'
      and pg_get_expr(polqual, polrelid) like '%''program''%'),
  1,
  'programs is keyed by the program function'
);

select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.journey_plans'::regclass and polname = 'journey_plans_module_enabled'
      and pg_get_expr(polqual, polrelid) like '%''journeys''%'),
  1,
  'journey_plans is keyed by the journeys function'
);

select * from finish();
rollback;
