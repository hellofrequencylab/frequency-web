-- pgTAP guard for 20270346460000_hub_item_threads (LIVE-2527, LIVE-2528): item_comments is
-- row-secured with read and insert policies and no update or delete policy, thread_reads holds own
-- rows only, anon holds no grant on either, both thread tables broadcast on insert, and the thread
-- topic check refuses a malformed topic.
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(13);

select has_table('public', 'item_comments', 'item_comments table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.item_comments'::regclass), 'item_comments has row security on');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'item_comments' and cmd = 'SELECT'), 1::bigint, 'item_comments: one read policy');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'item_comments' and cmd = 'INSERT'), 1::bigint, 'item_comments: one insert policy');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'item_comments' and cmd in ('UPDATE', 'DELETE')), 0::bigint, 'item_comments: no update or delete policy (take back through remove_item_comment)');
select ok(not has_table_privilege('anon', 'public.item_comments', 'SELECT'), 'anon cannot read item_comments');

select has_table('public', 'thread_reads', 'thread_reads table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.thread_reads'::regclass), 'thread_reads has row security on');
select ok(not has_table_privilege('anon', 'public.thread_reads', 'SELECT'), 'anon cannot read thread_reads');

select has_trigger('public', 'item_comments', 'trg_broadcast_item_comment', 'an item comment broadcasts on insert');
select has_trigger('public', 'space_plan_comments', 'trg_broadcast_plan_comment', 'a Plan comment broadcasts on insert');
select ok(not private.can_read_thread_topic('member:abc'), 'a non-thread topic is refused');
select ok(not private.can_read_thread_topic('thread:plan:not-a-uuid'), 'a malformed thread topic is refused');

select * from finish();
rollback;
