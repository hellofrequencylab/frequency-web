-- pgTAP guard for 20270346470000_hub_link_previews (LIVE-2530): the cache is row-secured, signed-in
-- members may read it, nobody but the service role may write it, and anon holds no grant.
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(5);

select has_table('public', 'link_previews', 'link_previews table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.link_previews'::regclass), 'link_previews has row security on');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'link_previews' and cmd = 'SELECT'), 1::bigint, 'link_previews: one read policy');
select is((select count(*) from pg_policies where schemaname = 'public' and tablename = 'link_previews' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')), 0::bigint, 'link_previews: no write policy (service role only)');
select ok(not has_table_privilege('anon', 'public.link_previews', 'SELECT'), 'anon cannot read link_previews');

select * from finish();
rollback;
