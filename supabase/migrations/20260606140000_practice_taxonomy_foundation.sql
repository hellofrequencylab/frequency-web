-- =====================================================================
-- Practice library: taxonomy + ranking foundation (Phase 1)
-- =====================================================================
-- The library is becoming a large, open, creator-driven surface. This migration
-- lays the structural foundation so practices can be organized deeply and surfaced
-- by popularity — WITHOUT any economy change (creator rewards are a later phase,
-- see ADR-111 "Future").
--
-- Four layers under each Pillar (domains: Mind/Body/Spirit/Expression):
--   1. Sub-category   — a curated, extensible tier scoped to a Pillar (one primary
--                       per practice). Authors and (later) Vera place practices here.
--   2. Tags           — HYBRID model: a vocabulary table (canonical curated tags +
--                       member-proposed folksonomy) joined many-to-many to practices,
--                       each attachment carrying a `source` (author | member | vera).
--   3. Embedding      — a 384-d vector column + HNSW index + match_practices(), mirroring
--                       room_messages. Populated by Vera in Phase 2 (no-op until then);
--                       powers "similar practices", dedupe, and auto-suggested taxonomy.
--   4. Popularity     — a server-only `practices_ranked` view (adopters + recent logs →
--                       score) so the library can sort Trending / Top / New.
--
-- Authz mirrors the rest of practices/*: public read on library taxonomy; writes go
-- through the service-role admin client behind app-code authz. The ranking view is
-- security_invoker and read only by the service-role client (which bypasses RLS to
-- aggregate the personal log tables) — not granted to anon/authenticated.
-- =====================================================================

BEGIN;

-- 1. Sub-categories ---------------------------------------------------------
create table if not exists practice_subcategories (
  id            uuid primary key default gen_random_uuid(),
  domain_id     uuid not null references domains(id) on delete cascade,
  slug          text not null unique,
  name          text not null,
  description   text,
  display_order int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists practice_subcategories_domain_idx
  on practice_subcategories (domain_id, display_order);

alter table practices
  add column if not exists subcategory_id uuid
    references practice_subcategories(id) on delete set null;
create index if not exists practices_subcategory_idx on practices (subcategory_id);

-- 2. Tags (hybrid: canonical registry + member folksonomy) ------------------
create table if not exists practice_tag_defs (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,                 -- normalized key
  label        text not null,                        -- display label
  is_canonical boolean not null default false,       -- curated vs member-proposed
  domain_id    uuid references domains(id) on delete set null,  -- optional Pillar hint
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists practice_tags (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  tag_id      uuid not null references practice_tag_defs(id) on delete cascade,
  source      text not null default 'author',        -- 'author' | 'member' | 'vera'
  assigned_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (practice_id, tag_id)
);
create index if not exists practice_tags_practice_idx on practice_tags (practice_id);
create index if not exists practice_tags_tag_idx      on practice_tags (tag_id);

-- 3. Embeddings infra (Phase 2 populates via Vera) --------------------------
--    Mirrors 20260606120000_room_message_embeddings.sql (gte-small, 384-d, HNSW).
create extension if not exists vector;
alter table practices add column if not exists embedding vector(384);
create index if not exists practices_embedding_idx
  on practices using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Nearest public practices to a query embedding (similar / dedupe / auto-suggest).
create or replace function public.match_practices(
  query_embedding vector(384),
  match_count int default 8,
  exclude_id uuid default null
) returns table (id uuid, title text, similarity float)
language sql stable security definer set search_path = public as $$
  select p.id, p.title, 1 - (p.embedding <=> query_embedding) as similarity
  from public.practices p
  where p.embedding is not null
    and p.is_public = true
    and (exclude_id is null or p.id <> exclude_id)
  order by p.embedding <=> query_embedding
  limit greatest(1, least(match_count, 30))
$$;
revoke all on function public.match_practices(vector, int, uuid) from public, anon;
grant execute on function public.match_practices(vector, int, uuid) to authenticated, service_role;

-- 4. Popularity ranking view (server-only) ----------------------------------
--    Library is small; a view is always-fresh and cheap. security_invoker so it
--    runs as the querying role — the service-role client bypasses RLS to see all
--    logs; anon/authenticated are never granted access.
create or replace view practices_ranked
  with (security_invoker = true) as
select
  p.*,
  coalesce(a.adopters, 0)   as adopters,
  coalesce(l.logs_30d, 0)   as logs_30d,
  coalesce(l.logs_total, 0) as logs_total,
  -- Trending score: recent usage weighted highest, then reach, then all-time use.
  (coalesce(l.logs_30d, 0) * 3
   + coalesce(a.adopters, 0) * 2
   + coalesce(l.logs_total, 0)) as score
from practices p
left join (
  select practice_id, count(*) as adopters
  from member_practices where active = true
  group by practice_id
) a on a.practice_id = p.id
left join (
  select practice_id,
         count(*) filter (where logged_for >= current_date - 30) as logs_30d,
         count(*) as logs_total
  from practice_logs
  group by practice_id
) l on l.practice_id = p.id;

revoke all on practices_ranked from anon, authenticated;
grant select on practices_ranked to service_role;

-- RLS on the new tables (public read; writes via service role) ---------------
alter table practice_subcategories enable row level security;
alter table practice_tag_defs      enable row level security;
alter table practice_tags          enable row level security;
create policy "practice_subcategories: public read" on practice_subcategories for select using (true);
create policy "practice_tag_defs: public read"      on practice_tag_defs      for select using (true);
create policy "practice_tags: public read"          on practice_tags          for select using (true);

-- 5. Seed sub-categories per Pillar -----------------------------------------
insert into practice_subcategories (domain_id, slug, name, display_order)
select d.id, s.slug, s.name, s.display_order
from domains d
join (values
  ('mind','mind-focus','Focus',1),
  ('mind','mind-learning','Learning',2),
  ('mind','mind-planning','Planning & Reflection',3),
  ('mind','mind-relating','Relating',4),
  ('mind','mind-purpose','Purpose',5),
  ('body','body-cardio','Cardio',1),
  ('body','body-strength','Strength',2),
  ('body','body-mobility','Mobility',3),
  ('body','body-recovery','Recovery & Sleep',4),
  ('body','body-nutrition','Nutrition',5),
  ('body','body-coldheat','Cold & Heat',6),
  ('spirit','spirit-meditation','Meditation',1),
  ('spirit','spirit-breathwork','Breathwork',2),
  ('spirit','spirit-gratitude','Gratitude',3),
  ('spirit','spirit-nature','Nature',4),
  ('spirit','spirit-ritual','Ritual',5),
  ('expression','expr-writing','Writing',1),
  ('expression','expr-visual','Visual',2),
  ('expression','expr-music','Music & Sound',3),
  ('expression','expr-dance','Dance & Movement',4),
  ('expression','expr-making','Making',5)
) as s(domain_slug, slug, name, display_order) on s.domain_slug = d.slug
on conflict (slug) do nothing;

-- 6. Backfill the existing library to sub-categories (within each Pillar) -----
update practices p set subcategory_id = sc.id
from practice_subcategories sc
where p.subcategory_id is null and sc.slug = (case p.title
  -- Mind
  when 'Deep work block'          then 'mind-focus'
  when 'Digital sunset'           then 'mind-focus'
  when 'Read ten pages'           then 'mind-learning'
  when 'Plan tomorrow tonight'    then 'mind-planning'
  when 'Appreciate someone'       then 'mind-relating'
  when 'Call a loved one'         then 'mind-relating'
  when 'Listen fully'             then 'mind-relating'
  when 'Reach out to one person'  then 'mind-relating'
  -- Body
  when 'Morning movement'         then 'body-mobility'
  when 'Mobility flow'            then 'body-mobility'
  when 'Daily run'                then 'body-cardio'
  when 'Daily walk'               then 'body-cardio'
  when 'Dawn patrol surf'         then 'body-cardio'
  when 'Strength session'         then 'body-strength'
  when 'Cold exposure'            then 'body-coldheat'
  when 'Cold plunge'              then 'body-coldheat'
  -- Spirit
  when 'Daily meditation'         then 'spirit-meditation'
  when 'Morning sit'              then 'spirit-meditation'
  when 'Sound bath sit'           then 'spirit-meditation'
  when 'Breathwork'               then 'spirit-breathwork'
  when 'Breathwork reset'         then 'spirit-breathwork'
  when 'Gratitude journaling'     then 'spirit-gratitude'
  when 'Gratitude journal'        then 'spirit-gratitude'
  when 'Phone-free meal'          then 'spirit-ritual'
  when 'Evening reflection'       then 'spirit-ritual'
  -- Expression
  when 'Daily sketch'             then 'expr-visual'
  when 'One photo a day'          then 'expr-visual'
  when '250 words'                then 'expr-writing'
  when 'Voice journal'            then 'expr-writing'
  when 'Make music'               then 'expr-music'
  when 'Dance one song'           then 'expr-dance'
  -- (Time in nature has no Body sub-category yet; left uncategorized.)
end);

-- 7. Seed canonical tag vocabulary, then attach a starter set ----------------
insert into practice_tag_defs (slug, label, is_canonical) values
  ('morning','Morning',true),
  ('evening','Evening',true),
  ('quick','Quick (≤5 min)',true),
  ('outdoor','Outdoor',true),
  ('social','Social',true),
  ('solo','Solo',true),
  ('no-equipment','No equipment',true),
  ('beginner','Beginner-friendly',true),
  ('calming','Calming',true),
  ('energizing','Energizing',true)
on conflict (slug) do nothing;

insert into practice_tags (practice_id, tag_id, source)
select p.id, t.id, 'author'
from (values
  ('Dawn patrol surf','outdoor'), ('Daily run','outdoor'), ('Daily walk','outdoor'), ('Time in nature','outdoor'),
  ('Morning movement','morning'), ('Morning sit','morning'), ('Dawn patrol surf','morning'), ('Daily meditation','morning'),
  ('Digital sunset','evening'), ('Evening reflection','evening'), ('Plan tomorrow tonight','evening'),
  ('Appreciate someone','social'), ('Call a loved one','social'), ('Listen fully','social'), ('Phone-free meal','social'),
  ('Breathwork','quick'), ('Breathwork reset','quick'), ('Mobility flow','quick'), ('Make music','quick'), ('Daily sketch','quick'), ('250 words','quick'),
  ('Breathwork','calming'), ('Sound bath sit','calming'), ('Morning sit','calming'), ('Time in nature','calming'), ('Evening reflection','calming'),
  ('Cold exposure','energizing'), ('Cold plunge','energizing'), ('Daily run','energizing'), ('Dance one song','energizing'), ('Dawn patrol surf','energizing')
) as m(title, tag_slug)
join practices p          on p.title = m.title
join practice_tag_defs t  on t.slug  = m.tag_slug
on conflict (practice_id, tag_id) do nothing;

COMMIT;
