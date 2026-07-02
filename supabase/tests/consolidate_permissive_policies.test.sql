-- pgTAP structural guard for Phase F (migration 20261004000000): each consolidated cluster must
-- collapse to EXACTLY ONE permissive policy per (table, command), and the RESTRICTIVE policy that
-- AND-combines on events UPDATE must be left intact. Merging permissive policies with OR is
-- semantically identical (permissive policies already combine with OR), so this guards that the
-- consolidation landed and never silently regrows a second overlapping permissive policy.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(10);

create or replace function _perm_count(_table text, _cmd text) returns bigint language sql as $$
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = _table and cmd = _cmd and permissive = 'PERMISSIVE';
$$;

select is(_perm_count('post_reactions', 'SELECT'), 1::bigint, 'post_reactions: one permissive SELECT policy');
select is(_perm_count('post_reactions', 'INSERT'), 1::bigint, 'post_reactions: one permissive INSERT policy');
select is(_perm_count('post_reactions', 'DELETE'), 1::bigint, 'post_reactions: one permissive DELETE policy');
select is(_perm_count('posts', 'SELECT'), 1::bigint, 'posts: one permissive SELECT policy (crew+/space-update/public folded)');
select is(_perm_count('posts', 'INSERT'), 1::bigint, 'posts: one permissive INSERT policy');
select is(_perm_count('applications', 'SELECT'), 1::bigint, 'applications: one permissive SELECT policy');
select is(_perm_count('events', 'UPDATE'), 1::bigint, 'events: one permissive UPDATE policy');
select is(_perm_count('user_achievements', 'SELECT'), 1::bigint, 'user_achievements: one permissive SELECT policy');
select is(_perm_count('waitlist_entries', 'SELECT'), 1::bigint, 'waitlist_entries: one permissive SELECT policy');

-- The RESTRICTIVE events UPDATE policy (AND-combined, space-write gate) must survive the merge.
select is(
  (select count(*) from pg_policies
    where schemaname='public' and tablename='events' and cmd='UPDATE' and permissive='RESTRICTIVE'),
  1::bigint,
  'events: the RESTRICTIVE space-writable UPDATE policy is preserved'
);

select * from finish();
rollback;
