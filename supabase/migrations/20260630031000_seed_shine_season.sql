-- =============================================================================
-- Seed: Season 1 "Shine" — re-theme + 4-Pillar practices across Clear/Move/Charge
-- (docs/NAMING.md §The Quest; voice canon docs/CONTENT-VOICE.md — straight quotes,
--  no em dashes)
--
-- Builds on 20260629000000_seed_season_1_stretch.sql (Journeys, Expression
-- Challenges, schema columns) and 20260630030000_rename_stretch_journeys.sql
-- (single-word titles Clear/Move/Charge). This migration re-themes Season 1 from
-- "Stretch" to "Shine" and replaces each Journey's mono-Pillar practice set with a
-- four-Pillar (Mind/Body/Spirit/Expression) set, then refreshes the three capstone
-- Expression Challenges.
--
-- This migration:
--   1. Renames Season 1 -> "Shine" + sets theme (dates UNCHANGED).
--   2. Upserts the Shine practices (system library) with Pillar + weight class.
--   3. Clears each Journey's old practice items, then wires the new four-Pillar set.
--   4. Updates each Journey's summary (titles stay Clear/Move/Charge).
--   5. Updates the three capstone Expression Challenges (name + description).
--
-- IDEMPOTENT: ON CONFLICT for season/journeys/challenges; items are cleared and
-- re-wired via the same safe INSERT...WHERE NOT EXISTS + UPDATE helper as the
-- original seed (partial unique index journey_plan_items_plan_practice_uniq
-- WHERE practice_id IS NOT NULL — see 20260617000000).
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

BEGIN;

-- ── 1. Re-theme Season 1 "Shine" (dates UNCHANGED) ───────────────────────────

UPDATE public.seasons
SET
  name  = 'Shine',
  theme = 'Clear the noise. Move the body. Charge the heart. A four-week shine across mind, body, spirit, and expression.'
WHERE season_number = 1;

-- ── 2. Practice upsert helper ────────────────────────────────────────────────
--
-- Same shape as the original seed's pg_temp.upsert_practice, with ONE local
-- change: it now ALWAYS re-tags an existing system-library practice to the
-- specified Pillar (domain_id = v_dom), not just when domain_id was NULL. Shine
-- moves some practices across Pillars (e.g. Box Breathing: Mind -> Spirit), and
-- a COALESCE(domain_id, v_dom) would have pinned them to their old Pillar.

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
    -- Found — re-set weight_class AND re-tag domain_id to the specified Pillar.
    -- (Re-tagging unconditionally is the Shine-local change: Box Breathing moves
    -- Mind -> Spirit, so we must overwrite the old Pillar, not preserve it.)
    UPDATE public.practices
    SET weight_class = p_weight,
        domain_id    = v_dom
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
  v_plan_clear    uuid;
  v_plan_move     uuid;
  v_plan_charge   uuid;
  v_domain_mind   uuid;
  v_domain_body   uuid;
  v_domain_spirit uuid;
  v_domain_expr   uuid;
  v_pid           uuid;   -- scratch: resolved practice id
BEGIN

  -- Resolve the Season-1 Quest (season=1, active; matches the original seed).
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

  -- Resolve all four Pillar IDs (Shine uses every Pillar in every Journey).
  SELECT id INTO v_domain_mind   FROM public.pillars WHERE slug = 'mind';
  SELECT id INTO v_domain_body   FROM public.pillars WHERE slug = 'body';
  SELECT id INTO v_domain_spirit FROM public.pillars WHERE slug = 'spirit';
  SELECT id INTO v_domain_expr   FROM public.pillars WHERE slug = 'expression';

  -- Resolve the three existing Journeys (slugs are stable per the rename migration).
  SELECT id INTO v_plan_clear  FROM public.journey_plans WHERE slug = 'clear-head';
  SELECT id INTO v_plan_move   FROM public.journey_plans WHERE slug = 'get-moving';
  SELECT id INTO v_plan_charge FROM public.journey_plans WHERE slug = 'charge-up';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 3. Clear each Journey's OLD practice items first.
  -- The original seed wired 6 mono-Pillar items per Journey. Shine replaces them
  -- with a different set, so we DELETE the existing practice items (any item with
  -- a practice_id) and re-wire exactly the new set — leaving no stale rows.
  -- Non-practice blocks (practice_id IS NULL), if any, are kept.
  -- ═══════════════════════════════════════════════════════════════════════════

  DELETE FROM public.journey_plan_items
  WHERE plan_id = v_plan_clear  AND practice_id IS NOT NULL;
  DELETE FROM public.journey_plan_items
  WHERE plan_id = v_plan_move   AND practice_id IS NOT NULL;
  DELETE FROM public.journey_plan_items
  WHERE plan_id = v_plan_charge AND practice_id IS NOT NULL;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4. Upsert practices (Pillar + weight) and wire each Journey's new set.
  --
  -- Pillar order within a Journey: Mind, Body, Spirit, Expression. Within a
  -- Pillar, the spec's listed order. Casing note: the Stretch seed used the
  -- lowercase 'Daily walk'; Shine standardizes on 'Daily Walk' (capital W) per
  -- spec, so upsert_practice creates a fresh system row for the new title.
  -- ═══════════════════════════════════════════════════════════════════════════

  -- ── Clear (clear-head) ──────────────────────────────────────────────────────
  -- Mind: Morning Stillness, Phone-Free First Hour, Brain Dump ·
  -- Body: Daily Walk · Spirit: Box Breathing · Expression: Share One Thing
  v_pid := pg_temp.upsert_practice('Morning Stillness',     'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_clear, v_pid, v_domain_mind, 1);

  v_pid := pg_temp.upsert_practice('Phone-Free First Hour', 'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_clear, v_pid, v_domain_mind, 2);

  v_pid := pg_temp.upsert_practice('Brain Dump',            'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_clear, v_pid, v_domain_mind, 3);

  v_pid := pg_temp.upsert_practice('Daily Walk',            'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_clear, v_pid, v_domain_body, 4);

  v_pid := pg_temp.upsert_practice('Box Breathing',         'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_clear, v_pid, v_domain_spirit, 5);

  v_pid := pg_temp.upsert_practice('Share One Thing',       'standard', 'expression');
  PERFORM pg_temp.wire_item(v_plan_clear, v_pid, v_domain_expr, 6);

  -- ── Move (get-moving) ───────────────────────────────────────────────────────
  -- Mind: Morning Stillness · Body: Daily Walk, Morning Mobility, Strength Set,
  -- Sweat Session · Spirit: Box Breathing · Expression: Share One Thing
  v_pid := pg_temp.upsert_practice('Morning Stillness',     'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_mind, 1);

  v_pid := pg_temp.upsert_practice('Daily Walk',            'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_body, 2);

  v_pid := pg_temp.upsert_practice('Morning Mobility',      'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_body, 3);

  v_pid := pg_temp.upsert_practice('Strength Set',          'heavy',    'body');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_body, 4);

  v_pid := pg_temp.upsert_practice('Sweat Session',         'heavy',    'body');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_body, 5);

  v_pid := pg_temp.upsert_practice('Box Breathing',         'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_spirit, 6);

  v_pid := pg_temp.upsert_practice('Share One Thing',       'standard', 'expression');
  PERFORM pg_temp.wire_item(v_plan_move, v_pid, v_domain_expr, 7);

  -- ── Charge (charge-up) ──────────────────────────────────────────────────────
  -- Mind: Morning Stillness · Body: Daily Walk · Spirit: Box Breathing,
  -- Long Exhale, Name the Feeling, Sit With It, Spiritual Reading ·
  -- Expression: Share One Thing
  v_pid := pg_temp.upsert_practice('Morning Stillness',     'standard', 'mind');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_mind, 1);

  v_pid := pg_temp.upsert_practice('Daily Walk',            'standard', 'body');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_body, 2);

  v_pid := pg_temp.upsert_practice('Box Breathing',         'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_spirit, 3);

  v_pid := pg_temp.upsert_practice('Long Exhale',           'light',    'spirit');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_spirit, 4);

  v_pid := pg_temp.upsert_practice('Name the Feeling',      'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_spirit, 5);

  v_pid := pg_temp.upsert_practice('Sit With It',           'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_spirit, 6);

  v_pid := pg_temp.upsert_practice('Spiritual Reading',     'standard', 'spirit');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_spirit, 7);

  v_pid := pg_temp.upsert_practice('Share One Thing',       'standard', 'expression');
  PERFORM pg_temp.wire_item(v_plan_charge, v_pid, v_domain_expr, 8);

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 4b. Update each Journey's summary (titles stay Clear / Move / Charge).
  -- The rows already exist (slugs are stable); a direct UPDATE is the in-place
  -- edit the spec asks for.
  -- ═══════════════════════════════════════════════════════════════════════════

  UPDATE public.journey_plans
  SET summary = 'Clear the noise. Four weeks of small daily practice across mind, body, spirit, and expression, building to one public act. You cannot shine through a full, loud head.'
  WHERE slug = 'clear-head';

  UPDATE public.journey_plans
  SET summary = 'Get the body going, together. Daily movement across all four Pillars, a Sunday session as the centerpiece, building to bringing someone new in.'
  WHERE slug = 'get-moving';

  UPDATE public.journey_plans
  SET summary = 'Tend the inner world, then spend it on others. Breath and feeling daily across all four Pillars, closing the season with one real act of service.'
  WHERE slug = 'charge-up';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- 5. Refresh the three capstone Expression Challenges (name + description only).
  --
  -- Rows already exist (slugs express-clear-head / express-get-moving /
  -- express-charge-up, each journey_id-linked). We keep criteria, journey_id,
  -- zaps_reward, and is_active exactly as they are — only name + description
  -- change. ON CONFLICT (season, slug) so this is a pure in-place update; the
  -- INSERT row mirrors the original seed's column values so a fresh apply (where
  -- the row somehow does not exist) lands the same data.
  --
  -- Rewards are engine-driven by rank (escalating 25/50/100 + 75 Zaps + Trophy,
  -- +50 Zaps in person vs +30 Gems posted). No reward columns change here.
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.season_challenges
    (season, slug, name, description,
     category, difficulty, criteria, target,
     zaps_reward, sort_order, is_active, journey_id)
  VALUES
    (1, 'express-clear-head', 'Capstone: Clear',
     'Take the clearest thing the four weeks gave you and put it where people outside the group will meet it. Post it publicly, or say it out loud to someone outside your usual people. A clear thought, spoken into the real world. +50 Zaps in person at a Circle, or +30 Gems posted.',
     'special', 'hard',
     '{"type":"expression","journey_slug":"clear-head"}'::jsonb,
     1, 50, 20, true, v_plan_clear)
  ON CONFLICT (season, slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description;

  INSERT INTO public.season_challenges
    (season, slug, name, description,
     category, difficulty, criteria, target,
     zaps_reward, sort_order, is_active, journey_id)
  VALUES
    (1, 'express-get-moving', 'Capstone: Move',
     'Bring someone new in. Open a Sunday Sunset Session to someone outside the group, or start your own and invite the people around you. Someone new moving because you asked. +50 Zaps in person at a Circle, or +30 Gems posted.',
     'special', 'hard',
     '{"type":"expression","journey_slug":"get-moving"}'::jsonb,
     1, 50, 21, true, v_plan_move)
  ON CONFLICT (season, slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description;

  INSERT INTO public.season_challenges
    (season, slug, name, description,
     category, difficulty, criteria, target,
     zaps_reward, sort_order, is_active, journey_id)
  VALUES
    (1, 'express-charge-up', 'Capstone: Charge',
     'Do one real thing for your community. An act of service, a genuine reach-out, a connection you start. Take what you built inside and give it to someone else. +50 Zaps in person at a Circle, or +30 Gems posted.',
     'special', 'hard',
     '{"type":"expression","journey_slug":"charge-up"}'::jsonb,
     1, 50, 22, true, v_plan_charge)
  ON CONFLICT (season, slug) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description;

END $$;

-- ── DOWN (run manually to reverse) ───────────────────────────────────────────
--
-- -- Revert Season 1 theme back to Stretch:
-- UPDATE public.seasons
-- SET name = 'Stretch',
--     theme = 'The city is already alive. Find your frequency.'
-- WHERE season_number = 1;
--
-- -- The Journey summaries + capstone names/descriptions revert to their
-- -- Stretch-era copy (see 20260629000000_seed_season_1_stretch.sql and
-- -- 20260630030000_rename_stretch_journeys.sql). The practice re-wire is NOT
-- -- auto-reversible: rerun the Stretch seed to restore the old mono-Pillar items.
-- -- Practices created above are NOT deleted in DOWN — they may be adopted.
-- ── END DOWN ─────────────────────────────────────────────────────────────────

COMMIT;
