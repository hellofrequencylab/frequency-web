-- pgTAP guard for the Frequency Hunts tenant wall (FH-008).
-- Every hunts / hunt_* table is service-role only: RLS on, no policy, no grant to a browser role.
-- The checks discover the tables by name, so a Hunt table added later (the outbox, editions) is held
-- to the same wall the day it lands; a migration that forgets the revoke fails here.
-- The role-by-role rules (owner, staff, partner, player, anonymous, revocation) live in the pure
-- decision function lib/hunts/authz.ts and its test; this file proves nothing browser-side can
-- bypass them by reading the tables directly.
begin;
select plan(8);

create temp table fh008_tables as
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and (c.relname = 'hunts' or c.relname like 'hunt\_%');

select cmp_ok((select count(*)::int from fh008_tables), '>=', 16, 'all sixteen Hunt tables are present');

select is((select count(*)::int from fh008_tables where not relrowsecurity), 0,
  'row level security is on for every Hunt table');

select is((select count(*)::int from pg_policies where schemaname = 'public'
    and (tablename = 'hunts' or tablename like 'hunt\_%')), 0,
  'no Hunt table carries a policy, so no browser role can be let in by one');

select is((select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and (table_name = 'hunts' or table_name like 'hunt\_%')
      and grantee in ('anon', 'authenticated', 'PUBLIC')), 0,
  'anon, authenticated and PUBLIC hold no table grant on any Hunt table');

select is((select count(*)::int from information_schema.role_column_grants
    where table_schema = 'public' and (table_name = 'hunts' or table_name like 'hunt\_%')
      and grantee in ('anon', 'authenticated', 'PUBLIC')), 0,
  'and no column grant either');

select is((select count(*)::int from fh008_tables t
    where not has_table_privilege('service_role', t.oid, 'select')), 0,
  'the service role can still read every Hunt table, where the server-side gate runs');

set local role anon;
select throws_ok($$ select count(*) from public.hunt_runs $$, '42501', null,
  'an anonymous request cannot read the run table directly');
reset role;

set local role authenticated;
select throws_ok($$ select count(*) from public.hunt_claims $$, '42501', null,
  'a signed-in member cannot read the claims table directly, including their own');
reset role;

select * from finish();
rollback;
