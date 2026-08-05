-- pgTAP structural guard for Phase F (migration 20261004000000): each consolidated cluster must
-- collapse to EXACTLY ONE permissive policy per (table, command), and the RESTRICTIVE policy that
-- AND-combines on events UPDATE must be left intact. Merging permissive policies with OR is
-- semantically identical (permissive policies already combine with OR), so this guards that the
-- consolidation landed and never silently regrows a second overlapping permissive policy.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.
--
-- Two clusters left this guard when their tables were dropped in
-- 20270212000000_retire_growth_engine3_intakes.sql: `applications` and `waitlist_entries`, the
-- Growth OS Engine 3 intakes (ADR-940). Their assertions are removed rather than relaxed --
-- `_perm_count` on a missing table returns 0, so leaving them would have asserted "exactly one
-- policy" against a table that cannot have any, which is a failure that says nothing. A dropped
-- table has no policy surface to guard, and the plan count drops with it.

begin;
select plan(8);

create or replace function _perm_count(_table text, _cmd text) returns bigint language sql as $$
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = _table and cmd = _cmd and permissive = 'PERMISSIVE';
$$;

select is(_perm_count('post_reactions', 'SELECT'), 1::bigint, 'post_reactions: one permissive SELECT policy');
select is(_perm_count('post_reactions', 'INSERT'), 1::bigint, 'post_reactions: one permissive INSERT policy');
select is(_perm_count('post_reactions', 'DELETE'), 1::bigint, 'post_reactions: one permissive DELETE policy');
select is(_perm_count('posts', 'SELECT'), 1::bigint, 'posts: one permissive SELECT policy (crew+/space-update/public folded)');
select is(_perm_count('posts', 'INSERT'), 1::bigint, 'posts: one permissive INSERT policy');
select is(_perm_count('events', 'UPDATE'), 1::bigint, 'events: one permissive UPDATE policy');
select is(_perm_count('user_achievements', 'SELECT'), 1::bigint, 'user_achievements: one permissive SELECT policy');

-- The RESTRICTIVE events UPDATE policy (AND-combined, space-write gate) must survive the merge.
select is(
  (select count(*) from pg_policies
    where schemaname='public' and tablename='events' and cmd='UPDATE' and permissive='RESTRICTIVE'),
  1::bigint,
  'events: the RESTRICTIVE space-writable UPDATE policy is preserved'
);

select * from finish();
rollback;
