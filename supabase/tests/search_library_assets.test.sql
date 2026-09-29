-- MOST RELEVANT RANKS MEANING AND WORDS TOGETHER (20270345009600_search_library_assets_hybrid_rank.sql
-- · LIVE-586 · ADR-1597).
--
-- The row's two complaints, proved against the real pg_trgm and pgvector on a fresh apply:
--   * a query that matches a title exactly no longer loses to a vague neighbour whose embedding
--     happens to sit nearest the query: the exact title is found by the full-text, trigram AND
--     vector arms, the neighbour by the vector arm alone, and reciprocal rank fusion says so;
--   * a misspelt query gets meaning AND letters: the trigram arm still finds the title the typo
--     was aiming at, the vector arm agrees, and that row leads.
-- Plus the boundaries the Studio relies on: with no embedding (AI off or over budget) the word arms
-- still rank; archived rows and another Space's rows never appear; the kind filter binds every
-- arm; the function is SECURITY INVOKER and only service_role may execute it.
--
-- One transaction, rolled back: nothing persists. Fixture style follows journey_product.test.sql.
-- Embeddings are 384-d vectors with three meaningful dimensions, built by a pg_temp helper.

begin;
select plan(14);

create function pg_temp.v3(a real, b real, c real) returns vector(384)
language sql immutable as $$ select (array[a, b, c] || array_fill(0::real, array[381]))::vector(384) $$;

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a586-000000000001', 'loom-hybrid@test.local');
delete from public.profiles where auth_user_id = '00000000-0000-4000-a586-000000000001';
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b586-000000000001', '00000000-0000-4000-a586-000000000001', 'Loom Hybrid', 'loom-hybrid', true);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c586-000000000001', 'loom-hybrid-a', 'Loom Hybrid A', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b586-000000000001', 'active', 'network', 'business'),
  ('00000000-0000-4000-c586-000000000002', 'loom-hybrid-b', 'Loom Hybrid B', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b586-000000000001', 'active', 'network', 'business');

-- The query "golden hour" embeds as v3(1,0,0). The vague neighbour sits exactly there; the asset
-- actually titled "Golden hour" sits further off. "sunest" embeds as v3(0.5,0,0.86), where the
-- sunset photo sits.
insert into public.library_assets (id, space_id, kind, title, slug, description, category, status, embedding) values
  ('00000000-0000-4000-e586-00000000000a', '00000000-0000-4000-c586-000000000001', 'image',
   'Golden hour', 'lh-golden-hour', null, 'photo', 'final', pg_temp.v3(0.6, 0.8, 0)),
  ('00000000-0000-4000-e586-00000000000b', '00000000-0000-4000-c586-000000000001', 'image',
   'Warm evening light', 'lh-warm-evening', 'soft glow at dusk', 'photo', 'final', pg_temp.v3(1, 0, 0)),
  ('00000000-0000-4000-e586-00000000000c', '00000000-0000-4000-c586-000000000001', 'image',
   'Sunset over the bay', 'lh-sunset-bay', null, 'photo', 'final', pg_temp.v3(0.5, 0, 0.86)),
  ('00000000-0000-4000-e586-00000000000d', '00000000-0000-4000-c586-000000000001', 'image',
   'Golden hour', 'lh-golden-hour-archived', null, 'photo', 'archived', pg_temp.v3(1, 0, 0)),
  ('00000000-0000-4000-e586-00000000000e', '00000000-0000-4000-c586-000000000002', 'image',
   'Golden hour', 'lh-golden-hour-elsewhere', null, 'photo', 'final', pg_temp.v3(1, 0, 0)),
  ('00000000-0000-4000-e586-00000000000f', '00000000-0000-4000-c586-000000000001', 'icon',
   'Golden hour badge', 'lh-golden-badge', null, 'badge', 'final', null);

-- ── 1. The function exists, runs as its caller, and only the service role may call it ────────
select ok(
  to_regprocedure('public.search_library_assets(uuid, text, vector, text, integer)') is not null,
  'search_library_assets(space, query, embedding, kind, count) exists');

select is(
  (select prosecdef from pg_proc where oid = 'public.search_library_assets(uuid, text, vector, text, integer)'::regprocedure),
  false,
  'it is SECURITY INVOKER, as the row asks'
);

select ok(
  not has_function_privilege('anon', 'public.search_library_assets(uuid, text, vector, text, integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.search_library_assets(uuid, text, vector, text, integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.search_library_assets(uuid, text, vector, text, integer)', 'EXECUTE'),
  'anon and authenticated cannot execute it; service_role can'
);

-- ── 2. An exact title beats the vague neighbour nearest the query embedding ──────────────────
select is(
  (select id from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour',
     pg_temp.v3(1, 0, 0)) limit 1),
  '00000000-0000-4000-e586-00000000000a'::uuid,
  'the asset titled "Golden hour" leads, though another asset sits nearer the query embedding'
);

select is(
  (select vec_rank from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour',
     pg_temp.v3(1, 0, 0)) where id = '00000000-0000-4000-e586-00000000000b'),
  1,
  'the neighbour really is first on meaning alone, so the fusion is what moved it down'
);

select ok(
  (select fts_rank is not null and trgm_rank is not null and vec_rank is not null
     from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour', pg_temp.v3(1, 0, 0))
    where id = '00000000-0000-4000-e586-00000000000a'),
  'the exact title is found by all three arms'
);

-- ── 3. A typo gets letters AND meaning ───────────────────────────────────────────────────────
select is(
  (select id from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'sunest',
     pg_temp.v3(0.5, 0, 0.86)) limit 1),
  '00000000-0000-4000-e586-00000000000c'::uuid,
  'a misspelt "sunest" leads with "Sunset over the bay"'
);

select ok(
  (select trgm_rank is not null and vec_rank is not null and fts_rank is null
     from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'sunest', pg_temp.v3(0.5, 0, 0.86))
    where id = '00000000-0000-4000-e586-00000000000c'),
  'the typo misses full text but the trigram arm and the vector arm both find the sunset'
);

-- ── 4. With no embedding (AI off, over budget) the word arms still rank ──────────────────────
select is(
  (select id from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour') limit 1),
  '00000000-0000-4000-e586-00000000000a'::uuid,
  'with a null embedding the exact title still leads'
);

select is(
  (select count(*)::int from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour')
    where vec_rank is not null),
  0,
  'and no row claims a vector rank'
);

-- ── 5. Scope: live rows, this Space, this kind ───────────────────────────────────────────────
select is(
  (select count(*)::int from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour',
     pg_temp.v3(1, 0, 0))
    where id in ('00000000-0000-4000-e586-00000000000d', '00000000-0000-4000-e586-00000000000e')),
  0,
  'an archived row and another Space''s row never appear'
);

select is(
  (select array_agg(id order by id) from public.search_library_assets('00000000-0000-4000-c586-000000000001',
     'golden hour', pg_temp.v3(1, 0, 0), 'icon')),
  array['00000000-0000-4000-e586-00000000000f'::uuid],
  'the kind filter binds every arm'
);

-- ── 6. Bounds ────────────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.search_library_assets('00000000-0000-4000-c586-000000000001', 'golden hour',
     pg_temp.v3(1, 0, 0), null, 2)),
  2,
  'match_count caps the page'
);

select is(
  (select count(*)::int from public.search_library_assets('00000000-0000-4000-c586-000000000001', '   ')),
  0,
  'a blank query with no embedding returns nothing rather than the whole Loom'
);

select * from finish();
rollback;
