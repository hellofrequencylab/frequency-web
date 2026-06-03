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


-- ---------------------------------------------------------------------------
-- (c) PROGRAMS (~6) — host-facing frameworks for starting and sustaining a Circle.
--
--   No `programs` table exists yet, so we create it here (idempotently). It is
--   a content/library table like practices: a public, system-authored set of
--   structured guides. Columns mirror the practices conventions plus the
--   richer fields a program needs (slug, body markdown, audience, duration).
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE program_audience AS ENUM ('host','everyone');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS programs (
  id          uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text             NOT NULL,
  slug        text             NOT NULL UNIQUE,
  description text,                                   -- one-line summary
  body        text,                                   -- markdown, a few sections
  audience    program_audience NOT NULL DEFAULT 'host',
  duration    text,                                   -- human-readable, e.g. '7 days'
  created_by  uuid             REFERENCES profiles(id) ON DELETE SET NULL,
  is_public   boolean          NOT NULL DEFAULT true,
  is_demo     boolean          NOT NULL DEFAULT false,
  created_at  timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS programs_public_idx ON programs (is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS programs_slug_idx   ON programs (slug);

-- Public read; writes go through the service-role admin client behind app authz
-- (mirrors the practices library policy).
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "programs: public read" ON programs FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO programs (id, title, slug, description, body, audience, duration, created_by, is_public, is_demo) VALUES
  ('e2000000-0000-0000-0000-000000000001',
   'Start a Circle in 7 Days',
   'start-a-circle-in-7-days',
   'A day-by-day plan to go from idea to your first gathering in a week.',
   E'## Why this works\nMomentum beats perfection. Seven small steps get a Circle off the ground before doubt sets in.\n\n## The week\n- **Day 1** — Name the practice your Circle gathers around.\n- **Day 2** — Pick a time and place that you can sustain weekly.\n- **Day 3** — Invite five people personally, not a broadcast.\n- **Day 4** — Confirm and share one simple detail (what to bring).\n- **Day 5** — Prepare a 20-minute opening so the first meeting has shape.\n- **Day 6** — Send a warm reminder.\n- **Day 7** — Gather. Keep it short, end on a high.\n\n## After\nSchedule the next one before you leave the first.',
   'host', '7 days', NULL, true, true),

  ('e2000000-0000-0000-0000-000000000002',
   'Your First Gathering',
   'your-first-gathering',
   'A simple shape for a first meeting that feels welcoming, not awkward.',
   E'## The shape\nA good first gathering has a beginning, a middle, and an end.\n\n## Opening (10 min)\nWelcome people by name. Share why you started this and what to expect.\n\n## The practice (30 min)\nDo the thing together. Keep instructions light; let the practice carry it.\n\n## Closing (10 min)\nGo around once. One word on how everyone feels. Name the next date out loud.\n\n## Tips\n- Start on time, end on time.\n- Smaller is fine. Five people who show up beats fifty who do not.',
   'host', '50 min', NULL, true, true),

  ('e2000000-0000-0000-0000-000000000003',
   'Growing Past 10 Members',
   'growing-past-10-members',
   'How to add members without losing the intimacy that made the Circle work.',
   E'## The tension\nGrowth can dilute what people came for. Protect the feeling, not the number.\n\n## What to do\n- **Hold the ritual.** Keep the opening and closing the same every time.\n- **Share the load.** Invite a co-host or a crew member to help.\n- **Curate, do not broadcast.** Personal invites keep the culture intact.\n- **Watch the room.** If voices drop out, you have grown too fast.\n\n## When to split\nPast comfortable capacity, seed a second Circle rather than cramming one.',
   'host', 'ongoing', NULL, true, true),

  ('e2000000-0000-0000-0000-000000000004',
   'Hosting a Breathwork Space Safely',
   'hosting-a-breathwork-space-safely',
   'The basics of holding a safe, grounded breathwork session for a group.',
   E'## Before you begin\nBreathwork is powerful and not for everyone. Screen and set expectations.\n\n## Safety basics\n- **Ask about contraindications** (pregnancy, heart conditions, epilepsy, recent surgery).\n- **Never practise in or near water.**\n- **Invite consent for touch** — or simply do not touch.\n- **Stay present.** Hold the room; do not do the full practice yourself.\n\n## During\nGo slowly. Normalise stopping. Keep water and a calm voice on hand.\n\n## After\nLeave time to integrate. Check in with anyone who went deep.',
   'host', '60 min', NULL, true, true),

  ('e2000000-0000-0000-0000-000000000005',
   'Running a Dawn-Patrol Meetup',
   'running-a-dawn-patrol-meetup',
   'Logistics for an early-morning movement crew that actually shows up.',
   E'## The promise\nEarly is hard. Make showing up easier than staying in bed.\n\n## Logistics\n- **Fix the spot.** Same meeting point, every time.\n- **Set a hard start.** The crew leaves on time, latecomers catch up.\n- **Use a thread.** A quick "in?" the night before builds accountability.\n- **Plan for weather.** Have a rain call and share it early.\n\n## Culture\nCoffee after is half the point. Build the social tail, not just the session.',
   'host', '90 min', NULL, true, true),

  ('e2000000-0000-0000-0000-000000000006',
   'Keeping a Circle Alive Through Winter',
   'keeping-a-circle-alive-through-winter',
   'Sustain attendance and energy through the low, dark months.',
   E'## The dip\nMost Circles fade in winter. Expect it and plan against it.\n\n## What helps\n- **Move indoors early.** Have the warm backup ready before you need it.\n- **Lower the bar.** Shorter, cosier gatherings beat cancelled ones.\n- **Mark the season.** A solstice gathering gives people something to aim for.\n- **Stay in touch.** A weekly message keeps the Circle warm between meetings.\n\n## Come spring\nThe Circles that hold through winter are the ones that thrive in spring.',
   'host', 'seasonal', NULL, true, true)
ON CONFLICT (id) DO NOTHING;
