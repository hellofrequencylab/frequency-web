-- =============================================================================
-- Naming Canon 2026 — Wave 2 (1/5): domains → pillars
-- Canon: docs/NAMING.md · Plan: docs/naming/PLAN.md §Wave 2 · ADR-208
--
-- WHY: "Pillars" (Mind / Body / Spirit / Expression) is the locked game-taxonomy
-- term; "Domains" is RETIRED (NAMING.md §The Quest). The UI already presents these
-- rows as Pillars (lib/pillars.ts), but the backing table is still `public.domains`
-- and the forum-channel FK is still `topical_channels.domain_id`. This migration
-- closes that gap at the schema level so the schema speaks the canon. Critically,
-- Pillars are NEVER "Channels": the original taxonomy comment framed "Channels = the
-- 4 Domains", conflating the topical-forum feature (Channels) with the game taxonomy
-- (Pillars). That framing is corrected here — Channels live UNDER Pillars; a Pillar
-- is not a Channel.
--
-- DESIGN (data-preserving, in-place, idempotent):
--   * `ALTER TABLE ... RENAME TO` preserves all rows, the PK, every FK that POINTS
--     AT this table (practices.domain_id, journey_plan_items.domain_id,
--     journey_plans.domain_id, practice_subcategories.domain_id, quest_chains.domain_id
--     [engine dropped], etc. — they keep resolving by OID to `pillars` automatically;
--     those COLUMN names stay `domain_id` for now — Wave-3 app reads rename them).
--   * Only ONE column renames in this wave per PLAN.md §Wave 2.1:
--     `topical_channels.domain_id` → `pillar_id` (+ its index).
--   * The newest generation of the only persisted object that EMBEDS the table name
--     as text — the `mkt_interest_demand()` SQL function (20260604030000) — is
--     recreated reading `pillars`. (A `language sql` body re-parses `domains` at call
--     time; a bare table rename would break it. plpgsql/trigger fns and VIEWS track
--     the table by OID and need no recreation.)
--   * Idempotent: every rename is guarded with an information_schema / pg_class check
--     so a re-run is a no-op and never errors.
--
-- RLS: unchanged in substance. The table's existing `"domains: public read"` SELECT
--   policy is recreated under the canon name `"pillars: public read"` (same `using
--   (true)`); grants are re-asserted on the renamed table. `circle_topics` untouched.
--
-- NOT IN SCOPE (Wave 3 app code / later waves): the remaining `domain_id` columns on
--   practices/journeys/subcategories, lib/*.ts identifiers, and regeneration of
--   lib/database.types.ts (required after apply).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Rename the table  public.domains → public.pillars  (rows + PK + inbound FKs
--    all carried automatically). Guarded so re-runs are no-ops.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'domains')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'pillars') THEN
    ALTER TABLE public.domains RENAME TO pillars;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rename the forum-channel FK column + its index to the canon term.
--    topical_channels.domain_id → pillar_id  (FK target is now `pillars`).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'topical_channels'
               AND column_name = 'domain_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'topical_channels'
               AND column_name = 'pillar_id') THEN
    ALTER TABLE public.topical_channels RENAME COLUMN domain_id TO pillar_id;
  END IF;
END $$;

ALTER INDEX IF EXISTS public.idx_topical_channels_domain RENAME TO idx_topical_channels_pillar;

-- ---------------------------------------------------------------------------
-- 3. Re-point the public-read RLS policy + grants at the canon name. The old
--    `"domains: public read"` policy moved with the table under its old name; drop
--    it and re-create under the canon name (identical predicate).
-- ---------------------------------------------------------------------------
ALTER TABLE public.pillars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domains: public read" ON public.pillars;
DROP POLICY IF EXISTS "pillars: public read" ON public.pillars;
CREATE POLICY "pillars: public read" ON public.pillars FOR SELECT USING (true);

GRANT SELECT ON public.pillars TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pillars TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Correct the "Channels = the 4 Domains" framing on the table itself, and
--    recreate the only persisted SQL function whose body embeds `domains` as text
--    (mkt_interest_demand, newest gen 20260604030000) reading `pillars`. Behavior
--    is byte-identical apart from the table name.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.pillars IS
  'The 4 Pillars (Mind / Body / Spirit / Expression) — the top game-taxonomy layer (NAMING.md, ADR-208; was public.domains). Topical Channels sort UNDERNEATH a Pillar via topical_channels.pillar_id. A Pillar is NEVER a Channel: Channels are the topical-forum feature; Pillars are the taxonomy above them.';

-- Renaming the first OUT param (domain→pillar) changes the row type, which
-- CREATE OR REPLACE cannot do — drop then recreate.
drop function if exists public.mkt_interest_demand();
create function public.mkt_interest_demand()
returns table (pillar text, interest text, interest_slug text, tune_ins bigint, circles bigint, members bigint)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(d.name, 'Unsorted'), tc.name, tc.slug,
    (select count(*) from topical_channel_memberships m where m.topical_channel_id = tc.id)::bigint,
    (select count(*) from circles c where c.topical_channel_id = tc.id)::bigint,
    (select coalesce(sum(c.member_count),0) from circles c where c.topical_channel_id = tc.id)::bigint
  from topical_channels tc
  left join pillars d on d.id = tc.pillar_id
  where tc.is_active
  order by 4 desc, 5 desc;
$$;
