-- =============================================================================
-- Seed: Season 1 "Stretch" — 3 Journeys + Expression Challenges
-- (docs/NAMING.md §The Quest; spec §7; ADR-208/252/281)
--
-- Prerequisites (applied to prod out-of-band as the "completion-model migration"):
--   * journey_plans.window_starts_at / window_ends_at  (Journey windows)
--   * season_challenges.journey_id                     (Expression Challenge → Journey link)
--   * journey_completions table                        (completion records; not seeded here)
--
-- This migration:
--   1. Adds the schema columns above (idempotent: ADD COLUMN IF NOT EXISTS).
--   2. Names Season 1 "Stretch", sets theme + window.
--   3. Retires the 4 old official-1-* Journeys (rows kept; history preserved).
--   4. Seeds 3 Stretch Journeys (Clear Head / Get Moving / Charge Up).
--   5. Ensures practices exist and wires them as journey_plan_items (block_type='practice').
--   6. Seeds 3 Expression Challenges (one per Journey; criteria type=expression).
--
-- IDEMPOTENT: ON CONFLICT everywhere for journeys/challenges; items use a safe
-- INSERT...WHERE NOT EXISTS + UPDATE pattern (see note in §5 below).
-- =============================================================================

BEGIN;

-- ── 1. Schema additions (no-op if already applied out-of-band) ───────────────

-- Per-Journey play windows: the completion engine resolves "14–16 days inside
-- the ~4-week window" against these timestamps (lib/journey-arc.ts).
ALTER TABLE public.journey_plans
  ADD COLUMN IF NOT EXISTS window_starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS window_ends_at   timestamptz;

COMMENT ON COLUMN public.journey_plans.window_starts_at IS
  'Start of this Journey''s play window inside the active season (~4-week window, NAMING.md §The Quest). Null = evergreen library Journey. Official Stretch Journeys carry sequential windows: weeks 1-4, 5-8, 9-12 (ADR-252 completion model).';

COMMENT ON COLUMN public.journey_plans.window_ends_at IS
  'End of this Journey''s play window. Null = evergreen. Completion engine checks practice_logs.logged_for dates against [window_starts_at, window_ends_at] (or the enrollment anchor for solo library Journeys).';

-- Link an Expression Challenge back to its Journey (NAMING.md: "linked to its Journey
-- via journey_id"). Nullable: the 15-challenge outreach set has no Journey anchor.
ALTER TABLE public.season_challenges
  ADD COLUMN IF NOT EXISTS journey_id uuid REFERENCES public.journey_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_season_challenges_journey
  ON public.season_challenges (journey_id)
  WHERE journey_id IS NOT NULL;

COMMENT ON COLUMN public.season_challenges.journey_id IS
  'For Expression Challenge rows (criteria type=expression): the Journey this capstone completes. Null = season-wide challenge (the outreach / leaderboard set). NAMING.md §The Quest.';

-- ── 2. Name Season 1 "Stretch" + set theme and window ─────────────────────────

UPDATE public.seasons
SET
  name      = 'Stretch',
  theme     = 'The city is already alive. Find your frequency.',
  starts_at = '2026-06-21T00:00:00Z',
  ends_at   = '2026-09-22T23:59:59Z'
WHERE season_number = 1;

-- ── 3. Retire the 4 old official-1-* Journeys ─────────────────────────────────
-- Rows are never deleted (adoptions + completion history reference them).
-- official=false hides them from the official selector; visibility='unlisted'
-- removes them from the public library browse.

UPDATE public.journey_plans
SET official   = false,
    visibility = 'unlisted'
WHERE slug IN (
  'official-1-mind',
  'official-1-body',
  'official-1-spirit',
  'official-1-expression'
);

-- ── 4-6. Seed Journeys, Practices, Items, Challenges ─────────────────────────
--
-- A pg_temp helper upserts practices by title (same pattern used by the
-- curriculum seed in 20260622000000). It creates new practices in the system
-- library (created_by IS NULL) or reuses an existing row.
--
-- Item inserts use INSERT...WHERE NOT EXISTS + a follow-up UPDATE rather than
-- ON CONFLICT (plan_id, practice_id), because the 20260617000000 migration
-- dropped the inline unique constraint and replaced it with a partial unique
-- index (journey_plan_items_plan_practice_uniq WHERE practice_id IS NOT NULL).
-- A bare ON CONFLICT (col, col) against a partial index requires the full
-- WHERE clause in the ON CONFLICT clause, which is verbose; the two-step
-- INSERT/UPDATE is semantically equivalent and more legible.

CREATE OR REPLACE FUNCTION pg_temp.upsert_practice(
  p_title       text,
  p_weight      text,    -- 'light' | 'standard' | 'heavy'
  p_pillar_slug text
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id   uuid;
  v_dom  uuid;
BEGIN
  -- Resolve the pillar ID (public.pillars since 20260613000010 naming-canon migration).
  SELECT id INTO v_dom FROM public.pillars WHERE slug = p_pillar_slug;

  -- Prefer the existing system library practice by exact title (created_by IS NULL).
  SELECT id INTO v_id
  FROM public.practices
  WHERE title = p_title AND created_by IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_id IS NULL THEN
    -- Not found — create it in the system library.
    INSERT INTO public.practices (title, domain_id, weight_class, is_public, status, created_by)
    VALUES (p_title, v_dom, p_weight, true, 'approved', NULL)
    RETURNING id INTO v_id;
  ELSE
    -- Found — ensure weight_class (and domain_id if unset) match the spec.
    UPDATE public.practices
    SET weight_class = p_weight,
        domain_id   = COALESCE(domain_id, v_dom)
    WHERE id = v_id
      AND (weight_class <> p_weight OR domain_id IS DISTINCT FROM v_dom);
  END IF;

  RETURN v_id;
END;
$$;

-- Helper: wire a practice item onto a Journey (insert-then-update pattern).
CREATE OR REPLACE FUNCTION pg_temp.wire_item(
  p_plan_id   uuid,
  p_prac_id   uuid,
  p_domain_id uuid,
  p_sort      int
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Insert if not yet present.
  INSERT INTO public.journey_plan_items
    (plan_id, practice_id, domain_id, block_type, sort_order)
  SELECT p_plan_id, p_prac_id, p_domain_id, 'practice', p_sort
  WHERE NOT EXISTS (
    SELECT 1 FROM public.journey_plan_items
    WHERE plan_id = p_plan_id AND practice_id = p_prac_id
  );
  -- Update sort_order + domain_id to spec values (idempotent on re-run).
  UPDATE public.journey_plan_items
  SET sort_order = p_sort,
      domain_id  = p_domain_id
  WHERE plan_id = p_plan_id AND practice_id = p_prac_id;
END;
$$;

DO $$
DECLARE
  v_quest_id      uuid;
  v_plan_mind     uuid;
  v_plan_body     uuid;
  v_plan_spirit   uuid;
  v_domain_mind   uuid;
  v_domain_body   uuid;
  v_domain_spirit uuid;
  v_pid           uuid;   -- scratch: resolved practice id
BEGIN

  -- Resolve the Season-1 Quest (slug seeded by 20260608010000 as 'season-quest-1').
  SELECT id INTO v_quest_id
  FROM public.quests
  WHERE season = 1 AND status = 'active'
  ORDER BY sort_order ASC
  LIMIT 1;
  -- Fallback: any active quest (guards against a future Quest rename).
  IF v_quest_id IS NULL THEN
    SELECT id INTO v_quest_id
    FROM public.quests WHERE status = 'active' ORDER BY sort_order ASC LIMIT 1;
  END IF;

  -- Resolve Pillar IDs (public.pillars since 20260613000010; domain_id FKs still
  -- point at the same rows — the table was renamed in-place, OIDs unchanged).
  SELECT id INTO v_domain_mind   FROM public.pillars WHERE slug = 'mind';
  SELECT id INTO v_domain_body   FROM public.pillars WHERE slug = 'body';
  SELECT id INTO v_domain_spirit FROM public.pillars WHERE slug = 'spirit';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4a. Journey: Clear Head  (Mind — weeks 1-4, 2026-06-21 → 2026-07-19)
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.journey_plans (
    slug, title, summary,
    visibility, official, quest_id,
    status, accent, emoji, completion_gems,
    window_starts_at, window_ends_at, published_at
  ) VALUES (
    'clear-head',
    'Clear',
    'Reclaim the quiet. Six practices that clear the mental clutter and tune the mind back to what matters this season.',
    'public', true, v_quest_id,
    'approved', 'indigo', '🧠', 30,
    '2026-06-21T00:00:00Z', '2026-07-19T23:59:59Z', now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    title            = EXCLUDED.title,
    summary          = EXCLUDED.summary,
    official         = true,
    quest_id         = EXCLUDED.quest_id,
    status           = 'approved',
    visibility       = 'public',
    accent           = EXCLUDED.accent,
    emoji            = EXCLUDED.emoji,
    completion_gems  = EXCLUDED.completion_gems,
    window_starts_at = EXCLUDED.window_starts_at,
    window_ends_at   = EXCLUDED.window_ends_at,
    published_at     = COALESCE(journey_plans.published_at, EXCLUDED.published_at);

  SELECT id INTO v_plan_mind FROM public.journey_plans WHERE slug = 'clear-head';

  -- Wire Clear Head practices
  -- (Normalization note: "→12" = off-grid value normalized to nearest standard=12)
  v_pid := pg_temp.upsert_practice('Morning Stillness',     'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_mind, v_pid, v_domain_mind, 1);

  v_pid := pg_temp.upsert_practice('Box Breathing',         'light',    'mind');
  PERFORM pg_temp.wire_item(v_plan_mind, v_pid, v_domain_mind, 2);

  v_pid := pg_temp.upsert_practice('Signal Journal',        'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_mind, v_pid, v_domain_mind, 3);

  v_pid := pg_temp.upsert_practice('Screen-Free Morning',   'heavy',    'mind');
  PERFORM pg_temp.wire_item(v_plan_mind, v_pid, v_domain_mind, 4);

  v_pid := pg_temp.upsert_practice('Nature Walk Cognitive', 'standard', 'mind'); -- off-grid "→12"
  PERFORM pg_temp.wire_item(v_plan_mind, v_pid, v_domain_mind, 5);

  v_pid := pg_temp.upsert_practice('Read Something Real',   'light',    'mind');
  PERFORM pg_temp.wire_item(v_plan_mind, v_pid, v_domain_mind, 6);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4b. Journey: Move (Get Moving)  (Body — weeks 5-8, 2026-07-19 → 2026-08-16)
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.journey_plans (
    slug, title, summary,
    visibility, official, quest_id,
    status, accent, emoji, completion_gems,
    window_starts_at, window_ends_at, published_at
  ) VALUES (
    'get-moving',
    'Move',
    'The body is the transmitter. Six practices that keep the carrier wave strong and the signal coming through clean.',
    'public', true, v_quest_id,
    'approved', 'jade', '🔋', 30,
    '2026-07-19T00:00:00Z', '2026-08-16T23:59:59Z', now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    title            = EXCLUDED.title,
    summary          = EXCLUDED.summary,
    official         = true,
    quest_id         = EXCLUDED.quest_id,
    status           = 'approved',
    visibility       = 'public',
    accent           = EXCLUDED.accent,
    emoji            = EXCLUDED.emoji,
    completion_gems  = EXCLUDED.completion_gems,
    window_starts_at = EXCLUDED.window_starts_at,
    window_ends_at   = EXCLUDED.window_ends_at,
    published_at     = COALESCE(journey_plans.published_at, EXCLUDED.published_at);

  SELECT id INTO v_plan_body FROM public.journey_plans WHERE slug = 'get-moving';

  -- Wire Get Moving practices.
  -- 'Morning movement' title-casing note: the system library seeded in 20260609103000
  -- used 'Morning movement' (lowercase m). If that exact-cased row exists, upsert_practice
  -- will not find 'Morning Movement' and will create a new row. Both titles are valid
  -- system practices; the prior-migration row keeps its history.
  v_pid := pg_temp.upsert_practice('Morning Movement',   'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_body, v_pid, v_domain_body, 1);

  -- 'Daily walk' title: the system library uses lowercase 'Daily walk' (20260609103000).
  v_pid := pg_temp.upsert_practice('Daily walk',         'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_body, v_pid, v_domain_body, 2);

  v_pid := pg_temp.upsert_practice('Hydration Protocol', 'light',    'body');
  PERFORM pg_temp.wire_item(v_plan_body, v_pid, v_domain_body, 3);

  v_pid := pg_temp.upsert_practice('One Real Meal',      'standard', 'body'); -- off-grid "→12"
  PERFORM pg_temp.wire_item(v_plan_body, v_pid, v_domain_body, 4);

  v_pid := pg_temp.upsert_practice('Cold Shower',        'heavy',    'body');
  PERFORM pg_temp.wire_item(v_plan_body, v_pid, v_domain_body, 5);

  v_pid := pg_temp.upsert_practice('Grounding Barefoot', 'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_body, v_pid, v_domain_body, 6);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4c. Journey: Charge (Charge Up)  (Spirit — weeks 9-12, 2026-08-16 → 2026-09-13)
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.journey_plans (
    slug, title, summary,
    visibility, official, quest_id,
    status, accent, emoji, completion_gems,
    window_starts_at, window_ends_at, published_at
  ) VALUES (
    'charge-up',
    'Charge',
    'The quiet center of Stretch. Six practices that restore the inner signal and let the frequency find its way back.',
    'public', true, v_quest_id,
    'approved', 'plum', '🧘', 30,
    '2026-08-16T00:00:00Z', '2026-09-13T23:59:59Z', now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    title            = EXCLUDED.title,
    summary          = EXCLUDED.summary,
    official         = true,
    quest_id         = EXCLUDED.quest_id,
    status           = 'approved',
    visibility       = 'public',
    accent           = EXCLUDED.accent,
    emoji            = EXCLUDED.emoji,
    completion_gems  = EXCLUDED.completion_gems,
    window_starts_at = EXCLUDED.window_starts_at,
    window_ends_at   = EXCLUDED.window_ends_at,
    published_at     = COALESCE(journey_plans.published_at, EXCLUDED.published_at);

  SELECT id INTO v_plan_spirit FROM public.journey_plans WHERE slug = 'charge-up';

  -- Wire Charge Up practices.
  -- 'Breathwork' exists in the system library (20260609103000, 20260606140000).
  -- 'Daily meditation' exists in the system library too. Where a new Charge Up
  -- practice name differs from the old canonical title, a new system row is created.
  v_pid := pg_temp.upsert_practice('Five Minute Stillness', 'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_spirit, v_pid, v_domain_spirit, 1);

  v_pid := pg_temp.upsert_practice('Felt Gratitude',        'light',    'spirit');
  PERFORM pg_temp.wire_item(v_plan_spirit, v_pid, v_domain_spirit, 2);

  v_pid := pg_temp.upsert_practice('Nature Witnessing',     'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_spirit, v_pid, v_domain_spirit, 3);

  v_pid := pg_temp.upsert_practice('Humming and Toning',    'light',    'spirit');
  PERFORM pg_temp.wire_item(v_plan_spirit, v_pid, v_domain_spirit, 4);

  v_pid := pg_temp.upsert_practice('Eye Contact Practice',  'standard', 'spirit'); -- off-grid "→12"
  PERFORM pg_temp.wire_item(v_plan_spirit, v_pid, v_domain_spirit, 5);

  v_pid := pg_temp.upsert_practice('Act of Service',        'heavy',    'spirit'); -- off-grid "→15"
  PERFORM pg_temp.wire_item(v_plan_spirit, v_pid, v_domain_spirit, 6);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 6. Expression Challenges — one per Journey (NAMING.md §The Quest)
  --
  -- criteria.type = 'expression' (the completion engine routes this type to
  -- the per-Journey capstone handler in lib/achievements.ts). The engine owns
  -- the +50 Zaps (in-person Circle) vs +30 Gems (solo online) fork; the seed
  -- only establishes the row, the reward ceiling, and the Journey link.
  -- sort_order 20-22 sits outside the 15-challenge outreach band (1-15).
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.season_challenges
    (season, slug, name, description,
     category, difficulty, criteria, target,
     zaps_reward, sort_order, is_active, journey_id)
  VALUES
    (1, 'express-clear-head', 'Express: Clear',
     'Complete the Clear Expression capstone. Share what shifted -- in person at a Circle or solo online.',
     'special', 'hard',
     '{"type":"expression","journey_slug":"clear-head"}'::jsonb,
     1, 50, 20, true, v_plan_mind)
  ON CONFLICT (season, slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    criteria    = EXCLUDED.criteria,
    zaps_reward = EXCLUDED.zaps_reward,
    sort_order  = EXCLUDED.sort_order,
    is_active   = true,
    journey_id  = EXCLUDED.journey_id;

  INSERT INTO public.season_challenges
    (season, slug, name, description,
     category, difficulty, criteria, target,
     zaps_reward, sort_order, is_active, journey_id)
  VALUES
    (1, 'express-get-moving', 'Express: Move',
     'Complete the Move Expression capstone. Show what moved you -- in person at a Circle or solo online.',
     'special', 'hard',
     '{"type":"expression","journey_slug":"get-moving"}'::jsonb,
     1, 50, 21, true, v_plan_body)
  ON CONFLICT (season, slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    criteria    = EXCLUDED.criteria,
    zaps_reward = EXCLUDED.zaps_reward,
    sort_order  = EXCLUDED.sort_order,
    is_active   = true,
    journey_id  = EXCLUDED.journey_id;

  INSERT INTO public.season_challenges
    (season, slug, name, description,
     category, difficulty, criteria, target,
     zaps_reward, sort_order, is_active, journey_id)
  VALUES
    (1, 'express-charge-up', 'Express: Charge',
     'Complete the Charge Expression capstone. Transmit what recharged you -- in person at a Circle or solo online.',
     'special', 'hard',
     '{"type":"expression","journey_slug":"charge-up"}'::jsonb,
     1, 50, 22, true, v_plan_spirit)
  ON CONFLICT (season, slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    criteria    = EXCLUDED.criteria,
    zaps_reward = EXCLUDED.zaps_reward,
    sort_order  = EXCLUDED.sort_order,
    is_active   = true,
    journey_id  = EXCLUDED.journey_id;

END $$;

-- ── DOWN (run manually to reverse before the season opens) ───────────────────
--
-- -- Re-activate old official Journeys:
-- UPDATE public.journey_plans
-- SET official = true, visibility = 'public'
-- WHERE slug IN ('official-1-mind','official-1-body','official-1-spirit','official-1-expression');
--
-- -- Retire the 3 new Stretch Journeys (do NOT delete -- members may have enrolled):
-- UPDATE public.journey_plans
-- SET official = false, visibility = 'unlisted'
-- WHERE slug IN ('clear-head','get-moving','charge-up');
--
-- -- Remove the 3 Expression Challenges (safe to delete if no progress rows yet):
-- DELETE FROM public.season_challenges
-- WHERE season = 1 AND slug IN ('express-clear-head','express-get-moving','express-charge-up');
--
-- -- Revert Season 1 name + theme:
-- UPDATE public.seasons
-- SET name = 'Season 1', theme = NULL, ends_at = NULL
-- WHERE season_number = 1;
--
-- NOTE: Practices and journey_plan_items created above are NOT deleted in DOWN --
-- they may be adopted by members. Archive manually if truly unwanted.
-- ── END DOWN ─────────────────────────────────────────────────────────────────

COMMIT;
