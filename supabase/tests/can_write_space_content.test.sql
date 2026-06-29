-- pgTAP regression guard for the can_write_space_content() identity fix
-- (migration 20260902000000). The latent bug compared profiles.id-typed columns
-- (owner_profile_id / space_members.profile_id) to auth.uid() directly — which never
-- matches a real caller, since profiles.id <> auth_user_id. The corrected helper resolves
-- identity via get_my_profile_id() and gates the root/null-space arms to platform staff
-- via get_my_web_role(). This test pins that definition so the bug cannot silently return.
--
-- A definition guard (not a behavioral fixture test) on purpose: it needs no seed graph,
-- runs anywhere `supabase test db` runs, and fails the instant the buggy idiom reappears.
-- A behavioral per-role test (set request.jwt.claims, assert insert/update allowed/denied
-- against a seeded space) is a good follow-up once the tests README's fixture pattern lands.

begin;
select plan(3);

select matches(
  pg_get_functiondef('public.can_write_space_content(uuid)'::regprocedure),
  'get_my_profile_id\(\)',
  'owner + member arms resolve caller identity via get_my_profile_id()'
);

select matches(
  pg_get_functiondef('public.can_write_space_content(uuid)'::regprocedure),
  'get_my_web_role\(\)',
  'root + null-space arms are gated to platform staff via get_my_web_role()'
);

select doesnt_match(
  pg_get_functiondef('public.can_write_space_content(uuid)'::regprocedure),
  '(?i)auth\.uid',
  'helper no longer compares a profile id to auth.uid() directly (the latent bug)'
);

select * from finish();
rollback;
