-- =====================================================================
-- Demo seed (v2) — CIRCLE 11: Coast Keepers
-- =====================================================================
-- channel 'activism' · slug 'coast-keepers' · Encinitas, coastal.
-- Beach cleanups + tide-pool stewardship — environmental volunteers along
-- the whole coast. Host rank ⚡ Conduit.
--
-- Per docs/DEMO-CAST.md Part B (B.2–B.5). UUID blocks (stay strictly inside):
--   * profiles  f1000000-…-0000000000NN  tails d0–e5  (22 people)
--   * circle    f2000000-…-00000000000b  (tail 0b, hex)
--   * posts     f4000000-…-000000002NNN  tails 0281–02c0
--   * replies   f4000000-…-000000012NNN  tails 1281–12c0
--   * event     f5000000-…-000000000004  (Earth Day Beach Cleanup, past)
--   * practice  e1000000-…-000000000008  (Gratitude journal, active)
--
-- Roster 22 · quota Lum0/Con1/Agt3/Op5/Run7/Ghost6 (matches §3 pyramid).
-- community_role: 1 host (the Conduit), 2 crew, 1 guide, rest member.
-- Stats sit inside the rank's §3 band. No Luminary. member_count is left to
-- the membership trigger (do NOT hand-set it).
--
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING. Safe to re-run.
-- =====================================================================

BEGIN;

-- Resolve shared geography + the activism channel once (mirror SD template).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
         (SELECT id FROM nexus_regions WHERE name = 'North County' ORDER BY depth LIMIT 1),
         (SELECT id FROM nexus_regions WHERE name = 'San Diego'    ORDER BY depth LIMIT 1),
         (SELECT id FROM nexus_regions WHERE depth = 0 ORDER BY name LIMIT 1)
       ) AS region_id,
       (SELECT id FROM topical_channels WHERE slug = 'activism') AS channel_id;

-- =====================================================================
-- 1. CIRCLE — hub_id NULL (topic+location circle); member_count via trigger.
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-00000000000b', 'Coast Keepers', 'coast-keepers',
       NULL::uuid, 'in-person', 50, 'active',
       'Beach cleanups and tide-pool stewardship up and down the coast. We meet at low tide, haul out what doesn''t belong, and learn the reef while we''re at it. Bring a bucket, gloves provided. Every piece counts.',
       33.0440, -117.2960, 'coastal', 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/coast-keepers/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (22) — tails d0–e5. quota Lum0/Con1/Agt3/Op5/Run7/Ghost6.
--    avatar ~75%; last_seen recent for leaders, older for ghosts.
--    season_challenges_complete = false everywhere (no Luminary here).
-- =====================================================================
INSERT INTO profiles (id, auth_user_id, display_name, handle, community_role,
                      nexus_region_id, bio, avatar_url,
                      current_season_rank, current_season_zaps, lifetime_zaps,
                      lifetime_gems, current_streak, longest_streak,
                      achievement_count, season_challenges_complete,
                      last_seen_at, is_active, is_demo)
SELECT m.id::uuid, NULL, m.display_name, m.handle, m.role::community_role,
       ctx.region_id, m.bio,
       CASE WHEN m.avatar THEN 'https://i.pravatar.cc/240?u=' || m.handle ELSE NULL END,
       m.rank::season_rank_enum, m.season_zaps, m.lifetime_zaps,
       m.gems, m.streak, m.longest_streak, m.achievements, false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank, season_zaps, lifetime_zaps, gems, streak, longest_streak, achievements, seen_min
 -- ---- Conduit ×1 (host) ----
 ('f1000000-0000-0000-0000-0000000000d0','Marisol Vega','marisol.coastkeep','host',
   'Tide charts taped to my fridge. If the ocean gives us this much, the least we can do is keep it clean.',
   true,'conduit',1820,5400,1080,24,28,19,9),
 -- ---- Agent ×3 (2 crew + 1 guide) ----
 ('f1000000-0000-0000-0000-0000000000d1','Theo Nakamura','theo.coastkeep','crew',
   'I run the haul-out logs and weigh every bag. Numbers keep us honest about how much we actually pull.',
   true,'agent',1240,3100,640,16,18,13,55),
 ('f1000000-0000-0000-0000-0000000000d2','Priya Anand','priya.coastkeep','crew',
   'Gloves, buckets, sign-in sheet — I''m the one at the table. New volunteers, come find me first.',
   true,'agent',980,2600,520,13,15,12,40),
 ('f1000000-0000-0000-0000-0000000000d3','Walter Brooks','walter.coastkeep','guide',
   'Thirty years walking these tide pools. I''ll show you a sea hare before you step on one.',
   true,'agent',1110,2900,580,14,17,14,210),
 -- ---- Operative ×5 ----
 ('f1000000-0000-0000-0000-0000000000d4','Carmen Solís','carmen.coastkeep','member',
   'Microplastics are my villain origin story. I''ll be the one sifting the wrack line.',
   true,'operative',620,1500,320,11,13,10,30),
 ('f1000000-0000-0000-0000-0000000000d5','Desmond Hale','desmond.coastkeep','member',
   'Cigarette butts and bottle caps, every single time. Let''s change that.',
   true,'operative',540,1300,280,9,11,9,120),
 ('f1000000-0000-0000-0000-0000000000d6','Lena Borisova','lena.coastkeep','member',
   'Surfer who got tired of dodging trash in the lineup, so now I pick it up.',
   false,'operative',460,1100,240,8,10,9,260),
 ('f1000000-0000-0000-0000-0000000000d7','Marcus Quaye','marcus.coastkeep','member',
   'Bring my two kids — they''re faster at spotting bottle caps than any adult here.',
   true,'operative',390,950,200,7,9,8,18),
 ('f1000000-0000-0000-0000-0000000000d8','Yuki Tanaka','yuki.coastkeep','member',
   'Tide-pool nerd. I''ll happily talk anemones until the tide comes back in.',
   true,'operative',340,860,180,6,8,7,300),
 -- ---- Runner ×7 ----
 ('f1000000-0000-0000-0000-0000000000d9','Imani Foster','imani.coastkeep','member',
   'Found my groove on Saturday cleanups. Beats the gym, better view too.',
   true,'runner',260,640,120,6,7,6,12),
 ('f1000000-0000-0000-0000-0000000000da','Ravi Menon','ravi.coastkeep','member',
   'Retired teacher, full-time beach steward now. The reef is the best classroom.',
   true,'runner',230,560,110,5,7,6,400),
 ('f1000000-0000-0000-0000-0000000000db','Sage Whitaker','sage.coastkeep','member',
   'Started for the ocean, stayed for the people who show up at 8am for it.',
   false,'runner',190,470,90,4,6,5,150),
 ('f1000000-0000-0000-0000-0000000000dc','Nadia Petrov','nadia.coastkeep','member',
   'Two cleanups a month is my baseline. Sand between the toes is the reward.',
   true,'runner',170,420,85,4,5,5,9),
 ('f1000000-0000-0000-0000-0000000000dd','Caleb Ofori','caleb.coastkeep','member',
   'Brought my whole soccer team once. Now half of them are regulars.',
   true,'runner',140,360,70,3,5,5,200),
 ('f1000000-0000-0000-0000-0000000000de','Hana Lindqvist','hana.coastkeep','member',
   'Free-diver. What I see underwater is why I show up on the sand.',
   true,'runner',120,330,60,3,4,4,7),
 ('f1000000-0000-0000-0000-0000000000df','Owen Mercer','owen.coastkeep','member',
   'Weekends only but I haven''t missed an Earth Day yet.',
   false,'runner',110,300,55,2,4,4,1440),
 -- ---- Ghost ×6 (~75% post once, ~25% silent) ----
 ('f1000000-0000-0000-0000-0000000000e0','Esme Castillo','esme.coastkeep','member',
   'Just moved to Leucadia. Cleanups felt like the fastest way to meet good people.',
   true,'ghost',80,210,40,2,3,3,90),
 ('f1000000-0000-0000-0000-0000000000e1','Felix Ardö','felix.coastkeep','member',
   'Lurked the group chat for a month, finally grabbed a bucket. No regrets.',
   true,'ghost',60,150,28,1,2,2,300),
 ('f1000000-0000-0000-0000-0000000000e2','Tess Okonkwo','tess.coastkeep','member',
   'College student doing service hours that turned into an actual habit.',
   false,'ghost',45,110,20,1,2,2,720),
 ('f1000000-0000-0000-0000-0000000000e3','Bruno Aalto','bruno.coastkeep','member',
   'New to San Diego, new to caring about tide pools. Both stuck.',
   true,'ghost',35,90,16,1,1,2,1080),
 ('f1000000-0000-0000-0000-0000000000e4','Greta Halvorsen','greta.coastkeep','member',
   'Beginner stewards welcome, they said. They were right.',
   true,'ghost',25,70,12,0,1,1,2880),
 ('f1000000-0000-0000-0000-0000000000e5','Jonah Reyes','jonah.coastkeep','member',
   'Signed up after Earth Day. Quiet so far, but I''m there with a bag.',
   false,'ghost',18,55,9,0,1,1,4320)
) AS m(id,display_name,handle,role,bio,avatar,rank,season_zaps,lifetime_zaps,gems,streak,longest_streak,achievements,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — one row per member into this circle; volunteer_role
--    mirrors community_role (members get NULL). member_count via trigger.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-00000000000b'::uuid, 'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id IN (
  'f1000000-0000-0000-0000-0000000000d0','f1000000-0000-0000-0000-0000000000d1',
  'f1000000-0000-0000-0000-0000000000d2','f1000000-0000-0000-0000-0000000000d3',
  'f1000000-0000-0000-0000-0000000000d4','f1000000-0000-0000-0000-0000000000d5',
  'f1000000-0000-0000-0000-0000000000d6','f1000000-0000-0000-0000-0000000000d7',
  'f1000000-0000-0000-0000-0000000000d8','f1000000-0000-0000-0000-0000000000d9',
  'f1000000-0000-0000-0000-0000000000da','f1000000-0000-0000-0000-0000000000db',
  'f1000000-0000-0000-0000-0000000000dc','f1000000-0000-0000-0000-0000000000dd',
  'f1000000-0000-0000-0000-0000000000de','f1000000-0000-0000-0000-0000000000df',
  'f1000000-0000-0000-0000-0000000000e0','f1000000-0000-0000-0000-0000000000e1',
  'f1000000-0000-0000-0000-0000000000e2','f1000000-0000-0000-0000-0000000000e3',
  'f1000000-0000-0000-0000-0000000000e4','f1000000-0000-0000-0000-0000000000e5'
)
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — Gratitude journal (e1…08), set by the host, active.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-00000000000b',
        'e1000000-0000-0000-0000-000000000008',
        'f1000000-0000-0000-0000-0000000000d0', true)
ON CONFLICT (circle_id) WHERE active DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank: Con 3, Agt 2 each, Op 1–2, Run 1, ~75% ghosts one
--    short post. Voiced to the cleanup / tide-pool / pounds-hauled vibe.
--    ≥1 recaps Earth Day (event f5…04), ≥1 announces an upcoming cleanup.
--    scope_id = circle; created_at within ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-00000000000b'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.days_ago || ' days')::interval - (v.hrs || ' hours')::interval, true
FROM (VALUES
 -- ---- Host (Conduit) — 3 posts, incl. Earth Day recap + upcoming announce ----
 ('f4000000-0000-0000-0000-000000002281','f1000000-0000-0000-0000-0000000000d0',
   'EARTH DAY RECAP 🌊 Forty-one of you showed up to Moonlight at 8am and we hauled out 214 pounds before low tide turned. Microplastics, a tire, half a beach chair, and one very confused crab (released). Proud doesn''t cover it. Thank you, Coast Keepers.','42','3'),
 ('f4000000-0000-0000-0000-000000002282','f1000000-0000-0000-0000-0000000000d0',
   'Next cleanup is a SATURDAY low-tide session — meet 8am at the Moonlight lot, gloves and buckets provided, just bring a water bottle and sunscreen. We''ll split the cove into zones so nothing gets missed. Bring a friend who''s been meaning to come. 🪣','5','2'),
 ('f4000000-0000-0000-0000-000000002283','f1000000-0000-0000-0000-0000000000d0',
   'Friendly reminder of the one rule that matters in the tide pools: look, don''t pry. Leave the snails on their rocks. We''re here to take trash out, not life. Walter will show anyone the right way to step through. 🐚','19','5'),
 -- ---- Agents — 2 each ----
 ('f4000000-0000-0000-0000-000000002284','f1000000-0000-0000-0000-0000000000d1',
   'The Earth Day numbers are in and logged: 214 lbs total, 31 of it recyclable, 9 lbs of fishing line alone (the worst for wildlife). Trend over the last six cleanups is DOWN, which means the regular sweeps are working. Data doesn''t lie. 📊','41','6'),
 ('f4000000-0000-0000-0000-000000002285','f1000000-0000-0000-0000-0000000000d1',
   'Pro tip for Saturday: bring a small mesh bag for the tiny stuff. The big pieces are easy — it''s the foam crumbs and bottle caps in the wrack line that actually wreck the food chain. Slow and low wins.','4','9'),
 ('f4000000-0000-0000-0000-000000002286','f1000000-0000-0000-0000-0000000000d2',
   'New volunteers — when you get to Moonlight, find the folding table by the lot. I''ll have the sign-in sheet, gloves, buckets, and a two-minute rundown so you''re not standing around. First cleanup is always the friendliest. 👋','6','1'),
 ('f4000000-0000-0000-0000-000000002287','f1000000-0000-0000-0000-0000000000d2',
   'Reminder we''ve got a kids'' bucket bin now — smaller gloves, lighter pails. Marcus''s crew tested them at Earth Day and they were unstoppable. Family-friendly is the whole point. Bring the littles.','22','4'),
 ('f4000000-0000-0000-0000-000000002288','f1000000-0000-0000-0000-0000000000d3',
   'Tide-pool walk before the next cleanup, 7:30 at the south reef — I''ll point out the sea hares, the chitons, and why that green anemone closes when you touch it (don''t). Knowing what lives here is half of why we protect it. 🐙','3','7'),
 ('f4000000-0000-0000-0000-000000002289','f1000000-0000-0000-0000-0000000000d3',
   'Thirty years on this stretch and the reef still surprises me. Saw an octopus in the low pools last week, first in months. The water''s cleaner than it was a decade ago — slow progress, but it''s real, and it''s us.','15','2'),
 -- ---- Operatives — 1–2 each ----
 ('f4000000-0000-0000-0000-00000000228a','f1000000-0000-0000-0000-0000000000d4',
   'Spent Earth Day on the wrack line and filled a whole bucket with microplastic confetti. It''s grim how much is hiding in the seaweed. But that''s a bucket''s worth that won''t end up in a fish. Worth every cramped finger.','40','5'),
 ('f4000000-0000-0000-0000-00000000228b','f1000000-0000-0000-0000-0000000000d4',
   'Anyone else save the weird finds? My Earth Day haul included a single flip-flop, a 2009 lottery ticket, and a rubber duck. The ocean has a sense of humor. Bringing the duck to Saturday as our mascot.','38','11'),
 ('f4000000-0000-0000-0000-00000000228c','f1000000-0000-0000-0000-0000000000d5',
   'Counted my haul on the last sweep: 1 bag of cigarette butts, 1 of bottle caps, basically nothing else. If we could fix just those two we''d cut the trash in half. Tell your smoking friends about pocket ashtrays. 🚭','12','8'),
 ('f4000000-0000-0000-0000-00000000228d','f1000000-0000-0000-0000-0000000000d6',
   'Caught a wave at dawn, picked up trash after — best kind of Saturday. Pulled a tangle of fishing line off the rocks before it caught a bird. This is why I stopped paddling past it.','8','6'),
 ('f4000000-0000-0000-0000-00000000228e','f1000000-0000-0000-0000-0000000000d7',
   'My kids hauled their own bucket each at Earth Day and have not stopped talking about it. Six and eight years old, racing to find bottle caps. If you''ve got little ones on the fence — just bring them. They''ll out-collect you.','41','2'),
 ('f4000000-0000-0000-0000-00000000228f','f1000000-0000-0000-0000-0000000000d8',
   'Did the tide-pool count this morning before the cleanup crew arrived: aggregating anemones thriving, two species of crab, and a nudibranch I had to look up. A clean beach is a living one. See you Saturday.','7','9'),
 -- ---- Runners — 1 each ----
 ('f4000000-0000-0000-0000-000000002290','f1000000-0000-0000-0000-0000000000d9',
   'Three cleanups in and Saturday mornings finally have a point again. Better than the gym, better view, and I leave actually feeling like I did something. Hooked.','9','4'),
 ('f4000000-0000-0000-0000-000000002291','f1000000-0000-0000-0000-0000000000da',
   'Taught high school science for thirty years and never had a classroom like this reef. Bring a kid to a cleanup and watch them learn more in an hour than a week of worksheets. 🌊','11','3'),
 ('f4000000-0000-0000-0000-000000002292','f1000000-0000-0000-0000-0000000000db',
   'Showed up alone to my first cleanup feeling awkward and left with three new phone numbers and a standing Saturday plan. This crew is the real haul.','13','7'),
 ('f4000000-0000-0000-0000-000000002293','f1000000-0000-0000-0000-0000000000dc',
   'Two cleanups a month, that''s my deal with myself. Sand between the toes, a full bucket, coffee after. Cheapest therapy on the coast.','6','5'),
 ('f4000000-0000-0000-0000-000000002294','f1000000-0000-0000-0000-0000000000dd',
   'Dragged my whole rec soccer team out for Earth Day as a "team bonding" thing. Now four of them are asking when the next one is. Accidental recruiter. ⚽','40','8'),
 ('f4000000-0000-0000-0000-000000002295','f1000000-0000-0000-0000-0000000000de',
   'What I see free-diving is exactly why I''m on the sand every other week. Less line in the water this season — we''re making a dent. Keep at it, everyone.','5','6'),
 ('f4000000-0000-0000-0000-000000002296','f1000000-0000-0000-0000-0000000000df',
   'Weekends only over here, but I have not missed an Earth Day cleanup yet and I''m not about to start. See you at the next big one.','43','3'),
 -- ---- Ghosts — newcomer one-liners (~75%: e0,e1,e3,e4 post; e2,e5 silent) ----
 ('f4000000-0000-0000-0000-000000002297','f1000000-0000-0000-0000-0000000000e0',
   'Just moved to Leucadia and signed up for my first cleanup this Saturday. Cleanups seemed like the fastest way to meet people who actually love it here. 👋','2','5'),
 ('f4000000-0000-0000-0000-000000002298','f1000000-0000-0000-0000-0000000000e1',
   'Lurked the group chat a month, finally grabbing a bucket Saturday. Hi everyone, point me at the trash.','3','2'),
 ('f4000000-0000-0000-0000-000000002299','f1000000-0000-0000-0000-0000000000e3',
   'New to San Diego and brand new to caring about tide pools — turns out it''s addictive. First cleanup soon, excited.','4','7'),
 ('f4000000-0000-0000-0000-00000000229a','f1000000-0000-0000-0000-0000000000e4',
   'Said beginner stewards were welcome so here I am. Total newbie, ready to learn. 🐚','6','4')
) AS v(id, author_id, body, days_ago, hrs)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — 10 replies clustered on the liveliest posts (Earth Day recap,
--    Saturday announce, the kids/finds threads). parent_id in this circle's
--    top-level block; reply UUID block 1281–12c0.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-00000000000b'::uuid, 'group'::post_visibility, v.body,
       now() - (v.days_ago || ' days')::interval - (v.hrs || ' hours')::interval, true
FROM (VALUES
 -- on the Earth Day recap (2281)
 ('f4000000-0000-0000-0000-000000012281','f1000000-0000-0000-0000-0000000000d4','f4000000-0000-0000-0000-000000002281',
   '214 pounds! That number never stops being wild. The wrack line alone was a workout.','41','20'),
 ('f4000000-0000-0000-0000-000000012282','f1000000-0000-0000-0000-0000000000d7','f4000000-0000-0000-0000-000000002281',
   'My kids are taking full credit for the crab rescue. Best morning of their year, honestly. 🦀','41','18'),
 ('f4000000-0000-0000-0000-000000012283','f1000000-0000-0000-0000-0000000000da','f4000000-0000-0000-0000-000000002281',
   'Forty-one people before 8am on a Saturday. This community is something special.','40','22'),
 ('f4000000-0000-0000-0000-000000012284','f1000000-0000-0000-0000-0000000000d0','f4000000-0000-0000-0000-000000002281',
   'Couldn''t have done it without the crew at the table getting everyone sorted in five minutes flat. 🙌','40','12'),
 -- on the Saturday announce (2282)
 ('f4000000-0000-0000-0000-000000012285','f1000000-0000-0000-0000-0000000000db','f4000000-0000-0000-0000-000000002282',
   'In! Bringing two friends who keep saying they''ll come. This is the week.','4','9'),
 ('f4000000-0000-0000-0000-000000012286','f1000000-0000-0000-0000-0000000000e0','f4000000-0000-0000-0000-000000002282',
   'First-timer here — do I need to bring anything besides water and sunscreen?','4','6'),
 ('f4000000-0000-0000-0000-000000012287','f1000000-0000-0000-0000-0000000000d2','f4000000-0000-0000-0000-000000002282',
   'Nope, that''s it! Gloves and buckets are all at the table. Just find me when you arrive. 🪣','4','5'),
 -- on the kids thread (228e)
 ('f4000000-0000-0000-0000-000000012288','f1000000-0000-0000-0000-0000000000dd','f4000000-0000-0000-0000-00000000228e',
   'Can confirm — kids find the small stuff adults walk right past. They''re our best spotters.','40','15'),
 ('f4000000-0000-0000-0000-000000012289','f1000000-0000-0000-0000-0000000000d2','f4000000-0000-0000-0000-00000000228e',
   'The kid bucket bin was made for exactly this. Bring them all. 👧🧒','40','10'),
 -- on the weird-finds thread (228b)
 ('f4000000-0000-0000-0000-00000001228a','f1000000-0000-0000-0000-0000000000d8','f4000000-0000-0000-0000-00000000228b',
   'A rubber duck mascot is the morale boost this crew didn''t know it needed. All in. 🦆','37','8')
) AS v(id, author_id, parent_id, body, days_ago, hrs)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — Earth Day Beach Cleanup (f5…04), past (-44d 08:00), hosted by
--    Marisol (this circle's host). scope_type 'circle'.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug, starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-000000000004',
       'f1000000-0000-0000-0000-0000000000d0',
       'f2000000-0000-0000-0000-00000000000b', 'circle',
       'Earth Day Beach Cleanup', 'coast-keepers-earth-day',
       ((now() - interval '44 days')::date + time '08:00')::timestamptz,
       ((now() - interval '44 days')::date + time '11:00')::timestamptz,
       'Moonlight Beach, Encinitas', false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-000000000004'::uuid);

COMMIT;
