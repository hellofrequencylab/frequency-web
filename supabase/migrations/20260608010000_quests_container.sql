-- =====================================================================
-- Quests container — The Quest → Seasonal Quest → Journeys → Practices
-- (ADR-152, Phase B1). A "Quest" is a season's official, free container of
-- Journeys; a Journey (journey_plans) is a set of practices. Official Journeys
-- nest under a Quest via journey_plans.quest_id; quest_id NULL = a member-built
-- Journey in the open library. No paywall (everything free; ADR-150/152).
--
-- Authz: public read on quests (like journey_plans public read); writes go
-- through the service-role admin client behind app-code authz. No surface change
-- in this migration — it lands the schema + seeds the season's official Journeys.
-- =====================================================================

-- 1. The Seasonal Quest container ------------------------------------------
create table if not exists public.quests (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,
  season      integer,                                   -- season_number; null = evergreen
  name        text        not null,
  description text,
  emoji       text,
  accent      text,
  sort_order  integer     not null default 0,
  status      text        not null default 'active',     -- active | archived
  is_demo     boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists quests_season_idx on public.quests (season, sort_order);

-- 2. Nest Journeys under a Quest -------------------------------------------
alter table public.journey_plans
  add column if not exists quest_id uuid references public.quests(id) on delete set null,
  add column if not exists official boolean not null default false;
create index if not exists journey_plans_quest_idx on public.journey_plans (quest_id);

-- 3. RLS — public read (writes are service-role only) ----------------------
alter table public.quests enable row level security;
do $$ begin
  create policy "quests: public read" on public.quests for select using (true);
exception when duplicate_object then null; end $$;

-- 4. Seed: this season's Quest + one official Journey per Pillar, each filled
--    with up to 3 of that Pillar's public practices. Deterministic slugs make
--    it idempotent; re-curatable later in the Studio. -----------------------
do $$
declare
  v_season  int;
  v_suffix  text;
  v_quest_id uuid;
  d         record;
  v_plan_id uuid;
  v_accent  text;
begin
  select season_number into v_season from public.seasons where status = 'active' limit 1;
  v_suffix := coalesce(v_season::text, 'evergreen');

  insert into public.quests (slug, season, name, description, emoji, accent, sort_order)
  values ('season-quest-' || v_suffix, v_season, 'Seasonal Quest',
          'This season''s official Journeys — one for each Pillar.', '🧭', 'jade', 0)
  on conflict (slug) do nothing;
  select id into v_quest_id from public.quests where slug = 'season-quest-' || v_suffix;

  for d in select id, slug, name, accent from public.domains where is_active order by display_order loop
    v_accent := case d.slug
      when 'mind'       then 'indigo'
      when 'body'       then 'jade'
      when 'spirit'     then 'plum'
      when 'expression' then 'gold'
      else coalesce(d.accent, 'jade') end;

    insert into public.journey_plans (slug, title, summary, visibility, official, quest_id, accent, published_at)
    values ('quest-' || v_suffix || '-' || d.slug, d.name,
            'The season''s official ' || d.name || ' Journey.',
            'public', true, v_quest_id, v_accent, now())
    on conflict (slug) do nothing;
    select id into v_plan_id from public.journey_plans where slug = 'quest-' || v_suffix || '-' || d.slug;

    insert into public.journey_plan_items (plan_id, practice_id, domain_id, sort_order)
    select v_plan_id, p.id, d.id, p.rn
    from (
      select id, row_number() over (order by created_at) as rn
      from public.practices
      where domain_id = d.id and is_public = true
      order by created_at
      limit 3
    ) p
    on conflict (plan_id, practice_id) do nothing;
  end loop;
end $$;
