-- =============================================================================
-- Scoped stewardship (P1.4, ADR-218) · docs/ROLES.md §"System 1" + "Data model"
--
-- WHY: a Community role is a stewardship EDGE `(person · role · scope)` and the
-- global level is DERIVED from the highest edge (ROLES.md:36). Today leadership is
-- one FK per scope (`circles.host_id`, `hubs.guide_id`, `nexuses.mentor_id`) and the
-- access matrix reads a single global `profiles.community_role`, so "host of circle A
-- AND guide of hub B" can't be expressed and a global rank lights surfaces everywhere
-- regardless of which scopes it actually leads. This introduces the `stewardships`
-- edge table + a derived `profiles.community_level` cache for fast global gates.
--
-- ADDITIVE / BEHAVIOR-PRESERVING (the P2.1 foundation→flip pattern, BUILD-LIST 2.1):
-- this migration only CREATES the table + cache and POPULATES them from the existing
-- leader FKs. No read path consumes them yet (getViewerHats / load-capabilities /
-- requireScopedManage still read the FK columns + community_role), so behavior is
-- unchanged. `community_level` is floored by the current `community_role`, so no
-- current leader can regress. Reads flip in a later PR (P1.6, the unified resolver).
--
-- HUMAN-REVIEW REPORT (capture at APPLY time — cannot be enumerated from the repo):
-- the exact edges seeded + the resulting community_level distribution MUST be captured
-- at apply time and attached to the P1.4 report:
--   SELECT role, scope_type, count(*) FROM stewardships GROUP BY 1,2 ORDER BY 1,2;
--   SELECT community_level, count(*) FROM profiles GROUP BY 1 ORDER BY 1;
--
-- NOTE: lib/database.types.ts regen required after apply (the new table + column are
-- read via the untyped admin-client cast until then, repo convention — see personas).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. The derived global-level cache on profiles (fast gates; floored by role).
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS community_level text NOT NULL DEFAULT 'member'
    CHECK (community_level IN ('member','crew','host','guide','mentor'));

COMMENT ON COLUMN public.profiles.community_level IS
  'Derived Community trust level (P1.4, ADR-218): the highest stewardship edge a profile holds anywhere, floored by the legacy community_role so no one regresses. Cache for fast global gates; the source of truth is the stewardships table. Kept fresh by trg_stewardships_level + recompute_community_level().';

-- ---------------------------------------------------------------------------
-- 2. stewardships — the scoped edge table `(profile · role · scope)`.
--    `scope_id` is polymorphic (no FK across four parent tables) exactly like
--    events.scope_id / posts.scope_id / channels.scope_id; integrity is enforced
--    by the backfill + the app write path. `text` + CHECK (not a PG enum) per the
--    house style (profile_personas) — dodges the enum-evolution pain documented on
--    the community_role type. `outpost`/`outpost_lead` are present-but-unused
--    forward-compat (P1.5 parked) so no second migration is needed when it lands.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stewardships (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('crew','host','guide','mentor','outpost_lead')),
  scope_type text NOT NULL CHECK (scope_type IN ('circle','hub','nexus','outpost')),
  scope_id   uuid NOT NULL,
  state      text NOT NULL DEFAULT 'active' CHECK (state IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, role, scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS stewardships_profile_idx ON public.stewardships (profile_id);
CREATE INDEX IF NOT EXISTS stewardships_scope_idx   ON public.stewardships (scope_type, scope_id);

COMMENT ON TABLE public.stewardships is
  'Scoped stewardship edges (P1.4, ADR-218): a Community management role (crew/host/guide/mentor/outpost_lead) held at a specific scope (circle/hub/nexus/outpost). The source of truth for who leads what; profiles.community_level is the derived global cache. Read via lib/stewardships.ts.';

-- ---------------------------------------------------------------------------
-- 3. RLS — own edges + platform staff read; all writes via the service role
--    (admin client), gated by the assignRole-style server actions. Mirrors
--    profile_personas. Scope-leader read of co-stewards is a follow-up (avoids a
--    recursive policy) — not load-bearing for the foundation.
-- ---------------------------------------------------------------------------
ALTER TABLE public.stewardships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own stewardships readable" ON public.stewardships;
CREATE POLICY "own stewardships readable" ON public.stewardships
  FOR SELECT USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
    OR get_my_web_role() IN ('admin','janitor')
  );

-- ---------------------------------------------------------------------------
-- 4. recompute_community_level(profile) — the single derivation, mirrored in
--    lib/core/stewardship.ts. level = MAX(ladder rank of the floor community_role,
--    ladder rank of every ACTIVE edge). crew<host<guide<mentor; outpost_lead is an
--    overlay convening role and does NOT raise the trust level on its own (its
--    holder's trust comes from any co-held host/guide/mentor edge). admin/janitor
--    floor to mentor (top community level) so their community `>= 'host'` gates are
--    preserved — staff authority itself lives on web_role (ADR-208).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_community_level(p_profile uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rank int;
BEGIN
  SELECT GREATEST(
    CASE (SELECT community_role FROM profiles WHERE id = p_profile)
      WHEN 'crew'    THEN 1 WHEN 'host'   THEN 2 WHEN 'guide' THEN 3
      WHEN 'mentor'  THEN 4 WHEN 'admin'  THEN 4 WHEN 'janitor' THEN 4
      ELSE 0 END,
    COALESCE((
      SELECT MAX(CASE role
        WHEN 'crew' THEN 1 WHEN 'host' THEN 2 WHEN 'guide' THEN 3
        WHEN 'mentor' THEN 4 ELSE 0 END)
      FROM stewardships
      WHERE profile_id = p_profile AND state = 'active'
    ), 0)
  ) INTO v_rank;

  UPDATE profiles SET community_level = CASE v_rank
    WHEN 4 THEN 'mentor' WHEN 3 THEN 'guide' WHEN 2 THEN 'host'
    WHEN 1 THEN 'crew' ELSE 'member' END
  WHERE id = p_profile;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Keep the cache fresh on any edge change (insert/update/delete).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_stewardships_recompute_level()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM recompute_community_level(OLD.profile_id);
    RETURN OLD;
  END IF;
  PERFORM recompute_community_level(NEW.profile_id);
  IF (TG_OP = 'UPDATE' AND NEW.profile_id <> OLD.profile_id) THEN
    PERFORM recompute_community_level(OLD.profile_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stewardships_level ON public.stewardships;
CREATE TRIGGER trg_stewardships_level
  AFTER INSERT OR UPDATE OR DELETE ON public.stewardships
  FOR EACH ROW EXECUTE FUNCTION trg_stewardships_recompute_level();

-- ---------------------------------------------------------------------------
-- 6. Backfill edges from the existing leader FKs (idempotent). No leader loses
--    standing: every host/guide/mentor FK becomes its matching scoped edge, and
--    step 7 floors community_level by community_role so a global rank with no FK
--    keeps its current matrix access. `crew` / `outpost_lead` edges are NOT seeded
--    (no source FK exists today — circle-helper status lives on
--    memberships.volunteer_role; outpost leadership lands in P1.5).
-- ---------------------------------------------------------------------------
INSERT INTO public.stewardships (profile_id, role, scope_type, scope_id)
  SELECT host_id, 'host', 'circle', id FROM public.circles WHERE host_id IS NOT NULL
  ON CONFLICT (profile_id, role, scope_type, scope_id) DO NOTHING;

INSERT INTO public.stewardships (profile_id, role, scope_type, scope_id)
  SELECT guide_id, 'guide', 'hub', id FROM public.hubs WHERE guide_id IS NOT NULL
  ON CONFLICT (profile_id, role, scope_type, scope_id) DO NOTHING;

INSERT INTO public.stewardships (profile_id, role, scope_type, scope_id)
  SELECT mentor_id, 'mentor', 'nexus', id FROM public.nexuses WHERE mentor_id IS NOT NULL
  ON CONFLICT (profile_id, role, scope_type, scope_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Seed community_level for everyone — derived max, floored by community_role.
--    The per-profile trigger above only fires on edge writes, so the bulk seed is
--    a single set-based UPDATE mirroring recompute_community_level().
-- ---------------------------------------------------------------------------
WITH edge_rank AS (
  SELECT profile_id, MAX(CASE role
    WHEN 'crew' THEN 1 WHEN 'host' THEN 2 WHEN 'guide' THEN 3
    WHEN 'mentor' THEN 4 ELSE 0 END) AS r
  FROM public.stewardships WHERE state = 'active'
  GROUP BY profile_id
)
UPDATE public.profiles p
SET community_level = CASE GREATEST(
    CASE p.community_role
      WHEN 'crew' THEN 1 WHEN 'host' THEN 2 WHEN 'guide' THEN 3
      WHEN 'mentor' THEN 4 WHEN 'admin' THEN 4 WHEN 'janitor' THEN 4
      ELSE 0 END,
    COALESCE(er.r, 0)
  )
  WHEN 4 THEN 'mentor' WHEN 3 THEN 'guide' WHEN 2 THEN 'host'
  WHEN 1 THEN 'crew' ELSE 'member' END
FROM (SELECT id, community_role FROM public.profiles) p2
LEFT JOIN edge_rank er ON er.profile_id = p2.id
WHERE p.id = p2.id;
