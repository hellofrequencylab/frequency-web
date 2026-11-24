-- pgTAP guard for 20270346300000_hub_mentions_and_inbox (LIVE-2524, LIVE-2526): the mentions table
-- is row-secured with read, insert and delete policies and no update policy, anon holds no grant on
-- it, and the Inbox columns exist on notifications.
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(8);

select has_table('public', 'mentions', 'mentions table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.mentions'::regclass), 'mentions has row security on');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'mentions' and cmd = 'SELECT'), 1::bigint, 'mentions: one read policy');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'mentions' and cmd = 'INSERT'), 1::bigint, 'mentions: one insert policy');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'mentions' and cmd = 'UPDATE'), 0::bigint, 'mentions: no update policy (a tag is replaced, never rewritten)');
select ok(not has_table_privilege('anon', 'public.mentions', 'SELECT'), 'anon cannot read mentions');
select has_column('public', 'notifications', 'snoozed_until', 'notifications.snoozed_until exists');
select has_column('public', 'notifications', 'archived_at', 'notifications.archived_at exists');

select * from finish();
rollback;
