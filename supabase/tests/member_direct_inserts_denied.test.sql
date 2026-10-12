-- SCAN-842: a member cannot insert a Circle membership or a crew completion directly. Every writer
-- runs under the service role, so no permissive INSERT policy may remain for a client role on
-- either table. Read from pg_policies after a fresh apply (the catalog cannot pass by accident).

begin;
select plan(2);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'memberships'
      and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')
      and (roles && array['public', 'anon', 'authenticated']::name[])),
  0,
  'no client role can insert a memberships row directly (SCAN-842)'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'crew_completions'
      and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'ALL')
      and (roles && array['public', 'anon', 'authenticated']::name[])),
  0,
  'no client role can insert a crew_completions row directly (SCAN-842)'
);

select * from finish();
rollback;
