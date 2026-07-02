-- pgTAP guard for the Phase-F follow-up (migration 20261007000000): the last 2
-- multiple_permissive_policies findings are cleared and must not regrow.
--   space_subscription_items SELECT -> one merged permissive policy.
--   dispatch_likes -> the ALL "manage own" policy was split into own INSERT/UPDATE/DELETE,
--     leaving exactly one permissive policy per action (SELECT stays the read-true policy).
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(5);

create or replace function _pcount(_t text, _c text) returns bigint language sql as $$
  select count(*) from pg_policies
   where schemaname='public' and tablename=_t and cmd=_c and permissive='PERMISSIVE';
$$;

select is(_pcount('space_subscription_items','SELECT'), 1::bigint, 'space_subscription_items: one permissive SELECT policy');
select is(_pcount('dispatch_likes','SELECT'), 1::bigint, 'dispatch_likes: one permissive SELECT policy (read-true)');
select is(_pcount('dispatch_likes','INSERT'), 1::bigint, 'dispatch_likes: one permissive INSERT policy (own)');
select is(_pcount('dispatch_likes','UPDATE'), 1::bigint, 'dispatch_likes: one permissive UPDATE policy (own)');
select is(_pcount('dispatch_likes','DELETE'), 1::bigint, 'dispatch_likes: one permissive DELETE policy (own)');

select * from finish();
rollback;
