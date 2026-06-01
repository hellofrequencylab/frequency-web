-- =============================================================================
-- Frequency Community Platform — San Diego Hierarchy Seed
-- Run this AFTER applying the hierarchy_v2 migration.
-- Idempotent: uses ON CONFLICT DO NOTHING throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Regions (nested: Americas → United States → California → San Diego)
-- ---------------------------------------------------------------------------

INSERT INTO nexus_regions (id, name, slug, depth, full_path, parent_id)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'Americas',       'americas',       0, '/americas',                             NULL),
  ('11000000-0000-0000-0000-000000000002', 'United States',  'united-states',  1, '/americas/united-states',               '11000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000003', 'California',     'california',     2, '/americas/united-states/california',    '11000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000004', 'San Diego',      'san-diego-r',    3, '/americas/united-states/california/san-diego', '11000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- Also ensure slugs are unique
INSERT INTO nexus_regions (id, name, slug, depth, full_path, parent_id)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'Americas',       'americas',       0, '/americas',                             NULL)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. Outposts — city / neighbourhood containers
-- ---------------------------------------------------------------------------

INSERT INTO outposts (id, name, slug, region_id)
VALUES
  ('22000000-0000-0000-0000-000000000001', 'San Diego',    'san-diego',   '11000000-0000-0000-0000-000000000004'),
  ('22000000-0000-0000-0000-000000000002', 'Encinitas',    'encinitas',   '11000000-0000-0000-0000-000000000004'),
  ('22000000-0000-0000-0000-000000000003', 'North Park',   'north-park',  '11000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Nexuses — core community units (mentor_id = NULL → forming)
-- ---------------------------------------------------------------------------

INSERT INTO nexuses (id, name, slug, outpost_id, status, member_cap)
VALUES
  ('33000000-0000-0000-0000-000000000001', 'San Diego Nexus',   'sd-nexus',        '22000000-0000-0000-0000-000000000001', 'forming', 2500),
  ('33000000-0000-0000-0000-000000000002', 'Encinitas Nexus',   'encinitas-nexus', '22000000-0000-0000-0000-000000000002', 'forming', 2500)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. Hubs — each under a Nexus, max 5 Circles
-- ---------------------------------------------------------------------------

INSERT INTO hubs (id, name, slug, nexus_id, status)
VALUES
  ('44000000-0000-0000-0000-000000000001', 'Coastal Hub',    'coastal-hub',    '33000000-0000-0000-0000-000000000001', 'forming'),
  ('44000000-0000-0000-0000-000000000002', 'Downtown Hub',   'downtown-hub',   '33000000-0000-0000-0000-000000000001', 'forming'),
  ('44000000-0000-0000-0000-000000000003', 'Encinitas Hub',  'encinitas-hub',  '33000000-0000-0000-0000-000000000002', 'forming')
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. Circles — user home groups (host_id = NULL → forming)
-- ---------------------------------------------------------------------------

INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about, latitude, longitude, neighborhood)
VALUES
  ('55000000-0000-0000-0000-000000000001',
   'Cardiff Morning Circle', 'cardiff-morning',
   '44000000-0000-0000-0000-000000000001',
   'in-person', 50, 'forming',
   'Early morning riders based in Cardiff-by-the-Sea. We meet Tue/Thu/Sat at 6 AM.',
   33.0203, -117.2797, 'Cardiff-by-the-Sea'),

  ('55000000-0000-0000-0000-000000000002',
   'Pacific Beach Evening Circle', 'pb-evening',
   '44000000-0000-0000-0000-000000000001',
   'in-person', 50, 'forming',
   'Evening rides along the boardwalk and Mission Bay. Meet at Crystal Pier Wed/Fri at 6 PM.',
   32.7986, -117.2558, 'Crystal Pier, Pacific Beach'),

  ('55000000-0000-0000-0000-000000000003',
   'Downtown Online Circle', 'downtown-online',
   '44000000-0000-0000-0000-000000000002',
   'online', 100, 'forming',
   'Virtual rides and discussions for the downtown San Diego community.',
   NULL, NULL, NULL),

  ('55000000-0000-0000-0000-000000000004',
   'Encinitas Morning Circle', 'encinitas-morning',
   '44000000-0000-0000-0000-000000000003',
   'in-person', 50, 'forming',
   'Meet at Moonlight Beach parking lot Mon/Wed/Fri at 6:30 AM.',
   33.0461, -117.2969, 'Moonlight Beach, Encinitas')
ON CONFLICT (id) DO NOTHING;
