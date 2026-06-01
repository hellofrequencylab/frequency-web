-- Flesh out the demo network: a circle cover image, Houston + Portland geography,
-- and 10 fully-populated circles (6 San Diego County, 3 Houston, 1 Portland) with
-- images, locations, interests, and descriptions. Idempotent.

ALTER TABLE circles ADD COLUMN IF NOT EXISTS image_url text;

-- ── Geography: Texas/Houston + Oregon/Portland branches ──────────────────────
INSERT INTO nexus_regions (id, name, slug, depth, full_path, parent_id) VALUES
  ('11000000-0000-0000-0000-000000000005', 'Texas',    'texas',     2, '/americas/united-states/texas',           '11000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000006', 'Houston',  'houston-r', 3, '/americas/united-states/texas/houston',   '11000000-0000-0000-0000-000000000005'),
  ('11000000-0000-0000-0000-000000000007', 'Oregon',   'oregon',    2, '/americas/united-states/oregon',          '11000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000008', 'Portland', 'portland-r',3, '/americas/united-states/oregon/portland', '11000000-0000-0000-0000-000000000007')
ON CONFLICT (id) DO NOTHING;

INSERT INTO outposts (id, name, slug, region_id) VALUES
  ('22000000-0000-0000-0000-000000000004', 'Houston',  'houston',  '11000000-0000-0000-0000-000000000006'),
  ('22000000-0000-0000-0000-000000000005', 'Portland', 'portland', '11000000-0000-0000-0000-000000000008')
ON CONFLICT (id) DO NOTHING;

INSERT INTO nexuses (id, name, slug, outpost_id, status, member_cap) VALUES
  ('33000000-0000-0000-0000-000000000003', 'Houston Nexus',  'houston-nexus',  '22000000-0000-0000-0000-000000000004', 'forming', 2500),
  ('33000000-0000-0000-0000-000000000004', 'Portland Nexus', 'portland-nexus', '22000000-0000-0000-0000-000000000005', 'forming', 2500)
ON CONFLICT (id) DO NOTHING;

INSERT INTO hubs (id, name, slug, nexus_id, status) VALUES
  ('44000000-0000-0000-0000-000000000004', 'Bayou City Hub', 'bayou-city-hub', '33000000-0000-0000-0000-000000000003', 'forming'),
  ('44000000-0000-0000-0000-000000000005', 'Rose City Hub',  'rose-city-hub',  '33000000-0000-0000-0000-000000000004', 'forming')
ON CONFLICT (id) DO NOTHING;

-- ── Complete the four existing seeded circles (image + interest + member count) ─
UPDATE circles SET image_url = 'https://picsum.photos/seed/cardiff-morning/400/400',
  topical_channel_id = COALESCE(topical_channel_id, (SELECT id FROM topical_channels WHERE slug = 'movement')),
  member_count = 14, status = 'active'
WHERE id = '55000000-0000-0000-0000-000000000001';

UPDATE circles SET image_url = 'https://picsum.photos/seed/pb-evening/400/400',
  topical_channel_id = COALESCE(topical_channel_id, (SELECT id FROM topical_channels WHERE slug = 'movement')),
  member_count = 9, status = 'active'
WHERE id = '55000000-0000-0000-0000-000000000002';

UPDATE circles SET image_url = 'https://picsum.photos/seed/downtown-online/400/400',
  topical_channel_id = COALESCE(topical_channel_id, (SELECT id FROM topical_channels WHERE slug = 'human-relating')),
  member_count = 22, status = 'active'
WHERE id = '55000000-0000-0000-0000-000000000003';

UPDATE circles SET image_url = 'https://picsum.photos/seed/encinitas-morning/400/400',
  topical_channel_id = COALESCE(topical_channel_id, (SELECT id FROM topical_channels WHERE slug = 'movement')),
  member_count = 18, status = 'active'
WHERE id = '55000000-0000-0000-0000-000000000004';

-- User-created skate circle, if present.
UPDATE circles SET image_url = COALESCE(image_url, 'https://picsum.photos/seed/skate-or-die/400/400'),
  topical_channel_id = COALESCE(topical_channel_id, (SELECT id FROM topical_channels WHERE slug = 'movement'))
WHERE name ILIKE '%skate or die%';

-- ── Two more San Diego circles (-> 6 SD total) ───────────────────────────────
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, member_count, status, about, latitude, longitude, neighborhood, topical_channel_id, image_url) VALUES
  ('55000000-0000-0000-0000-000000000005', 'La Jolla Cove Swim Club', 'la-jolla-cove-swim',
   '44000000-0000-0000-0000-000000000001', 'in-person', 50, 27, 'active',
   'Open-water swimmers who meet at the Cove three mornings a week — all paces, wetsuits optional. Coffee after.',
   32.8508, -117.2713, 'La Jolla Cove', (SELECT id FROM topical_channels WHERE slug = 'holistic-health'),
   'https://picsum.photos/seed/la-jolla-cove-swim/400/400'),

  ('55000000-0000-0000-0000-000000000006', 'North Park Run Club', 'north-park-run',
   '44000000-0000-0000-0000-000000000002', 'in-person', 50, 31, 'active',
   'A no-drop neighborhood run club looping through Balboa Park and North Park. Tuesdays and Saturdays, then tacos.',
   32.7405, -117.1298, 'North Park', (SELECT id FROM topical_channels WHERE slug = 'movement'),
   'https://picsum.photos/seed/north-park-run/400/400')
ON CONFLICT (id) DO NOTHING;

-- ── Three Houston circles ────────────────────────────────────────────────────
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, member_count, status, about, latitude, longitude, neighborhood, topical_channel_id, image_url) VALUES
  ('55000000-0000-0000-0000-000000000007', 'Buffalo Bayou Sunrise Walk', 'buffalo-bayou-walk',
   '44000000-0000-0000-0000-000000000004', 'in-person', 50, 12, 'active',
   'Gentle sunrise walks along the bayou trails downtown. A calm way to start the day and meet good people.',
   29.7615, -95.3829, 'Buffalo Bayou Park, Houston', (SELECT id FROM topical_channels WHERE slug = 'movement'),
   'https://picsum.photos/seed/buffalo-bayou-walk/400/400'),

  ('55000000-0000-0000-0000-000000000008', 'Houston Heights Yoga', 'heights-yoga',
   '44000000-0000-0000-0000-000000000004', 'in-person', 50, 19, 'active',
   'Donation-based yoga in the park on weekend mornings. Bring a mat; leave a little lighter.',
   29.7980, -95.3980, 'The Heights, Houston', (SELECT id FROM topical_channels WHERE slug = 'holistic-health'),
   'https://picsum.photos/seed/heights-yoga/400/400'),

  ('55000000-0000-0000-0000-000000000009', 'Montrose Makers', 'montrose-makers',
   '44000000-0000-0000-0000-000000000004', 'in-person', 50, 6, 'forming',
   'Artists, musicians, and tinkerers swapping skills and showing works-in-progress. Monthly maker nights in Montrose.',
   29.7440, -95.3900, 'Montrose, Houston', (SELECT id FROM topical_channels WHERE slug = 'creative'),
   'https://picsum.photos/seed/montrose-makers/400/400')
ON CONFLICT (id) DO NOTHING;

-- ── One Portland circle ──────────────────────────────────────────────────────
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, member_count, status, about, latitude, longitude, neighborhood, topical_channel_id, image_url) VALUES
  ('55000000-0000-0000-0000-000000000010', 'Forest Park Trail Crew', 'forest-park-trail',
   '44000000-0000-0000-0000-000000000005', 'in-person', 50, 24, 'active',
   'Weekend trail runs and volunteer trail-keeping in Forest Park. Rain or shine — this is Portland, after all.',
   45.5786, -122.7160, 'Forest Park, Portland', (SELECT id FROM topical_channels WHERE slug = 'movement'),
   'https://picsum.photos/seed/forest-park-trail/400/400')
ON CONFLICT (id) DO NOTHING;
