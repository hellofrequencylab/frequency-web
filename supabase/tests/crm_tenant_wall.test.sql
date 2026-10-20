-- PROG-A4: the CRM app's data wall, per table. The CRM ships as one module (modules/crm) over four
-- route trees; each reads only its tenant's rows, and the database is what makes that true.
--
-- A definition guard, on purpose: it needs no seed graph and fails the moment a CRM table loses RLS,
-- loses its space_id, or gains a read policy that opens every row to anon. The behavioral cross-tenant proof (operator A vs
-- Space B, plain member, anon) is space_tenancy_walls.test.sql, which seeds both Spaces and runs
-- the CRM rows through every seat.
--
-- Enablement note: unlike circles and events (module_enablement_rls.test.sql, PROG-A3), CRM is gated
-- by plan and role in the app (spaceFunctionAccess) and by its operator-only RLS here, not by the
-- default-on module switch, so there is no *_module_enabled policy to pin for it.

begin;
select plan(15);

select is(
  (select relrowsecurity from pg_class where oid = 'public.contacts'::regclass), true,
  'contacts has RLS enabled');
select is(
  (select relrowsecurity from pg_class where oid = 'public.crm_stages'::regclass), true,
  'crm_stages has RLS enabled');
select is(
  (select relrowsecurity from pg_class where oid = 'public.crm_deals'::regclass), true,
  'crm_deals has RLS enabled');
select is(
  (select relrowsecurity from pg_class where oid = 'public.crm_activities'::regclass), true,
  'crm_activities has RLS enabled');
select is(
  (select relrowsecurity from pg_class where oid = 'public.crm_tasks'::regclass), true,
  'crm_tasks has RLS enabled');

select has_column('public', 'contacts', 'space_id', 'contacts is stamped with its owning Space');
select has_column('public', 'crm_stages', 'space_id', 'crm_stages is stamped with its owning Space');
select has_column('public', 'crm_deals', 'space_id', 'crm_deals is stamped with its owning Space');
select has_column('public', 'crm_activities', 'space_id', 'crm_activities is stamped with its owning Space');
select has_column('public', 'crm_tasks', 'space_id', 'crm_tasks is stamped with its owning Space');

select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.contacts'::regclass and polpermissive and polcmd in ('r', '*')
      and (polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'anon') = any (polroles))
      and pg_get_expr(polqual, polrelid) = 'true'),
  0,
  'contacts has no read policy that opens every row to anon');
select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.crm_stages'::regclass and polpermissive and polcmd in ('r', '*')
      and (polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'anon') = any (polroles))
      and pg_get_expr(polqual, polrelid) = 'true'),
  0,
  'crm_stages has no read policy that opens every row to anon');
select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.crm_deals'::regclass and polpermissive and polcmd in ('r', '*')
      and (polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'anon') = any (polroles))
      and pg_get_expr(polqual, polrelid) = 'true'),
  0,
  'crm_deals has no read policy that opens every row to anon');
select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.crm_activities'::regclass and polpermissive and polcmd in ('r', '*')
      and (polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'anon') = any (polroles))
      and pg_get_expr(polqual, polrelid) = 'true'),
  0,
  'crm_activities has no read policy that opens every row to anon');
select is(
  (select count(*)::int from pg_policy
    where polrelid = 'public.crm_tasks'::regclass and polpermissive and polcmd in ('r', '*')
      and (polroles = '{0}'::oid[] or (select oid from pg_roles where rolname = 'anon') = any (polroles))
      and pg_get_expr(polqual, polrelid) = 'true'),
  0,
  'crm_tasks has no read policy that opens every row to anon');

select * from finish();
rollback;
