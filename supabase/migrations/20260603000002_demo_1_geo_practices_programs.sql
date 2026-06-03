-- =====================================================================
-- DEMO SEED 1 of N — Geography, Practices, Programs
--
-- Seeds the demo backdrop for 5 metros plus a starter practice library and
-- a host-facing program library. ALL content rows carry is_demo = true so the
-- demo data can be identified and cleared as one set.
--
-- Depends on 20260603000001_*, which adds the `is_demo` column to the demo
-- content tables (practices, etc.) and runs immediately before this file.
--
-- Idempotent throughout: every row uses a deterministic UUID (or stable slug)
-- and ON CONFLICT DO NOTHING, so this migration is safe to re-run.
--
-- Geography model (see 20240102000000_hierarchy_v2.sql + supabase/seed_hierarchy.sql):
--   nexus_regions tree (Americas → United States → state → city) → outposts
--   → nexuses → hubs → circles. Circles seeded elsewhere use hub_id, so we
--   only need the region tree here; outposts/nexuses/hubs are not required.
--
-- Existing region UUIDs we build on:
--   Americas        11000000-…-001  (depth 0)
--   United States   11000000-…-002  (depth 1)  ← parent of all states below
--   Texas           11000000-…-005  (depth 2, existing)
--   Oregon          11000000-…-007  (depth 2, existing)
-- =====================================================================


-- ---------------------------------------------------------------------------
-- (a) GEOGRAPHY — state-level + city-level nexus_regions for 5 demo metros.
--
--   The city-region UUIDs below are FIXED and referenced by the National demo
--   seed agent. Do not change them.
--     Austin, TX     1100000a-0000-0000-0000-0000000000a1
--     Boulder, CO    1100000a-0000-0000-0000-0000000000a2
--     Asheville, NC  1100000a-0000-0000-0000-0000000000a3
--     Brooklyn, NY   1100000a-0000-0000-0000-0000000000a4
--     Bend, OR       1100000a-0000-0000-0000-0000000000a5
-- ---------------------------------------------------------------------------

-- State-level regions (depth 2, parent = United States). Texas + Oregon already
-- exist (seeded in 20240303000000); we add the three new states here.
INSERT INTO nexus_regions (id, name, slug, depth, full_path, parent_id) VALUES
  ('1100000b-0000-0000-0000-0000000000b2', 'Colorado',       'colorado',       2, '/americas/united-states/colorado',       '11000000-0000-0000-0000-000000000002'),
  ('1100000b-0000-0000-0000-0000000000b3', 'North Carolina', 'north-carolina', 2, '/americas/united-states/north-carolina', '11000000-0000-0000-0000-000000000002'),
  ('1100000b-0000-0000-0000-0000000000b4', 'New York',       'new-york',       2, '/americas/united-states/new-york',       '11000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- City-level regions (depth 3) with the fixed UUIDs the National seed references.
INSERT INTO nexus_regions (id, name, slug, depth, full_path, parent_id) VALUES
  ('1100000a-0000-0000-0000-0000000000a1', 'Austin',    'austin',    3, '/americas/united-states/texas/austin',             '11000000-0000-0000-0000-000000000005'),
  ('1100000a-0000-0000-0000-0000000000a2', 'Boulder',   'boulder',   3, '/americas/united-states/colorado/boulder',         '1100000b-0000-0000-0000-0000000000b2'),
  ('1100000a-0000-0000-0000-0000000000a3', 'Asheville', 'asheville', 3, '/americas/united-states/north-carolina/asheville', '1100000b-0000-0000-0000-0000000000b3'),
  ('1100000a-0000-0000-0000-0000000000a4', 'Brooklyn',  'brooklyn',  3, '/americas/united-states/new-york/brooklyn',        '1100000b-0000-0000-0000-0000000000b4'),
  ('1100000a-0000-0000-0000-0000000000a5', 'Bend',      'bend',      3, '/americas/united-states/oregon/bend',              '11000000-0000-0000-0000-000000000007')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- (b) PRACTICES (~11) — starter library, one per interest area.
--
--   The practices table (20240228000000_practices.sql) has columns:
--     id, title, description, created_by, is_public, created_at  (+ is_demo
--     added by 20260603000001). It has no slug/body/audience/duration/channel
--     columns, so we seed only what exists. created_by is nullable (FK SET
--     NULL) → system-owned rows use NULL. is_public = true so they surface in
--     the public library.
--
--   Deterministic UUIDs prefixed e1000000-… keep the seed idempotent and let
--   later demo seeds reference specific practices.
-- ---------------------------------------------------------------------------
INSERT INTO practices (id, title, description, created_by, is_public, is_demo) VALUES
  -- Movement
  ('e1000000-0000-0000-0000-000000000001', 'Dawn patrol surf',          'Paddle out at first light. Catch a few waves before the day begins.', NULL, true, true),
  ('e1000000-0000-0000-0000-000000000002', 'Daily run',                 'Lace up and run, any distance, any pace. Just get out the door.',      NULL, true, true),
  ('e1000000-0000-0000-0000-000000000003', 'Mobility flow',             'A few minutes of mobility work to keep the body open and easy.',       NULL, true, true),
  -- Holistic Health
  ('e1000000-0000-0000-0000-000000000004', 'Cold plunge',               'A short cold immersion to wake up the system and build resilience.',   NULL, true, true),
  ('e1000000-0000-0000-0000-000000000005', 'Breathwork reset',          'A guided breathing round to settle the nervous system.',               NULL, true, true),
  ('e1000000-0000-0000-0000-000000000006', 'Sound bath sit',            'Sit and let the tones wash over you. Rest in the resonance.',          NULL, true, true),
  -- Spirituality
  ('e1000000-0000-0000-0000-000000000007', 'Morning sit',               'Sit in stillness and follow the breath for a few quiet minutes.',      NULL, true, true),
  ('e1000000-0000-0000-0000-000000000008', 'Gratitude journal',         'Write down a few things you are grateful for this morning.',           NULL, true, true),
  -- Creative
  ('e1000000-0000-0000-0000-000000000009', 'Daily sketch',              'One quick sketch a day. No judgement, just marks on paper.',           NULL, true, true),
  ('e1000000-0000-0000-0000-00000000000a', '250 words',                 'Write 250 words. Anything. Build the habit before the polish.',        NULL, true, true),
  -- Business
  ('e1000000-0000-0000-0000-00000000000b', 'Reach out to one person',   'Send one genuine message to one person who matters to your work.',     NULL, true, true)
ON CONFLICT (id) DO NOTHING;

-- (Programs are file-based — content/programs/*.md via lib/programs.ts — so none
-- are seeded here. The earlier draft invented a programs table; removed.)
