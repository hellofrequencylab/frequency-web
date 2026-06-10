-- =============================================================================
-- Naming Canon 2026 — Wave 2 (3/5): season ranks
--   runner → echo · operative → signal · agent → beacon
-- Canon: docs/NAMING.md · Plan: docs/naming/PLAN.md §Wave 2 · ADR-208
--
-- WHY: the locked rank ladder is Ghost → Echo → Signal → Beacon → Conduit → Luminary
-- (NAMING.md §The Quest). Three of the six values still carry retired names
-- (Runner / Operative / Agent). Thresholds are UNCHANGED (0/100/300/750/1500/3000);
-- Luminary stays manually double-gated. This is a value rename only — no rank moves,
-- no threshold moves, no economy value moves.
--
-- DESIGN — two coupled halves, ORDER IS LOAD-BEARING:
--   1. `ALTER TYPE season_rank_enum RENAME VALUE` (×3). RENAME VALUE preserves enum
--      DECLARATION ORDER, which is the contract lifetime_rank relies on via
--      GREATEST()/max() (20260608060000) and lib/season-ranks.ts RANK_ORDER mirrors.
--      Never drop/recreate the type. Each rename is guarded (only fires if the old
--      label still exists) so re-runs are no-ops. `lifetime_rank` shares this enum and
--      is carried automatically.
--   2. Every LIVE function whose body EMBEDS rank text as enum literals must be
--      re-issued with the new text — after the rename, a stored body containing
--      'runner'/'operative'/'agent'::season_rank_enum would fail to re-parse (the
--      label no longer exists). Each is recreated from its NEWEST generation, with
--      ONLY the three labels swapped and everything else byte-identical:
--        • after_zap_transaction()   ← 20260608060000_lifetime_rank.sql (newest)
--        • after_crew_completion()   ← 20240118000000_gamification.sql  (newest)
--        • reset_season()            ← 20260610000000_circle_field.sql  (newest)
--        • community_library()       ← 20260605120000_community_library.sql (newest)
--   The rank-based 5:1 → 1.5:1 Zap→Gem ladder in reset_season() is kept EXACTLY
--   (Ghost/Echo 5:1 · Signal 4:1 · Beacon 3:1 · Conduit 2:1 · Luminary 1.5:1) — only
--   the rank LABELS in the CASE change, never the rates. See ZAP_TO_GEM_RATES note.
--
-- 3. Seeded data UPDATEs (the enum rename does NOT touch text/jsonb columns):
--      achievements: slugs rank-runner/-operative/-agent, names "Runner/Operative/
--      Agent Unlocked", descriptions, and criteria jsonb {"rank":"agent"} etc. all
--      flip to echo/signal/beacon. season_challenges 'reach-conduit' is UNAFFECTED
--      (conduit unchanged). No retired rank text remains in any seed row.
--
-- RLS: none touched (no policy references rank values).
-- NOTE: lib/database.types.ts must be regenerated after apply (enum labels change).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rename the three enum values in place (order preserved). Idempotent: each
--    only fires while the retired label still exists.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'season_rank_enum' AND e.enumlabel = 'runner') THEN
    ALTER TYPE season_rank_enum RENAME VALUE 'runner' TO 'echo';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'season_rank_enum' AND e.enumlabel = 'operative') THEN
    ALTER TYPE season_rank_enum RENAME VALUE 'operative' TO 'signal';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'season_rank_enum' AND e.enumlabel = 'agent') THEN
    ALTER TYPE season_rank_enum RENAME VALUE 'agent' TO 'beacon';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2a. after_zap_transaction() — recreated from 20260608060000_lifetime_rank.sql
--     (newest gen). Auto-advance thresholds unchanged; only rank LABELS renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION after_zap_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.amount,
      lifetime_zaps       = lifetime_zaps + NEW.amount
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps INTO new_zaps;

  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('beacon', 'conduit', 'luminary')
         THEN 'beacon'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('signal', 'beacon', 'conduit', 'luminary')
         THEN 'signal'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('echo', 'signal', 'beacon', 'conduit', 'luminary')
         THEN 'echo'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  -- Lock the lifetime peak (monotonic — GREATEST never lowers it).
  UPDATE profiles
  SET lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2b. after_crew_completion() — recreated from 20240118000000_gamification.sql
--     (newest gen). Thresholds unchanged; only rank LABELS renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION after_crew_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps     integer;
  new_lifetime integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.zaps_earned,
      lifetime_zaps       = lifetime_zaps + NEW.zaps_earned
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps, lifetime_zaps INTO new_zaps, new_lifetime;

  -- Auto-advance rank up to conduit; luminary is manually assigned
  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('beacon', 'conduit', 'luminary')
         THEN 'beacon'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('signal', 'beacon', 'conduit', 'luminary')
         THEN 'signal'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('echo', 'signal', 'beacon', 'conduit', 'luminary')
         THEN 'echo'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2c. reset_season() — recreated from 20260610000000_circle_field.sql (newest gen).
--     The rank-based Zap→Gem ladder is kept EXACTLY (only rank labels renamed):
--
--     ZAP_TO_GEM_RATES (PROVISIONAL — pending economy tuning; expected to change;
--     do NOT build logic assuming any fixed Zap:Gem relationship. NAMING.md §Economy.
--     The single named config lives in lib/economy in Wave 3 and must mirror these):
--       Ghost  / Echo  → 5.0 : 1   (1.0/5.0)
--       Signal         → 4.0 : 1   (1.0/4.0)
--       Beacon         → 3.0 : 1   (1.0/3.0)
--       Conduit        → 2.0 : 1   (1.0/2.0)
--       Luminary       → 1.5 : 1   (1.0/1.5)
--     The circles.current_season_field zeroing and all other behavior are verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  active_season_num integer;
  r RECORD;
  conversion_rate numeric;
  converted integer;
  challenges_done integer;
begin
  select season_number into active_season_num from seasons where status = 'active' limit 1;
  if active_season_num is null then
    select coalesce(max(season), 0) + 1 into active_season_num from season_trophies;
  end if;

  for r in
    select id, current_season_rank, current_season_zaps, season_challenges_complete
    from profiles
    where current_season_zaps > 0
  loop
    -- ZAP_TO_GEM_RATES (provisional — see header). Rates unchanged; labels renamed.
    conversion_rate := case r.current_season_rank::text
      when 'luminary' then 1.0 / 1.5
      when 'conduit'  then 1.0 / 2.0
      when 'beacon'   then 1.0 / 3.0
      when 'signal'   then 1.0 / 4.0
      else                 1.0 / 5.0   -- ghost / echo
    end;

    converted := floor(r.current_season_zaps * conversion_rate);

    select count(*) into challenges_done
    from challenge_progress
    where profile_id = r.id and completed_at is not null;

    insert into season_trophies (profile_id, season, final_rank, final_zaps, gems_converted, challenges_completed)
    values (r.id, active_season_num, r.current_season_rank::text, r.current_season_zaps, converted, challenges_done)
    on conflict (profile_id, season) do nothing;

    if converted > 0 then
      insert into gem_transactions (profile_id, action_type, amount, metadata)
      values (r.id, 'season_convert', converted,
        jsonb_build_object('season', active_season_num, 'rank', r.current_season_rank::text, 'zaps', r.current_season_zaps));
    end if;
  end loop;

  -- Lock the lifetime peak before wiping the season (covers manual Luminary).
  update profiles
  set lifetime_rank = GREATEST(lifetime_rank, current_season_rank)
  where true;

  update profiles
  set current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      current_season_gems        = 0,
      season_challenges_complete = false
  where true;

  -- Circle Field is a per-season collective standing — zero it with the season
  -- (the circle_field_transactions ledger is permanent history and stays).
  update circles
  set current_season_field = 0
  where true;

  update streaks
  set current_count    = 0,
      last_activity_at = null,
      updated_at       = now()
  where true;

  delete from challenge_progress;

  -- Close the active season and open the next.
  update seasons set status = 'ended', ends_at = coalesce(ends_at, now())
  where status = 'active';
  insert into seasons (season_number, name, status, starts_at)
  values (active_season_num + 1, 'Season ' || (active_season_num + 1), 'active', now())
  on conflict (season_number) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2d. community_library() — recreated from 20260605120000_community_library.sql
--     (newest gen). Only the endorser-rank CASE labels change; ordinals (1..6) and
--     all scoring stay identical. (`_pillar`/`pillar` here are content text columns,
--     unrelated to the domains→pillars table rename.)
-- ---------------------------------------------------------------------------
create or replace function public.community_library(
  _type   text default null,   -- 'practice' | 'program' | 'journey' | null (all)
  _pillar text default null,
  _limit  int  default 80
)
returns table (
  content_type text, id uuid, slug text, title text, summary text, pillar text,
  author_id uuid, cover_image text, created_at timestamptz,
  adoptions int, completions int, ratings int, score numeric
)
language sql stable security definer set search_path = public
as $$
  with rows as (
    select 'practice'::text as content_type, p.id, p.id::text as slug, p.title,
           p.description as summary, null::text as pillar, p.created_by as author_id,
           null::text as cover_image, p.created_at, p.reviewed_by,
           (select count(*) from member_practices mp where mp.practice_id = p.id and mp.active)::int as adoptions,
           (select count(*) from practice_logs pl where pl.practice_id = p.id)::int as completions
    from practices p
    where p.status = 'approved' and p.is_public
    union all
    select 'program', pr.id, pr.slug, pr.title, pr.summary, pr.pillar, pr.author_id,
           pr.cover_image, pr.created_at, pr.reviewed_by,
           pr.adopt_count::int,
           (select count(*) from program_adoptions pa where pa.program_id = pr.id)::int
    from programs pr
    where pr.status = 'approved'
    union all
    select 'journey', jp.id, jp.slug, jp.title, jp.summary, null, jp.author_id,
           jp.cover_image, jp.created_at, jp.reviewed_by,
           jp.adopt_count::int,
           (select count(*) from journey_plan_adoptions ja where ja.plan_id = jp.id and ja.active)::int
    from journey_plans jp
    where jp.status = 'approved' and jp.visibility = 'public'
  ),
  scored as (
    select r.content_type, r.id, r.slug, r.title, r.summary, r.pillar, r.author_id,
           r.cover_image, r.created_at, r.adoptions, r.completions,
           (select count(*) from content_ratings cr where cr.content_type = r.content_type and cr.content_id = r.id)::int as ratings,
           -- endorser rank order (1=ghost … 6=luminary), 0 if unreviewed
           case rv.current_season_rank
             when 'luminary' then 6 when 'conduit' then 5 when 'beacon' then 4
             when 'signal' then 3 when 'echo' then 2 when 'ghost' then 1 else 0
           end as endorser_order
    from rows r
    left join profiles rv on rv.id = r.reviewed_by
  )
  select content_type, id, slug, title, summary, pillar, author_id, cover_image, created_at,
         adoptions, completions, ratings,
         round(
           3.0 * adoptions
         + 2.0 * completions
         + 4.0 * ratings
         + greatest(0, 14 - (extract(epoch from (now() - created_at)) / 86400.0)) * 0.7  -- recency, 0–~10
         + endorser_order * 0.8                                                           -- endorser rank, 0–~5
         , 2) as score
  from scored
  where (_type is null or content_type = _type)
    and (_pillar is null or pillar = _pillar)
  order by score desc, created_at desc
  limit greatest(1, least(coalesce(_limit, 80), 200));
$$;

revoke all on function public.community_library(text, text, int) from public, anon;
grant execute on function public.community_library(text, text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Seeded achievements — flip slugs, names, descriptions, and criteria jsonb
--    off the retired rank text (20240118000000_gamification.sql seed). Guarded by
--    the old slug so re-runs are no-ops. season_challenges 'reach-conduit' is
--    intentionally untouched (conduit unchanged).
-- ---------------------------------------------------------------------------
UPDATE public.achievements
   SET slug        = 'rank-echo',
       name        = 'Echo Unlocked',
       description = 'Reach Echo rank',
       criteria    = '{"type":"rank_reached","rank":"echo"}'
 WHERE slug = 'rank-runner';

UPDATE public.achievements
   SET slug        = 'rank-signal',
       name        = 'Signal Unlocked',
       description = 'Reach Signal rank',
       criteria    = '{"type":"rank_reached","rank":"signal"}'
 WHERE slug = 'rank-operative';

UPDATE public.achievements
   SET slug        = 'rank-beacon',
       name        = 'Beacon Unlocked',
       description = 'Reach Beacon rank',
       criteria    = '{"type":"rank_reached","rank":"beacon"}'
 WHERE slug = 'rank-agent';
