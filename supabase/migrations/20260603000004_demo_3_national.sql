-- =====================================================================
-- Demo seed — VERTICAL 3: National network (Beta demo content)
-- =====================================================================
-- 16 Circles across 5 metros (Austin, Boulder, Asheville, Brooklyn, Bend),
-- ~90 demo members, their memberships, role-voiced posts, and upcoming
-- events. EVERY row sets is_demo = true so the whole vertical is purgeable
-- via  DELETE FROM <table> WHERE is_demo.
--
-- Idempotent: deterministic UUIDs everywhere + ON CONFLICT DO NOTHING
-- (and WHERE NOT EXISTS belt-and-braces on memberships). Safe to re-run.
--
-- DEPENDS ON 20260603000002 for the five metro "city" nexus_regions:
--     Austin    1100000a-0000-0000-0000-0000000000a1
--     Boulder   1100000a-0000-0000-0000-0000000000a2
--     Asheville 1100000a-0000-0000-0000-0000000000a3
--     Brooklyn  1100000a-0000-0000-0000-0000000000a4
--     Bend      1100000a-0000-0000-0000-0000000000a5
-- (this migration only REFERENCES them; it does not create them).
--
-- SCHEMA NOTES (verified against migrations + lib/database.types.ts):
--   * memberships INSERT fires trg_memberships_insert which does
--       UPDATE circles SET member_count = member_count + 1
--     => we DO NOT hand-set circles.member_count; the trigger derives the
--        real count from the memberships we insert below.
--   * circles.hub_id is nullable (hierarchy_v3); we leave it NULL. The
--     check_hub_circle_limit BEFORE-INSERT trigger early-returns when
--     hub_id IS NULL, so orphan demo circles insert cleanly.
--   * circles.geog is GENERATED STORED from latitude/longitude — omitted.
--   * profiles are auth-less demo rows: auth_user_id NULL, is_demo true,
--     is_active true. Surnames are "Demo"-variants (the tell); handles are
--     ASCII and unique.
--   * UUID prefixes: members d1…, circles d2…, posts d4…, events d5…
-- =====================================================================


-- =====================================================================
-- 1. CIRCLES (16) — hub_id NULL, status active, is_demo true
--    member_count intentionally left to the membership trigger.
-- =====================================================================

INSERT INTO circles (id, name, slug, hub_id, host_id, type, member_cap, status, about, city, neighborhood, latitude, longitude, topical_channel_id, image_url, is_demo) VALUES
  -- ── Austin ──
  ('d2000000-0000-0000-0000-0000000000a1', 'Barton Springs Plungers', 'barton-springs-plungers', NULL, NULL, 'in-person', 50, 'active',
   'Cold-water plungers who meet at the springs before work. Three breaths, then in. All temperatures welcome.',
   'Austin', 'Barton Springs', 30.264000, -97.771300, (SELECT id FROM topical_channels WHERE slug = 'holistic-health'), 'https://picsum.photos/seed/barton-springs-plungers/400/400', true),
  ('d2000000-0000-0000-0000-0000000000a2', 'East Austin Run Club', 'east-austin-run-club', NULL, NULL, 'in-person', 50, 'active',
   'A no-drop neighborhood run club looping the east side. Tuesdays and Saturdays, breakfast tacos after.',
   'Austin', 'East Austin', 30.264000, -97.720000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/east-austin-run-club/400/400', true),
  ('d2000000-0000-0000-0000-0000000000a3', 'Lady Bird Sunrise Yoga', 'lady-bird-sunrise-yoga', NULL, NULL, 'in-person', 50, 'active',
   'Donation-based sunrise yoga on the lawn by the lake. Bring a mat; leave a little lighter.',
   'Austin', 'Lady Bird Lake', 30.250000, -97.745000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/lady-bird-sunrise-yoga/400/400', true),
  ('d2000000-0000-0000-0000-0000000000a4', 'ATX Founders Breakfast', 'atx-founders-breakfast', NULL, NULL, 'in-person', 50, 'active',
   'Founders and builders trading honest notes over breakfast downtown. Mission-driven work, no pitching.',
   'Austin', 'Downtown', 30.267000, -97.743000, (SELECT id FROM topical_channels WHERE slug = 'business-support'), 'https://picsum.photos/seed/atx-founders-breakfast/400/400', true),

  -- ── Boulder ──
  ('d2000000-0000-0000-0000-0000000000b1', 'Flatirons Trail Tribe', 'flatirons-trail-tribe', NULL, NULL, 'in-person', 50, 'active',
   'Weekend trail runs and hikes up the Flatirons from Chautauqua. All paces, big views, coffee after.',
   'Boulder', 'Chautauqua', 39.999000, -105.282000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/flatirons-trail-tribe/400/400', true),
  ('d2000000-0000-0000-0000-0000000000b2', 'Pearl Street Breathwork', 'pearl-street-breathwork', NULL, NULL, 'in-person', 50, 'active',
   'Conscious-breathwork circles a few blocks off Pearl. Come as you are, breathe, land.',
   'Boulder', 'Pearl Street', 40.019000, -105.279000, (SELECT id FROM topical_channels WHERE slug = 'holistic-health'), 'https://picsum.photos/seed/pearl-street-breathwork/400/400', true),
  ('d2000000-0000-0000-0000-0000000000b3', 'Boulder Climbers Collective', 'boulder-climbers-collective', NULL, NULL, 'in-person', 50, 'active',
   'Climbers swapping beta, partners, and projects — gym sessions midweek, rock on weekends.',
   'Boulder', 'Boulder', 40.015000, -105.270000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/boulder-climbers-collective/400/400', true),

  -- ── Asheville ──
  ('d2000000-0000-0000-0000-0000000000c1', 'French Broad Cold Plunge', 'french-broad-cold-plunge', NULL, NULL, 'in-person', 50, 'active',
   'River plunges in the French Broad, year-round. We hold the cold together, then warm up with stories.',
   'Asheville', 'French Broad River', 35.579000, -82.568000, (SELECT id FROM topical_channels WHERE slug = 'holistic-health'), 'https://picsum.photos/seed/french-broad-cold-plunge/400/400', true),
  ('d2000000-0000-0000-0000-0000000000c2', 'Blue Ridge Hikers', 'blue-ridge-hikers', NULL, NULL, 'in-person', 50, 'active',
   'Day hikes on the Blue Ridge ridgelines. No-drop pace, good company, mountain air.',
   'Asheville', 'Asheville', 35.595000, -82.551000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/blue-ridge-hikers/400/400', true),
  ('d2000000-0000-0000-0000-0000000000c3', 'Asheville Sound Healing', 'asheville-sound-healing', NULL, NULL, 'in-person', 50, 'active',
   'Sound baths in the River Arts District — bowls, gongs, and rest. Bring a blanket and surrender.',
   'Asheville', 'River Arts District', 35.586000, -82.568000, (SELECT id FROM topical_channels WHERE slug = 'spirituality'), 'https://picsum.photos/seed/asheville-sound-healing/400/400', true),

  -- ── Brooklyn ──
  ('d2000000-0000-0000-0000-0000000000d1', 'Prospect Park Run Club', 'prospect-park-run-club', NULL, NULL, 'in-person', 50, 'active',
   'Loops of Prospect Park at dawn, every pace welcome. Coffee at the meet-up cart after.',
   'Brooklyn', 'Prospect Park', 40.660200, -73.969000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/prospect-park-run-club/400/400', true),
  ('d2000000-0000-0000-0000-0000000000d2', 'Williamsburg Breathwork', 'williamsburg-breathwork', NULL, NULL, 'in-person', 50, 'active',
   'Breathwork circles in a Williamsburg loft. Nervous-system reset for the city-frazzled.',
   'Brooklyn', 'Williamsburg', 40.708000, -73.957000, (SELECT id FROM topical_channels WHERE slug = 'holistic-health'), 'https://picsum.photos/seed/williamsburg-breathwork/400/400', true),
  ('d2000000-0000-0000-0000-0000000000d3', 'Bushwick Makers', 'bushwick-makers', NULL, NULL, 'in-person', 50, 'active',
   'Artists, musicians, and tinkerers swapping skills and showing works-in-progress. Monthly maker nights.',
   'Brooklyn', 'Bushwick', 40.694000, -73.921000, (SELECT id FROM topical_channels WHERE slug = 'creative'), 'https://picsum.photos/seed/bushwick-makers/400/400', true),

  -- ── Bend ──
  ('d2000000-0000-0000-0000-0000000000e1', 'Deschutes Trail Runners', 'deschutes-trail-runners', NULL, NULL, 'in-person', 50, 'active',
   'Trail runs along the Deschutes River, rain or shine. All paces, post-run riverside stretch.',
   'Bend', 'Deschutes River', 44.058000, -121.315000, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/deschutes-trail-runners/400/400', true),
  ('d2000000-0000-0000-0000-0000000000e2', 'Bend Sunrise Yoga', 'bend-sunrise-yoga', NULL, NULL, 'in-person', 50, 'active',
   'Sunrise yoga to start the high-desert day grounded. Mats and beginners always welcome.',
   'Bend', 'Bend', 44.058200, -121.315300, (SELECT id FROM topical_channels WHERE slug = 'movement'), 'https://picsum.photos/seed/bend-sunrise-yoga/400/400', true),
  ('d2000000-0000-0000-0000-0000000000e3', 'High Desert Sound Bath', 'high-desert-sound-bath', NULL, NULL, 'in-person', 50, 'active',
   'Evening sound baths under the high-desert sky. Deep rest, deep listening.',
   'Bend', 'Bend', 44.052000, -121.300000, (SELECT id FROM topical_channels WHERE slug = 'holistic-health'), 'https://picsum.photos/seed/high-desert-sound-bath/400/400', true)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- 2. MEMBERS (~90 profiles) — auth-less demo rows.
--    One 'host' per circle (the leader, set as circles.host_id below),
--    plus crew / guide / mentor sprinkled in; the rest 'member'.
--    nexus_region_id = the member's metro city region.
--    Leaders/guides/mentors carry higher zaps/gems/streak for leaderboards.
-- =====================================================================

INSERT INTO profiles (id, auth_user_id, display_name, handle, community_role, nexus_region_id, bio, avatar_url, current_season_zaps, lifetime_gems, current_streak, last_seen_at, is_active, is_demo) VALUES
  -- ===== AUSTIN — Barton Springs Plungers (d2…a1) =====
  ('d1000000-0000-0000-0000-0000000a1001', NULL, 'Marcus Demonski', 'marcus_demonski', 'host',   '1100000a-0000-0000-0000-0000000000a1', 'Cold water, warm people. Leading the morning plunge since the first frost.', 'https://i.pravatar.cc/240?u=marcus_demonski', 940, 610, 21, now() - interval '4 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000a1002', NULL, 'Priya Demova',     'priya_demova',     'crew',   '1100000a-0000-0000-0000-0000000000a1', 'Keeper of the towel pile and the post-plunge coffee run.',                    'https://i.pravatar.cc/240?u=priya_demova',     410, 220, 12, now() - interval '2 hours',    true, true),
  ('d1000000-0000-0000-0000-0000000a1003', NULL, 'Tomas Demir',      'tomas_demir',      'member', '1100000a-0000-0000-0000-0000000000a1', 'Three breaths and in. Still working up to a full minute.',                    'https://i.pravatar.cc/240?u=tomas_demir',      120,  40,  3, now() - interval '1 day',      true, true),
  ('d1000000-0000-0000-0000-0000000a1004', NULL, 'Hannah Demsky',    'hannah_demsky',    'member', '1100000a-0000-0000-0000-0000000000a1', 'Here for the nervous-system reset and the sunrise.',                          NULL,                                            90,  30,  5, now() - interval '6 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000a1005', NULL, 'Diego Demarchi',   'diego_demarchi',   'member', '1100000a-0000-0000-0000-0000000000a1', 'Plunge first, decide everything else after.',                                'https://i.pravatar.cc/240?u=diego_demarchi',    60,  20,  2, now() - interval '3 days',      true, true),
  ('d1000000-0000-0000-0000-0000000a1006', NULL, 'Sofia Demby',      'sofia_demby',      'guide',  '1100000a-0000-0000-0000-0000000000a1', 'Breath coach. I help people meet the cold without bracing against it.',       'https://i.pravatar.cc/240?u=sofia_demby',      520, 340, 16, now() - interval '5 minutes',  true, true),

  -- ===== AUSTIN — East Austin Run Club (d2…a2) =====
  ('d1000000-0000-0000-0000-0000000a2001', NULL, 'Jamal Demonte',    'jamal_demonte',    'host',   '1100000a-0000-0000-0000-0000000000a1', 'Pace-pusher and taco-finder. No one runs alone on the east side.',            'https://i.pravatar.cc/240?u=jamal_demonte',    910, 580, 19, now() - interval '8 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000a2002', NULL, 'Elena Demula',     'elena_demula',     'crew',   '1100000a-0000-0000-0000-0000000000a1', 'Sweeper at the back so nobody gets dropped.',                                 'https://i.pravatar.cc/240?u=elena_demula',     380, 210, 11, now() - interval '1 hour',     true, true),
  ('d1000000-0000-0000-0000-0000000a2003', NULL, 'Wes Demko',        'wes_demko',        'member', '1100000a-0000-0000-0000-0000000000a1', 'Couch-to-5k graduate, taco enthusiast.',                                      NULL,                                           110,  35,  4, now() - interval '2 days',      true, true),
  ('d1000000-0000-0000-0000-0000000a2004', NULL, 'Nina Demidov',     'nina_demidov',     'member', '1100000a-0000-0000-0000-0000000000a1', 'Tuesdays and Saturdays, rain or shine.',                                      'https://i.pravatar.cc/240?u=nina_demidov',      80,  25,  6, now() - interval '7 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000a2005', NULL, 'Carlos Demmel',    'carlos_demmel',    'member', '1100000a-0000-0000-0000-0000000000a1', 'Slow miles, good company.',                                                   'https://i.pravatar.cc/240?u=carlos_demmel',     55,  18,  1, now() - interval '4 days',      true, true),

  -- ===== AUSTIN — Lady Bird Sunrise Yoga (d2…a3) =====
  ('d1000000-0000-0000-0000-0000000a3001', NULL, 'Aisha Demonova',   'aisha_demonova',   'host',   '1100000a-0000-0000-0000-0000000000a1', 'Teaching by the lake at first light. Breath, then movement.',                 'https://i.pravatar.cc/240?u=aisha_demonova',   880, 600, 24, now() - interval '3 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000a3002', NULL, 'Ben Demarchi',     'ben_demarchi',     'crew',   '1100000a-0000-0000-0000-0000000000a1', 'Mat-roller, playlist-maker, donation-jar guardian.',                          NULL,                                           360, 200, 10, now() - interval '3 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000a3003', NULL, 'Lucia Demsky',     'lucia_demsky',     'member', '1100000a-0000-0000-0000-0000000000a1', 'Came for the stretch, stayed for the sunrise.',                               'https://i.pravatar.cc/240?u=lucia_demsky',      95,  30,  7, now() - interval '5 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000a3004', NULL, 'Oliver Demko',     'oliver_demko',     'member', '1100000a-0000-0000-0000-0000000000a1', 'Tight hamstrings, open heart.',                                               'https://i.pravatar.cc/240?u=oliver_demko',      70,  22,  3, now() - interval '1 day',       true, true),
  ('d1000000-0000-0000-0000-0000000a3005', NULL, 'Mei Demova',       'mei_demova',        'member', '1100000a-0000-0000-0000-0000000000a1', 'Beginner and proud of it.',                                                   NULL,                                            50,  15,  2, now() - interval '6 days',      true, true),
  ('d1000000-0000-0000-0000-0000000a3006', NULL, 'Grace Demmel',     'grace_demmel',     'mentor', '1100000a-0000-0000-0000-0000000000a1', 'Twenty years on the mat. Holding space for the next generation of teachers.', 'https://i.pravatar.cc/240?u=grace_demmel',     640, 480, 31, now() - interval '20 minutes', true, true),

  -- ===== AUSTIN — ATX Founders Breakfast (d2…a4) =====
  ('d1000000-0000-0000-0000-0000000a4001', NULL, 'Ravi Demonski',    'ravi_demonski',    'host',   '1100000a-0000-0000-0000-0000000000a1', 'Two-time founder. I host the table where we tell the truth about building.',  'https://i.pravatar.cc/240?u=ravi_demonski',    900, 590, 18, now() - interval '12 minutes', true, true),
  ('d1000000-0000-0000-0000-0000000a4002', NULL, 'Kara Demby',       'kara_demby',       'crew',   '1100000a-0000-0000-0000-0000000000a1', 'Keeps the intros tight and the coffee hot.',                                  'https://i.pravatar.cc/240?u=kara_demby',       370, 205,  9, now() - interval '2 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000a4003', NULL, 'Sam Demonte',      'sam_demonte',      'member', '1100000a-0000-0000-0000-0000000000a1', 'Bootstrapping a small SaaS, here for the honest notes.',                      NULL,                                           100,  32,  4, now() - interval '8 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000a4004', NULL, 'Talia Demir',      'talia_demir',      'member', '1100000a-0000-0000-0000-0000000000a1', 'Solo founder. Coffee, mission, repeat.',                                      'https://i.pravatar.cc/240?u=talia_demir',       65,  20,  2, now() - interval '3 days',      true, true),
  ('d1000000-0000-0000-0000-0000000a4005', NULL, 'Noah Demidov',     'noah_demidov',     'member', '1100000a-0000-0000-0000-0000000000a1', 'Building in public, learning out loud.',                                      'https://i.pravatar.cc/240?u=noah_demidov',      45,  14,  1, now() - interval '5 days',      true, true),

  -- ===== BOULDER — Flatirons Trail Tribe (d2…b1) =====
  ('d1000000-0000-0000-0000-0000000b1001', NULL, 'Fiona Demonov',    'fiona_demonov',    'host',   '1100000a-0000-0000-0000-0000000000a2', 'I know every switchback up the Flatirons. Come find your big-view morning.',  'https://i.pravatar.cc/240?u=fiona_demonov',    930, 605, 22, now() - interval '6 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000b1002', NULL, 'Erik Demsky',      'erik_demsky',      'crew',   '1100000a-0000-0000-0000-0000000000a2', 'Trail-marshal and snack-sherpa.',                                             NULL,                                           390, 215, 13, now() - interval '1 hour',      true, true),
  ('d1000000-0000-0000-0000-0000000b1003', NULL, 'Maya Demula',      'maya_demula',      'member', '1100000a-0000-0000-0000-0000000000a2', 'Flatlander turned trail addict.',                                             'https://i.pravatar.cc/240?u=maya_demula',      105,  34,  5, now() - interval '4 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000b1004', NULL, 'Liam Demko',       'liam_demko',       'member', '1100000a-0000-0000-0000-0000000000a2', 'Here for the altitude and the quiet.',                                        'https://i.pravatar.cc/240?u=liam_demko',        75,  24,  3, now() - interval '2 days',      true, true),
  ('d1000000-0000-0000-0000-0000000b1005', NULL, 'Zoe Demmel',       'zoe_demmel',       'member', '1100000a-0000-0000-0000-0000000000a2', 'Slow up, fast down.',                                                         NULL,                                            60,  19,  2, now() - interval '7 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000b1006', NULL, 'Anders Demonte',   'anders_demonte',   'guide',  '1100000a-0000-0000-0000-0000000000a2', 'Mountain guide. I teach people to read weather and pace themselves.',         'https://i.pravatar.cc/240?u=anders_demonte',   560, 360, 17, now() - interval '15 minutes', true, true),

  -- ===== BOULDER — Pearl Street Breathwork (d2…b2) =====
  ('d1000000-0000-0000-0000-0000000b2001', NULL, 'Indira Demova',    'indira_demova',    'host',   '1100000a-0000-0000-0000-0000000000a2', 'Facilitator. I hold the room so you can let go in it.',                       'https://i.pravatar.cc/240?u=indira_demova',    870, 595, 20, now() - interval '9 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000b2002', NULL, 'Paul Demby',       'paul_demby',       'crew',   '1100000a-0000-0000-0000-0000000000a2', 'Bolster-stacker and candle-lighter.',                                         NULL,                                           340, 195,  8, now() - interval '3 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000b2003', NULL, 'Renata Demir',     'renata_demir',     'member', '1100000a-0000-0000-0000-0000000000a2', 'First breathwork was a revelation. Back every week now.',                     'https://i.pravatar.cc/240?u=renata_demir',      88,  28,  6, now() - interval '5 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000b2004', NULL, 'Caleb Demidov',    'caleb_demidov',    'member', '1100000a-0000-0000-0000-0000000000a2', 'Trading screen time for breath time.',                                        'https://i.pravatar.cc/240?u=caleb_demidov',     58,  18,  2, now() - interval '2 days',      true, true),
  ('d1000000-0000-0000-0000-0000000b2005', NULL, 'Yara Demsky',      'yara_demsky',      'member', '1100000a-0000-0000-0000-0000000000a2', 'Come as you are, breathe, land.',                                             NULL,                                            42,  13,  1, now() - interval '4 days',      true, true),

  -- ===== BOULDER — Boulder Climbers Collective (d2…b3) =====
  ('d1000000-0000-0000-0000-0000000b3001', NULL, 'Devon Demonski',   'devon_demonski',   'host',   '1100000a-0000-0000-0000-0000000000a2', 'Project-finder and belay-trust-builder. Bring your beta and your psych.',     'https://i.pravatar.cc/240?u=devon_demonski',   895, 585, 17, now() - interval '7 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000b3002', NULL, 'Ingrid Demarchi',  'ingrid_demarchi',  'crew',   '1100000a-0000-0000-0000-0000000000a2', 'Partner-matchmaker — never climb alone.',                                     'https://i.pravatar.cc/240?u=ingrid_demarchi',   355, 198, 10, now() - interval '2 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000b3003', NULL, 'Hugo Demmel',      'hugo_demmel',      'member', '1100000a-0000-0000-0000-0000000000a2', 'Plastic in the week, rock on weekends.',                                      NULL,                                            92,  29,  4, now() - interval '6 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000b3004', NULL, 'Sana Demby',       'sana_demby',       'member', '1100000a-0000-0000-0000-0000000000a2', 'Slab climber, proud of it.',                                                  'https://i.pravatar.cc/240?u=sana_demby',        68,  21,  3, now() - interval '1 day',       true, true),
  ('d1000000-0000-0000-0000-0000000b3005', NULL, 'Theo Demonte',     'theo_demonte',     'member', '1100000a-0000-0000-0000-0000000000a2', 'Still scared of heights, still showing up.',                                  'https://i.pravatar.cc/240?u=theo_demonte',      48,  15,  2, now() - interval '3 days',      true, true),

  -- ===== ASHEVILLE — French Broad Cold Plunge (d2…c1) =====
  ('d1000000-0000-0000-0000-0000000c1001', NULL, 'Willa Demonova',   'willa_demonova',   'host',   '1100000a-0000-0000-0000-0000000000a3', 'River-keeper of the plunge. We hold the cold together, year-round.',          'https://i.pravatar.cc/240?u=willa_demonova',   920, 600, 23, now() - interval '5 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000c1002', NULL, 'Gabe Demsky',      'gabe_demsky',      'crew',   '1100000a-0000-0000-0000-0000000000a3', 'Watches the current and counts heads.',                                       NULL,                                           375, 208, 11, now() - interval '1 hour',      true, true),
  ('d1000000-0000-0000-0000-0000000c1003', NULL, 'Rosa Demula',      'rosa_demula',      'member', '1100000a-0000-0000-0000-0000000000a3', 'The river taught me to breathe slow.',                                        'https://i.pravatar.cc/240?u=rosa_demula',       98,  31,  5, now() - interval '4 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000c1004', NULL, 'Owen Demir',       'owen_demir',       'member', '1100000a-0000-0000-0000-0000000000a3', 'Winter plunges hit different.',                                               'https://i.pravatar.cc/240?u=owen_demir',        72,  23,  4, now() - interval '8 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000c1005', NULL, 'Beatriz Demmel',   'beatriz_demmel',   'member', '1100000a-0000-0000-0000-0000000000a3', 'Came once on a dare, never stopped.',                                         NULL,                                            54,  17,  2, now() - interval '2 days',      true, true),

  -- ===== ASHEVILLE — Blue Ridge Hikers (d2…c2) =====
  ('d1000000-0000-0000-0000-0000000c2001', NULL, 'Silas Demonte',    'silas_demonte',    'host',   '1100000a-0000-0000-0000-0000000000a3', 'Ridgeline regular. I lead the no-drop hikes and learn everyone''s name.',      'https://i.pravatar.cc/240?u=silas_demonte',    885, 588, 19, now() - interval '10 minutes', true, true),
  ('d1000000-0000-0000-0000-0000000c2002', NULL, 'Naomi Demby',      'naomi_demby',      'crew',   '1100000a-0000-0000-0000-0000000000a3', 'Map-reader and snack-sharer.',                                                'https://i.pravatar.cc/240?u=naomi_demby',      350, 196,  9, now() - interval '3 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000c2003', NULL, 'Eli Demkov',       'eli_demkov',       'member', '1100000a-0000-0000-0000-0000000000a3', 'Mountain air fixes most things.',                                             NULL,                                            85,  27,  4, now() - interval '5 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000c2004', NULL, 'Dana Demova',      'dana_demova',      'member', '1100000a-0000-0000-0000-0000000000a3', 'Slow hiker, fast friend-maker.',                                              'https://i.pravatar.cc/240?u=dana_demova',       62,  20,  3, now() - interval '1 day',       true, true),
  ('d1000000-0000-0000-0000-0000000c2005', NULL, 'Mateo Demsky',     'mateo_demsky',     'member', '1100000a-0000-0000-0000-0000000000a3', 'Here for the views and the good company.',                                    'https://i.pravatar.cc/240?u=mateo_demsky',      47,  15,  1, now() - interval '4 days',      true, true),

  -- ===== ASHEVILLE — Asheville Sound Healing (d2…c3) =====
  ('d1000000-0000-0000-0000-0000000c3001', NULL, 'Luna Demonski',    'luna_demonski',    'host',   '1100000a-0000-0000-0000-0000000000a3', 'Bowls, gongs, and rest. I hold the sound space in the River Arts District.',  'https://i.pravatar.cc/240?u=luna_demonski',    875, 592, 21, now() - interval '6 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000c3002', NULL, 'Cyrus Demir',      'cyrus_demir',      'crew',   '1100000a-0000-0000-0000-0000000000a3', 'Sets the blankets, dims the lights.',                                         NULL,                                           345, 194,  8, now() - interval '2 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000c3003', NULL, 'Ivy Demmel',       'ivy_demmel',       'member', '1100000a-0000-0000-0000-0000000000a3', 'I leave every sound bath lighter than I came.',                               'https://i.pravatar.cc/240?u=ivy_demmel',        80,  26,  5, now() - interval '7 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000c3004', NULL, 'Felix Demby',      'felix_demby',      'member', '1100000a-0000-0000-0000-0000000000a3', 'Skeptic turned believer in the gong.',                                        NULL,                                            56,  18,  2, now() - interval '3 days',      true, true),
  ('d1000000-0000-0000-0000-0000000c3005', NULL, 'Esme Demonte',     'esme_demonte',     'mentor', '1100000a-0000-0000-0000-0000000000a3', 'Longtime sound practitioner. Mentoring the new facilitators here.',           'https://i.pravatar.cc/240?u=esme_demonte',     620, 470, 28, now() - interval '25 minutes', true, true),

  -- ===== BROOKLYN — Prospect Park Run Club (d2…d1) =====
  ('d1000000-0000-0000-0000-0000000d1001', NULL, 'Andre Demonov',    'andre_demonov',    'host',   '1100000a-0000-0000-0000-0000000000a4', 'Dawn loops of the park, every pace welcome. I make sure no one runs alone.',  'https://i.pravatar.cc/240?u=andre_demonov',    915, 598, 20, now() - interval '4 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000d1002', NULL, 'Keisha Demula',    'keisha_demula',    'crew',   '1100000a-0000-0000-0000-0000000000a4', 'Coffee-cart liaison and back-of-pack cheerleader.',                           'https://i.pravatar.cc/240?u=keisha_demula',    385, 212, 12, now() - interval '1 hour',      true, true),
  ('d1000000-0000-0000-0000-0000000d1003', NULL, 'Vik Demidov',      'vik_demidov',      'member', '1100000a-0000-0000-0000-0000000000a4', 'Running off the subway commute.',                                             NULL,                                           102,  33,  5, now() - interval '5 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000d1004', NULL, 'Joan Demsky',      'joan_demsky',      'member', '1100000a-0000-0000-0000-0000000000a4', 'Park loops at sunrise, best part of my day.',                                 'https://i.pravatar.cc/240?u=joan_demsky',       78,  25,  4, now() - interval '8 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000d1005', NULL, 'Rashid Demko',     'rashid_demko',     'member', '1100000a-0000-0000-0000-0000000000a4', 'Slow and steady, every Saturday.',                                            'https://i.pravatar.cc/240?u=rashid_demko',      52,  16,  2, now() - interval '2 days',      true, true),
  ('d1000000-0000-0000-0000-0000000d1006', NULL, 'Greta Demova',     'greta_demova',     'member', '1100000a-0000-0000-0000-0000000000a4', 'Couch-to-park-loop, in progress.',                                            NULL,                                            44,  14,  1, now() - interval '6 days',      true, true),

  -- ===== BROOKLYN — Williamsburg Breathwork (d2…d2) =====
  ('d1000000-0000-0000-0000-0000000d2001', NULL, 'Asha Demonova',    'asha_demonova',    'host',   '1100000a-0000-0000-0000-0000000000a4', 'Loft facilitator. A nervous-system reset for the city-frazzled.',             'https://i.pravatar.cc/240?u=asha_demonova',    860, 590, 18, now() - interval '11 minutes', true, true),
  ('d1000000-0000-0000-0000-0000000d2002', NULL, 'Pavel Demsky',     'pavel_demsky',     'crew',   '1100000a-0000-0000-0000-0000000000a4', 'Door-greeter and mat-arranger.',                                              NULL,                                           335, 192,  7, now() - interval '3 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000d2003', NULL, 'Margot Demir',     'margot_demir',     'member', '1100000a-0000-0000-0000-0000000000a4', 'Breathing my way out of the city hum.',                                       'https://i.pravatar.cc/240?u=margot_demir',      82,  26,  5, now() - interval '5 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000d2004', NULL, 'Hassan Demmel',    'hassan_demmel',    'member', '1100000a-0000-0000-0000-0000000000a4', 'Came skeptical, left calm.',                                                  'https://i.pravatar.cc/240?u=hassan_demmel',     57,  18,  3, now() - interval '1 day',       true, true),
  ('d1000000-0000-0000-0000-0000000d2005', NULL, 'Lena Demby',       'lena_demby',       'member', '1100000a-0000-0000-0000-0000000000a4', 'Weekly reset, non-negotiable now.',                                           NULL,                                            46,  15,  2, now() - interval '4 days',      true, true),

  -- ===== BROOKLYN — Bushwick Makers (d2…d3) =====
  ('d1000000-0000-0000-0000-0000000d3001', NULL, 'Jonah Demonte',    'jonah_demonte',    'host',   '1100000a-0000-0000-0000-0000000000a4', 'I run the maker nights — bring a work-in-progress, leave with new collaborators.', 'https://i.pravatar.cc/240?u=jonah_demonte', 890, 586, 16, now() - interval '8 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000d3002', NULL, 'Camila Demova',    'camila_demova',    'crew',   '1100000a-0000-0000-0000-0000000000a4', 'Wrangles the tools, the snacks, and the sign-up sheet.',                      'https://i.pravatar.cc/240?u=camila_demova',    348, 195,  9, now() - interval '2 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000d3003', NULL, 'Reuben Demsky',    'reuben_demsky',    'member', '1100000a-0000-0000-0000-0000000000a4', 'Screen-printer showing rough drafts.',                                        NULL,                                            84,  27,  4, now() - interval '6 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000d3004', NULL, 'Aiko Demko',       'aiko_demko',       'member', '1100000a-0000-0000-0000-0000000000a4', 'Synth-builder, perpetual tinkerer.',                                          'https://i.pravatar.cc/240?u=aiko_demko',        61,  20,  3, now() - interval '2 days',      true, true),
  ('d1000000-0000-0000-0000-0000000d3005', NULL, 'Marco Demidov',    'marco_demidov',    'member', '1100000a-0000-0000-0000-0000000000a4', 'Here to make things and meet makers.',                                        NULL,                                            45,  14,  1, now() - interval '5 days',      true, true),

  -- ===== BEND — Deschutes Trail Runners (d2…e1) =====
  ('d1000000-0000-0000-0000-0000000e1001', NULL, 'Skye Demonski',    'skye_demonski',    'host',   '1100000a-0000-0000-0000-0000000000a5', 'River-trail regular. Rain or shine, we run and stretch by the water after.',  'https://i.pravatar.cc/240?u=skye_demonski',    905, 596, 22, now() - interval '5 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000e1002', NULL, 'Garrett Demula',   'garrett_demula',   'crew',   '1100000a-0000-0000-0000-0000000000a5', 'Route-setter and sweep.',                                                     NULL,                                           382, 210, 12, now() - interval '1 hour',      true, true),
  ('d1000000-0000-0000-0000-0000000e1003', NULL, 'Priscilla Demir',  'priscilla_demir',  'member', '1100000a-0000-0000-0000-0000000000a5', 'High-desert miles, low-key vibes.',                                           'https://i.pravatar.cc/240?u=priscilla_demir',   96,  31,  5, now() - interval '4 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000e1004', NULL, 'Cole Demmel',      'cole_demmel',      'member', '1100000a-0000-0000-0000-0000000000a5', 'New to trails, hooked already.',                                              'https://i.pravatar.cc/240?u=cole_demmel',       70,  22,  3, now() - interval '1 day',       true, true),
  ('d1000000-0000-0000-0000-0000000e1005', NULL, 'Iris Demby',       'iris_demby',       'member', '1100000a-0000-0000-0000-0000000000a5', 'Riverside stretch is my favorite part.',                                      NULL,                                            53,  17,  2, now() - interval '3 days',      true, true),
  ('d1000000-0000-0000-0000-0000000e1006', NULL, 'Hollis Demonte',   'hollis_demonte',   'guide',  '1100000a-0000-0000-0000-0000000000a5', 'Run coach. I help runners build to distance without burning out.',            'https://i.pravatar.cc/240?u=hollis_demonte',   545, 355, 18, now() - interval '14 minutes', true, true),

  -- ===== BEND — Bend Sunrise Yoga (d2…e2) =====
  ('d1000000-0000-0000-0000-0000000e2001', NULL, 'Wren Demonova',    'wren_demonova',    'host',   '1100000a-0000-0000-0000-0000000000a5', 'First-light yoga to start the high-desert day grounded. Beginners welcome.',  'https://i.pravatar.cc/240?u=wren_demonova',    868, 590, 20, now() - interval '7 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000e2002', NULL, 'Dmitri Demsky',    'dmitri_demsky',    'crew',   '1100000a-0000-0000-0000-0000000000a5', 'Mat-counter and tea-brewer.',                                                 NULL,                                           338, 193,  8, now() - interval '3 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000e2003', NULL, 'Hana Demir',       'hana_demir',       'member', '1100000a-0000-0000-0000-0000000000a5', 'Sunrise on the mat beats coffee.',                                            'https://i.pravatar.cc/240?u=hana_demir',        81,  26,  5, now() - interval '5 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000e2004', NULL, 'Brent Demko',      'brent_demko',      'member', '1100000a-0000-0000-0000-0000000000a5', 'Stiff in the morning, loose by the end.',                                     NULL,                                            58,  18,  3, now() - interval '2 days',      true, true),
  ('d1000000-0000-0000-0000-0000000e2005', NULL, 'Saoirse Demova',   'saoirse_demova',   'member', '1100000a-0000-0000-0000-0000000000a5', 'Grounded before the day starts.',                                             'https://i.pravatar.cc/240?u=saoirse_demova',    47,  15,  1, now() - interval '4 days',      true, true),

  -- ===== BEND — High Desert Sound Bath (d2…e3) =====
  ('d1000000-0000-0000-0000-0000000e3001', NULL, 'Orion Demonte',    'orion_demonte',    'host',   '1100000a-0000-0000-0000-0000000000a5', 'Evening sound baths under the desert sky. Deep rest, deep listening.',        'https://i.pravatar.cc/240?u=orion_demonte',    878, 593, 21, now() - interval '6 minutes',  true, true),
  ('d1000000-0000-0000-0000-0000000e3002', NULL, 'Galina Demby',     'galina_demby',     'crew',   '1100000a-0000-0000-0000-0000000000a5', 'Sets the space and holds the door.',                                          NULL,                                           342, 194,  8, now() - interval '2 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000e3003', NULL, 'Tobias Demmel',    'tobias_demmel',    'member', '1100000a-0000-0000-0000-0000000000a5', 'The bowls reset something in me every time.',                                 'https://i.pravatar.cc/240?u=tobias_demmel',     79,  25,  4, now() - interval '7 hours',     true, true),
  ('d1000000-0000-0000-0000-0000000e3004', NULL, 'Mira Demsky',      'mira_demsky',      'member', '1100000a-0000-0000-0000-0000000000a5', 'Came for rest, found stillness.',                                             NULL,                                            55,  17,  2, now() - interval '3 days',      true, true),
  ('d1000000-0000-0000-0000-0000000e3005', NULL, 'Ø Vance Demo',     'vance_demo',       'member', '1100000a-0000-0000-0000-0000000000a5', 'High-desert sky, low-frequency hum, total peace.',                            'https://i.pravatar.cc/240?u=vance_demo',        48,  15,  1, now() - interval '5 days',      true, true)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- 3. Set each circle's host_id to its leader profile.
--    (Done as UPDATE so circle inserts above stay independent / re-runnable.)
-- =====================================================================

UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000a1001' WHERE id = 'd2000000-0000-0000-0000-0000000000a1';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000a2001' WHERE id = 'd2000000-0000-0000-0000-0000000000a2';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000a3001' WHERE id = 'd2000000-0000-0000-0000-0000000000a3';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000a4001' WHERE id = 'd2000000-0000-0000-0000-0000000000a4';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000b1001' WHERE id = 'd2000000-0000-0000-0000-0000000000b1';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000b2001' WHERE id = 'd2000000-0000-0000-0000-0000000000b2';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000b3001' WHERE id = 'd2000000-0000-0000-0000-0000000000b3';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000c1001' WHERE id = 'd2000000-0000-0000-0000-0000000000c1';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000c2001' WHERE id = 'd2000000-0000-0000-0000-0000000000c2';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000c3001' WHERE id = 'd2000000-0000-0000-0000-0000000000c3';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000d1001' WHERE id = 'd2000000-0000-0000-0000-0000000000d1';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000d2001' WHERE id = 'd2000000-0000-0000-0000-0000000000d2';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000d3001' WHERE id = 'd2000000-0000-0000-0000-0000000000d3';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000e1001' WHERE id = 'd2000000-0000-0000-0000-0000000000e1';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000e2001' WHERE id = 'd2000000-0000-0000-0000-0000000000e2';
UPDATE circles SET host_id = 'd1000000-0000-0000-0000-0000000e3001' WHERE id = 'd2000000-0000-0000-0000-0000000000e3';


-- =====================================================================
-- 4. MEMBERSHIPS — each member joins their circle.
--    volunteer_role = community_role (NULL for plain 'member').
--    INSERT fires trg_memberships_insert => circles.member_count is
--    derived automatically; do NOT set it by hand.
--    WHERE NOT EXISTS + UNIQUE(profile_id, circle_id) keeps it idempotent.
-- =====================================================================

INSERT INTO memberships (profile_id, circle_id, volunteer_role, status)
SELECT p.id, c.id, p.volunteer_role, 'active'::membership_status
FROM (VALUES
  -- Austin · Barton Springs Plungers
  ('d1000000-0000-0000-0000-0000000a1001'::uuid, 'd2000000-0000-0000-0000-0000000000a1'::uuid, 'host'::community_role),
  ('d1000000-0000-0000-0000-0000000a1002', 'd2000000-0000-0000-0000-0000000000a1', 'crew'),
  ('d1000000-0000-0000-0000-0000000a1003', 'd2000000-0000-0000-0000-0000000000a1', NULL),
  ('d1000000-0000-0000-0000-0000000a1004', 'd2000000-0000-0000-0000-0000000000a1', NULL),
  ('d1000000-0000-0000-0000-0000000a1005', 'd2000000-0000-0000-0000-0000000000a1', NULL),
  ('d1000000-0000-0000-0000-0000000a1006', 'd2000000-0000-0000-0000-0000000000a1', 'guide'),
  -- Austin · East Austin Run Club
  ('d1000000-0000-0000-0000-0000000a2001', 'd2000000-0000-0000-0000-0000000000a2', 'host'),
  ('d1000000-0000-0000-0000-0000000a2002', 'd2000000-0000-0000-0000-0000000000a2', 'crew'),
  ('d1000000-0000-0000-0000-0000000a2003', 'd2000000-0000-0000-0000-0000000000a2', NULL),
  ('d1000000-0000-0000-0000-0000000a2004', 'd2000000-0000-0000-0000-0000000000a2', NULL),
  ('d1000000-0000-0000-0000-0000000a2005', 'd2000000-0000-0000-0000-0000000000a2', NULL),
  -- Austin · Lady Bird Sunrise Yoga
  ('d1000000-0000-0000-0000-0000000a3001', 'd2000000-0000-0000-0000-0000000000a3', 'host'),
  ('d1000000-0000-0000-0000-0000000a3002', 'd2000000-0000-0000-0000-0000000000a3', 'crew'),
  ('d1000000-0000-0000-0000-0000000a3003', 'd2000000-0000-0000-0000-0000000000a3', NULL),
  ('d1000000-0000-0000-0000-0000000a3004', 'd2000000-0000-0000-0000-0000000000a3', NULL),
  ('d1000000-0000-0000-0000-0000000a3005', 'd2000000-0000-0000-0000-0000000000a3', NULL),
  ('d1000000-0000-0000-0000-0000000a3006', 'd2000000-0000-0000-0000-0000000000a3', 'mentor'),
  -- Austin · ATX Founders Breakfast
  ('d1000000-0000-0000-0000-0000000a4001', 'd2000000-0000-0000-0000-0000000000a4', 'host'),
  ('d1000000-0000-0000-0000-0000000a4002', 'd2000000-0000-0000-0000-0000000000a4', 'crew'),
  ('d1000000-0000-0000-0000-0000000a4003', 'd2000000-0000-0000-0000-0000000000a4', NULL),
  ('d1000000-0000-0000-0000-0000000a4004', 'd2000000-0000-0000-0000-0000000000a4', NULL),
  ('d1000000-0000-0000-0000-0000000a4005', 'd2000000-0000-0000-0000-0000000000a4', NULL),
  -- Boulder · Flatirons Trail Tribe
  ('d1000000-0000-0000-0000-0000000b1001', 'd2000000-0000-0000-0000-0000000000b1', 'host'),
  ('d1000000-0000-0000-0000-0000000b1002', 'd2000000-0000-0000-0000-0000000000b1', 'crew'),
  ('d1000000-0000-0000-0000-0000000b1003', 'd2000000-0000-0000-0000-0000000000b1', NULL),
  ('d1000000-0000-0000-0000-0000000b1004', 'd2000000-0000-0000-0000-0000000000b1', NULL),
  ('d1000000-0000-0000-0000-0000000b1005', 'd2000000-0000-0000-0000-0000000000b1', NULL),
  ('d1000000-0000-0000-0000-0000000b1006', 'd2000000-0000-0000-0000-0000000000b1', 'guide'),
  -- Boulder · Pearl Street Breathwork
  ('d1000000-0000-0000-0000-0000000b2001', 'd2000000-0000-0000-0000-0000000000b2', 'host'),
  ('d1000000-0000-0000-0000-0000000b2002', 'd2000000-0000-0000-0000-0000000000b2', 'crew'),
  ('d1000000-0000-0000-0000-0000000b2003', 'd2000000-0000-0000-0000-0000000000b2', NULL),
  ('d1000000-0000-0000-0000-0000000b2004', 'd2000000-0000-0000-0000-0000000000b2', NULL),
  ('d1000000-0000-0000-0000-0000000b2005', 'd2000000-0000-0000-0000-0000000000b2', NULL),
  -- Boulder · Boulder Climbers Collective
  ('d1000000-0000-0000-0000-0000000b3001', 'd2000000-0000-0000-0000-0000000000b3', 'host'),
  ('d1000000-0000-0000-0000-0000000b3002', 'd2000000-0000-0000-0000-0000000000b3', 'crew'),
  ('d1000000-0000-0000-0000-0000000b3003', 'd2000000-0000-0000-0000-0000000000b3', NULL),
  ('d1000000-0000-0000-0000-0000000b3004', 'd2000000-0000-0000-0000-0000000000b3', NULL),
  ('d1000000-0000-0000-0000-0000000b3005', 'd2000000-0000-0000-0000-0000000000b3', NULL),
  -- Asheville · French Broad Cold Plunge
  ('d1000000-0000-0000-0000-0000000c1001', 'd2000000-0000-0000-0000-0000000000c1', 'host'),
  ('d1000000-0000-0000-0000-0000000c1002', 'd2000000-0000-0000-0000-0000000000c1', 'crew'),
  ('d1000000-0000-0000-0000-0000000c1003', 'd2000000-0000-0000-0000-0000000000c1', NULL),
  ('d1000000-0000-0000-0000-0000000c1004', 'd2000000-0000-0000-0000-0000000000c1', NULL),
  ('d1000000-0000-0000-0000-0000000c1005', 'd2000000-0000-0000-0000-0000000000c1', NULL),
  -- Asheville · Blue Ridge Hikers
  ('d1000000-0000-0000-0000-0000000c2001', 'd2000000-0000-0000-0000-0000000000c2', 'host'),
  ('d1000000-0000-0000-0000-0000000c2002', 'd2000000-0000-0000-0000-0000000000c2', 'crew'),
  ('d1000000-0000-0000-0000-0000000c2003', 'd2000000-0000-0000-0000-0000000000c2', NULL),
  ('d1000000-0000-0000-0000-0000000c2004', 'd2000000-0000-0000-0000-0000000000c2', NULL),
  ('d1000000-0000-0000-0000-0000000c2005', 'd2000000-0000-0000-0000-0000000000c2', NULL),
  -- Asheville · Asheville Sound Healing
  ('d1000000-0000-0000-0000-0000000c3001', 'd2000000-0000-0000-0000-0000000000c3', 'host'),
  ('d1000000-0000-0000-0000-0000000c3002', 'd2000000-0000-0000-0000-0000000000c3', 'crew'),
  ('d1000000-0000-0000-0000-0000000c3003', 'd2000000-0000-0000-0000-0000000000c3', NULL),
  ('d1000000-0000-0000-0000-0000000c3004', 'd2000000-0000-0000-0000-0000000000c3', NULL),
  ('d1000000-0000-0000-0000-0000000c3005', 'd2000000-0000-0000-0000-0000000000c3', 'mentor'),
  -- Brooklyn · Prospect Park Run Club
  ('d1000000-0000-0000-0000-0000000d1001', 'd2000000-0000-0000-0000-0000000000d1', 'host'),
  ('d1000000-0000-0000-0000-0000000d1002', 'd2000000-0000-0000-0000-0000000000d1', 'crew'),
  ('d1000000-0000-0000-0000-0000000d1003', 'd2000000-0000-0000-0000-0000000000d1', NULL),
  ('d1000000-0000-0000-0000-0000000d1004', 'd2000000-0000-0000-0000-0000000000d1', NULL),
  ('d1000000-0000-0000-0000-0000000d1005', 'd2000000-0000-0000-0000-0000000000d1', NULL),
  ('d1000000-0000-0000-0000-0000000d1006', 'd2000000-0000-0000-0000-0000000000d1', NULL),
  -- Brooklyn · Williamsburg Breathwork
  ('d1000000-0000-0000-0000-0000000d2001', 'd2000000-0000-0000-0000-0000000000d2', 'host'),
  ('d1000000-0000-0000-0000-0000000d2002', 'd2000000-0000-0000-0000-0000000000d2', 'crew'),
  ('d1000000-0000-0000-0000-0000000d2003', 'd2000000-0000-0000-0000-0000000000d2', NULL),
  ('d1000000-0000-0000-0000-0000000d2004', 'd2000000-0000-0000-0000-0000000000d2', NULL),
  ('d1000000-0000-0000-0000-0000000d2005', 'd2000000-0000-0000-0000-0000000000d2', NULL),
  -- Brooklyn · Bushwick Makers
  ('d1000000-0000-0000-0000-0000000d3001', 'd2000000-0000-0000-0000-0000000000d3', 'host'),
  ('d1000000-0000-0000-0000-0000000d3002', 'd2000000-0000-0000-0000-0000000000d3', 'crew'),
  ('d1000000-0000-0000-0000-0000000d3003', 'd2000000-0000-0000-0000-0000000000d3', NULL),
  ('d1000000-0000-0000-0000-0000000d3004', 'd2000000-0000-0000-0000-0000000000d3', NULL),
  ('d1000000-0000-0000-0000-0000000d3005', 'd2000000-0000-0000-0000-0000000000d3', NULL),
  -- Bend · Deschutes Trail Runners
  ('d1000000-0000-0000-0000-0000000e1001', 'd2000000-0000-0000-0000-0000000000e1', 'host'),
  ('d1000000-0000-0000-0000-0000000e1002', 'd2000000-0000-0000-0000-0000000000e1', 'crew'),
  ('d1000000-0000-0000-0000-0000000e1003', 'd2000000-0000-0000-0000-0000000000e1', NULL),
  ('d1000000-0000-0000-0000-0000000e1004', 'd2000000-0000-0000-0000-0000000000e1', NULL),
  ('d1000000-0000-0000-0000-0000000e1005', 'd2000000-0000-0000-0000-0000000000e1', NULL),
  ('d1000000-0000-0000-0000-0000000e1006', 'd2000000-0000-0000-0000-0000000000e1', 'guide'),
  -- Bend · Bend Sunrise Yoga
  ('d1000000-0000-0000-0000-0000000e2001', 'd2000000-0000-0000-0000-0000000000e2', 'host'),
  ('d1000000-0000-0000-0000-0000000e2002', 'd2000000-0000-0000-0000-0000000000e2', 'crew'),
  ('d1000000-0000-0000-0000-0000000e2003', 'd2000000-0000-0000-0000-0000000000e2', NULL),
  ('d1000000-0000-0000-0000-0000000e2004', 'd2000000-0000-0000-0000-0000000000e2', NULL),
  ('d1000000-0000-0000-0000-0000000e2005', 'd2000000-0000-0000-0000-0000000000e2', NULL),
  -- Bend · High Desert Sound Bath
  ('d1000000-0000-0000-0000-0000000e3001', 'd2000000-0000-0000-0000-0000000000e3', 'host'),
  ('d1000000-0000-0000-0000-0000000e3002', 'd2000000-0000-0000-0000-0000000000e3', 'crew'),
  ('d1000000-0000-0000-0000-0000000e3003', 'd2000000-0000-0000-0000-0000000000e3', NULL),
  ('d1000000-0000-0000-0000-0000000e3004', 'd2000000-0000-0000-0000-0000000000e3', NULL),
  ('d1000000-0000-0000-0000-0000000e3005', 'd2000000-0000-0000-0000-0000000000e3', NULL)
) AS p(id, circle, volunteer_role)
JOIN circles c ON c.id = p.circle
WHERE NOT EXISTS (
  SELECT 1 FROM memberships m WHERE m.profile_id = p.id AND m.circle_id = p.circle
);


-- =====================================================================
-- 5. POSTS — role + interest + local-place voiced. scope_id = circle id,
--    visibility 'group', post_type 'feed' (host announcements use
--    'announcement'). Fixed d4… UUIDs + ON CONFLICT (id) DO NOTHING.
-- =====================================================================

INSERT INTO posts (id, author_id, post_type, visibility, scope_id, body, is_demo) VALUES
  -- Austin · Barton Springs Plungers
  ('d4000000-0000-0000-0000-0000000a1001', 'd1000000-0000-0000-0000-0000000a1001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000a1', 'Welcome to the Plungers! 6:45am at the springs, every weekday. Three breaths on the steps, then we go in together. Bring a towel and an open mind.', true),
  ('d4000000-0000-0000-0000-0000000a1002', 'd1000000-0000-0000-0000-0000000a1006', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a1', 'Coaching note: don''t fight the gasp. Long exhale, soften the shoulders, let the water do the work. You''re safer and calmer than your nervous system thinks.', true),
  ('d4000000-0000-0000-0000-0000000a1003', 'd1000000-0000-0000-0000-0000000a1003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a1', 'First full minute in the springs this morning! Walked out feeling like a brand new person. Thanks for the encouragement, everyone.', true),
  ('d4000000-0000-0000-0000-0000000a1004', 'd1000000-0000-0000-0000-0000000a1002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a1', 'Coffee run after tomorrow''s plunge — reply with your order and I''ll have it waiting on the wall.', true),
  -- Austin · East Austin Run Club
  ('d4000000-0000-0000-0000-0000000a2001', 'd1000000-0000-0000-0000-0000000a2001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000a2', 'Tuesday + Saturday, 7am from the usual corner. No-drop, all paces — we wait at the lights and nobody runs alone. Tacos after, obviously.', true),
  ('d4000000-0000-0000-0000-0000000a2002', 'd1000000-0000-0000-0000-0000000a2002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a2', 'I''ll be sweeping at the back Saturday, so come even if you''re nervous about pace. You will not be left behind on the east side. Promise.', true),
  ('d4000000-0000-0000-0000-0000000a2003', 'd1000000-0000-0000-0000-0000000a2003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a2', 'New here — did my first full loop without walking today. The breakfast tacos after made it official. I''m in.', true),
  -- Austin · Lady Bird Sunrise Yoga
  ('d4000000-0000-0000-0000-0000000a3001', 'd1000000-0000-0000-0000-0000000a3001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000a3', 'Sunrise practice on the lawn by the lake, 6:30am Sat + Sun. Donation-based, mats to share if you forget yours. We move with the light.', true),
  ('d4000000-0000-0000-0000-0000000a3002', 'd1000000-0000-0000-0000-0000000a3006', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a3', 'Twenty years teaching and the lake at dawn still humbles me. To the newer teachers here: keep it simple, keep it kind. The students feel everything.', true),
  ('d4000000-0000-0000-0000-0000000a3003', 'd1000000-0000-0000-0000-0000000a3005', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a3', 'Total beginner, came anyway. Nobody made me feel behind. Watching the sun come up over the water mid-stretch — unreal.', true),
  ('d4000000-0000-0000-0000-0000000a3004', 'd1000000-0000-0000-0000-0000000a3002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a3', 'New playlist queued for Sunday. Gentle to start, a little lift in the middle. Donation jar''s by the tree as always.', true),
  -- Austin · ATX Founders Breakfast
  ('d4000000-0000-0000-0000-0000000a4001', 'd1000000-0000-0000-0000-0000000a4001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000a4', 'This week''s breakfast: Thursday 8am downtown. Theme is "the thing you''re avoiding." No pitching, no posturing — just the honest version. See you there.', true),
  ('d4000000-0000-0000-0000-0000000a4002', 'd1000000-0000-0000-0000-0000000a4002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a4', 'Keeping intros to 60 seconds again this week so we have time for the real conversation. Coffee will be hot by 7:55.', true),
  ('d4000000-0000-0000-0000-0000000a4003', 'd1000000-0000-0000-0000-0000000a4004', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000a4', 'Solo-founder loneliness is real and this table is the antidote. Got more useful clarity over eggs than in three months of grinding alone.', true),
  -- Boulder · Flatirons Trail Tribe
  ('d4000000-0000-0000-0000-0000000b1001', 'd1000000-0000-0000-0000-0000000b1001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000b1', 'Saturday: Chautauqua trailhead, 7:30am. Up toward the Flatirons, all paces, regroup at the views. Coffee in town after. Layers — it''s cold up top.', true),
  ('d4000000-0000-0000-0000-0000000b1002', 'd1000000-0000-0000-0000-0000000b1006', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b1', 'Guide reminder: check the forecast Friday night, not Saturday morning. Afternoon storms come fast up here. We turn around on time, every time.', true),
  ('d4000000-0000-0000-0000-0000000b1003', 'd1000000-0000-0000-0000-0000000b1003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b1', 'Moved here from sea level and these climbs humbled me fast. But that view from the first bench? Worth every wheezy step.', true),
  ('d4000000-0000-0000-0000-0000000b1004', 'd1000000-0000-0000-0000-0000000b1002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b1', 'Bringing extra snacks and water Saturday for anyone who underpacks. Find me at the back with the orange pack.', true),
  -- Boulder · Pearl Street Breathwork
  ('d4000000-0000-0000-0000-0000000b2001', 'd1000000-0000-0000-0000-0000000b2001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000b2', 'Wednesday circle, 7pm, just off Pearl. Come straight from work if you need to — that''s exactly who this is for. Bring a blanket, leave the day at the door.', true),
  ('d4000000-0000-0000-0000-0000000b2002', 'd1000000-0000-0000-0000-0000000b2003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b2', 'My first session here cracked something open I didn''t know was shut. Came back every week since. Grateful for this room.', true),
  ('d4000000-0000-0000-0000-0000000b2003', 'd1000000-0000-0000-0000-0000000b2002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b2', 'Bolsters and blankets are stacked and ready. Get there a few minutes early to settle in — we start on time so you can fully land.', true),
  -- Boulder · Boulder Climbers Collective
  ('d4000000-0000-0000-0000-0000000b3001', 'd1000000-0000-0000-0000-0000000b3001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000b3', 'Midweek gym session Thursday 6pm, rock this weekend if the weather holds. Drop your project and your psych below and we''ll pair up partners.', true),
  ('d4000000-0000-0000-0000-0000000b3002', 'd1000000-0000-0000-0000-0000000b3002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b3', 'Need a belay partner this week? Reply here and I''ll match you up. Nobody in this crew climbs alone.', true),
  ('d4000000-0000-0000-0000-0000000b3003', 'd1000000-0000-0000-0000-0000000b3005', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000b3', 'Still terrified of heights, still clipped in last night. The encouragement from this group is the only reason I keep tying in. Thank you.', true),
  -- Asheville · French Broad Cold Plunge
  ('d4000000-0000-0000-0000-0000000c1001', 'd1000000-0000-0000-0000-0000000c1001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000c1', 'Sunday plunge at the usual bend in the French Broad, 9am. We hold the cold together, then warm up with stories on the bank. Bring a thermos.', true),
  ('d4000000-0000-0000-0000-0000000c1002', 'd1000000-0000-0000-0000-0000000c1002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000c1', 'Crew note: current''s a touch higher after the rain, so we''re staying close to the bank Sunday. I''ll mark the safe line before we get in.', true),
  ('d4000000-0000-0000-0000-0000000c1003', 'd1000000-0000-0000-0000-0000000c1003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000c1', 'The river genuinely taught me to breathe slow. Came in wound tight, walked out grinning. Same time next week?', true),
  -- Asheville · Blue Ridge Hikers
  ('d4000000-0000-0000-0000-0000000c2001', 'd1000000-0000-0000-0000-0000000c2001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000c2', 'Saturday ridgeline hike, moderate, 8am trailhead. No-drop pace and we learn everyone''s name at the first overlook. Mountain air on the house.', true),
  ('d4000000-0000-0000-0000-0000000c2002', 'd1000000-0000-0000-0000-0000000c2002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000c2', 'I''ll have the map and extra trail mix Saturday. Newcomers, hike near me at the front and I''ll point out the good overlooks.', true),
  ('d4000000-0000-0000-0000-0000000c2003', 'd1000000-0000-0000-0000-0000000c2004', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000c2', 'Slowest one on the trail and somehow made three friends by the summit. This group is something special.', true),
  -- Asheville · Asheville Sound Healing
  ('d4000000-0000-0000-0000-0000000c3001', 'd1000000-0000-0000-0000-0000000c3001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000c3', 'Friday sound bath in the River Arts District, 7pm. Bowls, gongs, and an hour of nothing-to-do-but-rest. Bring a blanket and surrender to the floor.', true),
  ('d4000000-0000-0000-0000-0000000c3002', 'd1000000-0000-0000-0000-0000000c3005', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000c3', 'A reflection for the facilitators here: the silence between the bowls is the medicine. Don''t rush to fill it. Let the room rest in it.', true),
  ('d4000000-0000-0000-0000-0000000c3003', 'd1000000-0000-0000-0000-0000000c3004', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000c3', 'Walked in a total skeptic. The gong did something I can''t explain. Slept like a stone that night. Converted.', true),
  -- Brooklyn · Prospect Park Run Club
  ('d4000000-0000-0000-0000-0000000d1001', 'd1000000-0000-0000-0000-0000000d1001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000d1', 'Dawn loops of Prospect Park, 6:30am Tue + Sat from the Grand Army entrance. Every pace welcome, coffee at the cart after. No one runs alone here.', true),
  ('d4000000-0000-0000-0000-0000000d1002', 'd1000000-0000-0000-0000-0000000d1002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000d1', 'I''ll be back-of-pack again Saturday cheering everyone up the hill. Come even if you''re slow — slow is exactly the pace I run.', true),
  ('d4000000-0000-0000-0000-0000000d1003', 'd1000000-0000-0000-0000-0000000d1003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000d1', 'Trading the subway scroll for park loops at dawn was the best swap I''ve made all year. The park is so quiet and gold at that hour.', true),
  -- Brooklyn · Williamsburg Breathwork
  ('d4000000-0000-0000-0000-0000000d2001', 'd1000000-0000-0000-0000-0000000d2001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000d2', 'Tuesday loft session, 7:30pm in Williamsburg. A real nervous-system reset for the city-frazzled. Come straight off the L if you have to. Mats provided.', true),
  ('d4000000-0000-0000-0000-0000000d2002', 'd1000000-0000-0000-0000-0000000d2003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000d2', 'An hour of breathing and the city hum finally went quiet in my head. Walked out into Williamsburg feeling like myself again.', true),
  ('d4000000-0000-0000-0000-0000000d2003', 'd1000000-0000-0000-0000-0000000d2002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000d2', 'Doors open 7:15 so you can settle. Find a mat, get cozy, let the day fall off before we begin.', true),
  -- Brooklyn · Bushwick Makers
  ('d4000000-0000-0000-0000-0000000d3001', 'd1000000-0000-0000-0000-0000000d3001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000d3', 'Maker night this Thursday, 7pm in the Bushwick studio. Bring a work-in-progress, however rough. Show it, get feedback, find collaborators. That''s the whole thing.', true),
  ('d4000000-0000-0000-0000-0000000d3002', 'd1000000-0000-0000-0000-0000000d3002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000d3', 'Tools and the sign-up sheet are sorted for Thursday. Snacks on me. Reply with what you''re bringing so we can plan the table space.', true),
  ('d4000000-0000-0000-0000-0000000d3003', 'd1000000-0000-0000-0000-0000000d3004', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000d3', 'Brought a half-broken synth last month and left with two new collaborators and a fix. This is why Bushwick is the best.', true),
  -- Bend · Deschutes Trail Runners
  ('d4000000-0000-0000-0000-0000000e1001', 'd1000000-0000-0000-0000-0000000e1001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000e1', 'Saturday run along the Deschutes River trail, 8am, rain or shine. All paces. Riverside stretch circle after — that part''s non-negotiable. See you out there.', true),
  ('d4000000-0000-0000-0000-0000000e1002', 'd1000000-0000-0000-0000-0000000e1006', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000e1', 'Coaching tip for the newer runners: build distance by 10% a week, no more. The trail will still be here next month. Run easy enough to chat.', true),
  ('d4000000-0000-0000-0000-0000000e1003', 'd1000000-0000-0000-0000-0000000e1004', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000e1', 'Brand new to trail running and already hooked. The river, the pines, the post-run stretch by the water. Bend, you''ve got me.', true),
  -- Bend · Bend Sunrise Yoga
  ('d4000000-0000-0000-0000-0000000e2001', 'd1000000-0000-0000-0000-0000000e2001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000e2', 'Sunrise flow, 6:15am, grounding into the high-desert day. Beginners always welcome — we move slow and breathe slower. Tea after for anyone who lingers.', true),
  ('d4000000-0000-0000-0000-0000000e2002', 'd1000000-0000-0000-0000-0000000e2003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000e2', 'Sunrise on the mat genuinely beats coffee. Who knew. Starting my days grounded for the first time in years.', true),
  ('d4000000-0000-0000-0000-0000000e2003', 'd1000000-0000-0000-0000-0000000e2002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000e2', 'Tea will be brewing right after class as usual. Stick around, meet someone, ease into the morning.', true),
  -- Bend · High Desert Sound Bath
  ('d4000000-0000-0000-0000-0000000e3001', 'd1000000-0000-0000-0000-0000000e3001', 'announcement', 'group', 'd2000000-0000-0000-0000-0000000000e3', 'Evening sound bath under the high-desert sky, Friday 7:30pm. Deep rest, deep listening. Bring a mat, a blanket, and nothing to do for an hour.', true),
  ('d4000000-0000-0000-0000-0000000e3002', 'd1000000-0000-0000-0000-0000000e3003', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000e3', 'The bowls reset something in me every single time. Lay down tangled, got up smooth. The desert stars on the walk out are a bonus.', true),
  ('d4000000-0000-0000-0000-0000000e3003', 'd1000000-0000-0000-0000-0000000e3002', 'feed', 'group', 'd2000000-0000-0000-0000-0000000000e3', 'Space is set, blankets are out, lights are low. Come a few minutes early to find your spot and settle in.', true)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- 6. EVENTS — upcoming gatherings for 9 of the 16 circles.
--    host_id = circle leader, scope_type 'circle', scope_id = circle id.
--    starts_at within the next ~2–3 weeks (today = 2026-06-03).
--    Fixed d5… UUIDs + deterministic slugs; ON CONFLICT (id) DO NOTHING.
-- =====================================================================

INSERT INTO events (id, title, description, host_id, scope_id, scope_type, location, starts_at, ends_at, slug, is_demo) VALUES
  -- Austin · Barton Springs Plungers
  ('d5000000-0000-0000-0000-0000000a1001', 'Saturday Sunrise Plunge', 'Weekend group plunge with extra time for breathwork on the steps. Coffee after on the wall.',
   'd1000000-0000-0000-0000-0000000a1001', 'd2000000-0000-0000-0000-0000000000a1', 'circle', 'Barton Springs Pool, Austin',
   '2026-06-06 06:45:00-05', '2026-06-06 08:00:00-05', 'demo-barton-springs-sunrise-plunge', true),
  -- Austin · East Austin Run Club
  ('d5000000-0000-0000-0000-0000000a2001', 'Saturday Long Run + Tacos', 'A relaxed long run on the east side, no-drop, finishing at the taqueria. Distances for every pace.',
   'd1000000-0000-0000-0000-0000000a2001', 'd2000000-0000-0000-0000-0000000000a2', 'circle', 'East Austin (corner of E 6th)',
   '2026-06-13 07:00:00-05', '2026-06-13 09:00:00-05', 'demo-east-austin-long-run-tacos', true),
  -- Austin · Lady Bird Sunrise Yoga
  ('d5000000-0000-0000-0000-0000000a3001', 'Sunrise Flow by the Lake', 'Donation-based all-levels flow on the lawn as the sun comes up over Lady Bird Lake.',
   'd1000000-0000-0000-0000-0000000a3001', 'd2000000-0000-0000-0000-0000000000a3', 'circle', 'Lady Bird Lake lawn, Austin',
   '2026-06-07 06:30:00-05', '2026-06-07 07:45:00-05', 'demo-lady-bird-sunrise-flow', true),
  -- Boulder · Flatirons Trail Tribe
  ('d5000000-0000-0000-0000-0000000b1001', 'Flatirons Saturday Ascent', 'Group hike-run up toward the Flatirons from Chautauqua, regrouping at the viewpoints. Coffee in town after.',
   'd1000000-0000-0000-0000-0000000b1001', 'd2000000-0000-0000-0000-0000000000b1', 'circle', 'Chautauqua Trailhead, Boulder',
   '2026-06-13 07:30:00-06', '2026-06-13 10:00:00-06', 'demo-flatirons-saturday-ascent', true),
  -- Boulder · Pearl Street Breathwork
  ('d5000000-0000-0000-0000-0000000b2001', 'Wednesday Evening Breath Circle', 'Facilitated conscious-breathwork circle a few blocks off Pearl. Come straight from work; leave lighter.',
   'd1000000-0000-0000-0000-0000000b2001', 'd2000000-0000-0000-0000-0000000000b2', 'circle', 'Studio off Pearl Street, Boulder',
   '2026-06-10 19:00:00-06', '2026-06-10 20:30:00-06', 'demo-pearl-street-breath-circle', true),
  -- Asheville · French Broad Cold Plunge
  ('d5000000-0000-0000-0000-0000000c1001', 'Sunday River Plunge', 'Group cold plunge at the usual bend of the French Broad, with stories and warm drinks on the bank after.',
   'd1000000-0000-0000-0000-0000000c1001', 'd2000000-0000-0000-0000-0000000000c1', 'circle', 'French Broad River bend, Asheville',
   '2026-06-14 09:00:00-04', '2026-06-14 10:30:00-04', 'demo-french-broad-sunday-plunge', true),
  -- Asheville · Asheville Sound Healing
  ('d5000000-0000-0000-0000-0000000c3001', 'Friday Sound Bath', 'An hour of bowls, gongs, and deep rest in the River Arts District. Bring a blanket and surrender.',
   'd1000000-0000-0000-0000-0000000c3001', 'd2000000-0000-0000-0000-0000000000c3', 'circle', 'River Arts District studio, Asheville',
   '2026-06-12 19:00:00-04', '2026-06-12 20:15:00-04', 'demo-asheville-friday-sound-bath', true),
  -- Brooklyn · Prospect Park Run Club
  ('d5000000-0000-0000-0000-0000000d1001', 'Saturday Park Loops', 'Dawn loops of Prospect Park at every pace, regrouping on the hill. Coffee at the cart after.',
   'd1000000-0000-0000-0000-0000000d1001', 'd2000000-0000-0000-0000-0000000000d1', 'circle', 'Grand Army Plaza entrance, Prospect Park',
   '2026-06-13 06:30:00-04', '2026-06-13 08:00:00-04', 'demo-prospect-park-saturday-loops', true),
  -- Bend · Deschutes Trail Runners
  ('d5000000-0000-0000-0000-0000000e1001', 'Deschutes Saturday Trail Run', 'Group run along the Deschutes River trail, all paces, finishing with a riverside stretch circle.',
   'd1000000-0000-0000-0000-0000000e1001', 'd2000000-0000-0000-0000-0000000000e1', 'circle', 'Deschutes River Trail, Bend',
   '2026-06-13 08:00:00-07', '2026-06-13 09:30:00-07', 'demo-deschutes-saturday-trail-run', true)
ON CONFLICT (id) DO NOTHING;
