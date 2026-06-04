-- =====================================================================
-- Demo seed v2 — CIRCLE 12: Vista Hops & Hikes (movement)
-- =====================================================================
-- Inland trail hikes around Vista / San Marcos that end at a local taproom.
-- Roster 21 · quota Lum0/Con1/Agt2/Op5/Run6/Ghost7 (no Luminary).
-- One host (Conduit), 2 crew (Agents), 1 guide (Operative), rest members.
-- Several members live inland (Vista, San Marcos, Poway, Rancho Bernardo,
-- Valley Center) and the gravity of the wider community stays in Encinitas.
--
-- UUID blocks (per DEMO-CAST.md Part B.2 — strictly inside these ranges):
--   profiles  f1000000-…-0000000000NN   tails e6–fa  (21 people)
--   circle    f2000000-…-00000000000c   (circle 12, hex 0c)
--   posts     f4000000-…-000000002cNN   block 02c1–0300
--   replies   f4000000-…-0000000012cNN  block 12c1–1300
--   event     f5000000-…-00000000000f   (Trail + Taproom Saturday)
--   practice  e1000000-0000-0000-0000-000000000003 (Mobility flow, active)
--
-- Schema rules copied verbatim from B.5. is_demo=true everywhere; auth-less
-- profiles; member_count left to the membership trigger (NOT hand-set).
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING. Safe to re-run.
-- =====================================================================

BEGIN;

-- Resolve shared geography once (region + this circle's topical channel).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='movement') AS channel_id;

-- =====================================================================
-- 1. CIRCLE
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-00000000000c'::uuid,
       'Vista Hops & Hikes', 'vista-hops-hikes',
       NULL::uuid, 'in-person', 50, 'active',
       'Inland trail hikes around Vista and San Marcos that end at a local taproom. Move your legs on shaded singletrack, meet your neighbors, then earn the pint. Carpools from the brewery lot, all paces welcome.',
       33.2000, -117.2425, 'Vista', 'Vista',
       ctx.channel_id,
       'https://picsum.photos/seed/vista-hops-hikes/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (21) — tails e6–fa. No Luminary.
--    community_role: 1 host (Conduit), 2 crew (Agents), 1 guide (Operative),
--    rest member. Stats sit inside the §3 band for each rank.
-- =====================================================================
INSERT INTO profiles (id, auth_user_id, display_name, handle, community_role,
                      nexus_region_id, bio, avatar_url, current_season_rank,
                      current_season_zaps, lifetime_zaps, lifetime_gems,
                      current_streak, longest_streak, achievement_count,
                      season_challenges_complete, last_seen_at, is_active, is_demo)
SELECT m.id::uuid, NULL, m.display_name, m.handle, m.role::community_role,
       ctx.region_id, m.bio,
       CASE WHEN m.avatar THEN 'https://i.pravatar.cc/240?u=' || m.handle ELSE NULL END,
       m.rank::season_rank_enum,
       m.zaps, m.lzaps, m.gems, m.streak, m.lstreak, m.achv,
       false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, rank, zaps, lzaps, gems, streak, lstreak, achv, avatar?, mins-since-seen, bio
 -- ---- Host (Conduit) ----
 ('f1000000-0000-0000-0000-0000000000e6','Holly Trailwood','holly.trailwood.vh','host','conduit',
   1780, 5400, 1080, 22, 24, 19, true, 7,
   'Trail leader and taproom navigator. I find the shade, you bring the legs — we earn the pint together.'),
 -- ---- Crew (Agents) ----
 ('f1000000-0000-0000-0000-0000000000e7','Gus Marsden','gus.marsden.vh','crew','agent',
   1240, 3100, 690, 16, 18, 14, true, 50,
   'Route scout out of San Marcos. I map the climbs and the best post-hike taps.'),
 ('f1000000-0000-0000-0000-0000000000e8','Renata Vidal','renata.vidal.vh','crew','agent',
   980, 2600, 540, 13, 15, 12, true, 75,
   'Carpool wrangler and pace-keeper. Nobody hikes alone, nobody drives alone.'),
 -- ---- Guide (Operative) ----
 ('f1000000-0000-0000-0000-0000000000e9','Walt Brubaker','walt.brubaker.vh','guide','operative',
   640, 1700, 360, 12, 14, 10, true, 240,
   'Forty years on these inland trails. Ask me where the wildflowers and the shade are.'),
 -- ---- Members: Operative ----
 ('f1000000-0000-0000-0000-0000000000ea','Priya Anand','priya.anand.vh','member','operative',
   520, 1300, 290, 10, 12, 9, true, 120,
   'Poway local, weekend miles. Here for the climbs and the cold IPA after.'),
 ('f1000000-0000-0000-0000-0000000000eb','Drew Castellano','drew.castellano.vh','member','operative',
   430, 1050, 230, 8, 11, 8, false, 480,
   'Rancho Bernardo trail runner slowing down to actually enjoy the view.'),
 ('f1000000-0000-0000-0000-0000000000ec','Sunny Okonkwo','sunny.okonkwo.vh','member','operative',
   360, 920, 200, 7, 9, 8, true, 30,
   'Birder on the move — I''ll slow us down for a good red-tail hawk, sorry not sorry.'),
 ('f1000000-0000-0000-0000-0000000000ed','Marisol Reyes','marisol.reyes.vh','member','operative',
   320, 840, 175, 6, 8, 7, true, 200,
   'Valley Center horse-country hiker. Long drive in, worth every mile.'),
 -- ---- Members: Runner ----
 ('f1000000-0000-0000-0000-0000000000ee','Theo Lindgren','theo.lindgren.vh','member','runner',
   260, 720, 140, 6, 7, 6, true, 18,
   'San Marcos newcomer who came for the hops and got won over by the hikes.'),
 ('f1000000-0000-0000-0000-0000000000ef','Bex Halloran','bex.halloran.vh','member','runner',
   210, 600, 115, 5, 6, 6, true, 160,
   'Trade my desk for dirt every Saturday. Shaded singletrack is my reset.'),
 ('f1000000-0000-0000-0000-0000000000f0','Camille Dubois','camille.dubois.vh','member','runner',
   180, 520, 95, 4, 6, 5, false, 600,
   'Vista local, two dogs, one favorite taproom. They both come on the easy ones.'),
 ('f1000000-0000-0000-0000-0000000000f1','Hank Mercer','hank.mercer.vh','member','runner',
   150, 440, 80, 4, 5, 5, true, 12,
   'Knees aren''t what they were but the post-hike pint still tastes the same.'),
 ('f1000000-0000-0000-0000-0000000000f2','Dani Okafor','dani.okafor.vh','member','runner',
   130, 380, 70, 3, 5, 4, true, 300,
   'Stroller-friendly pace please — the kiddo''s logging trail miles too.'),
 ('f1000000-0000-0000-0000-0000000000f3','Ivo Petrov','ivo.petrov.vh','member','runner',
   110, 320, 60, 3, 4, 4, false, 1440,
   'Found my Saturday crew and a standing brewery table. Best accident of the year.'),
 -- ---- Members: Ghost ----
 ('f1000000-0000-0000-0000-0000000000f4','Nora Ellison','nora.ellison.vh','member','ghost',
   90, 240, 48, 2, 3, 3, true, 9,
   'Just moved to Vista. Trading screen time for trail time, one Saturday at a time.'),
 ('f1000000-0000-0000-0000-0000000000f5','Quincy Adeyemi','quincy.adeyemi.vh','member','ghost',
   72, 190, 36, 2, 2, 3, true, 95,
   'New boots, big plans, mostly here for the shaded climbs.'),
 ('f1000000-0000-0000-0000-0000000000f6','Lena Fischer','lena.fischer.vh','member','ghost',
   58, 150, 28, 1, 2, 2, false, 2880,
   'San Marcos grad student using hikes to get off campus and breathe.'),
 ('f1000000-0000-0000-0000-0000000000f7','Marco Bianchi','marco.bianchi.vh','member','ghost',
   44, 120, 22, 1, 2, 2, true, 10,
   'Came for the taproom, stayed for the people. The hike grew on me.'),
 ('f1000000-0000-0000-0000-0000000000f8','Saanvi Rao','saanvi.rao.vh','member','ghost',
   34, 95, 16, 1, 1, 2, true, 320,
   'Rancho Bernardo lurker who finally laced up. No regrets.'),
 ('f1000000-0000-0000-0000-0000000000f9','Brett Saylor','brett.saylor.vh','member','ghost',
   24, 70, 12, 0, 1, 1, false, 4320,
   'Poway dad easing back into the outdoors. Slow but showing up.'),
 ('f1000000-0000-0000-0000-0000000000fa','Tia Velasquez','tia.velasquez.vh','member','ghost',
   18, 55, 10, 0, 1, 1, true, 7200,
   'Bought the hydration pack, committed to the bit. See you on the trail.')
) AS m(id,display_name,handle,role,rank,zaps,lzaps,gems,streak,lstreak,achv,avatar,seen_min,bio)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role.
--    member_count maintained by the membership trigger (NOT hand-set).
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT mm.profile_id::uuid, 'f2000000-0000-0000-0000-00000000000c'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM (VALUES
 ('f1000000-0000-0000-0000-0000000000e6'),
 ('f1000000-0000-0000-0000-0000000000e7'),
 ('f1000000-0000-0000-0000-0000000000e8'),
 ('f1000000-0000-0000-0000-0000000000e9'),
 ('f1000000-0000-0000-0000-0000000000ea'),
 ('f1000000-0000-0000-0000-0000000000eb'),
 ('f1000000-0000-0000-0000-0000000000ec'),
 ('f1000000-0000-0000-0000-0000000000ed'),
 ('f1000000-0000-0000-0000-0000000000ee'),
 ('f1000000-0000-0000-0000-0000000000ef'),
 ('f1000000-0000-0000-0000-0000000000f0'),
 ('f1000000-0000-0000-0000-0000000000f1'),
 ('f1000000-0000-0000-0000-0000000000f2'),
 ('f1000000-0000-0000-0000-0000000000f3'),
 ('f1000000-0000-0000-0000-0000000000f4'),
 ('f1000000-0000-0000-0000-0000000000f5'),
 ('f1000000-0000-0000-0000-0000000000f6'),
 ('f1000000-0000-0000-0000-0000000000f7'),
 ('f1000000-0000-0000-0000-0000000000f8'),
 ('f1000000-0000-0000-0000-0000000000f9'),
 ('f1000000-0000-0000-0000-0000000000fa')
) AS mm(profile_id)
JOIN profiles p ON p.id = mm.profile_id::uuid
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active Mobility flow, set by the host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-00000000000c'::uuid,
        'e1000000-0000-0000-0000-000000000003'::uuid,
        'f1000000-0000-0000-0000-0000000000e6'::uuid,
        true)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank cadence (Con 3, Agt 2, Op 1–2, Run 1, ~75% Ghosts one
--    short newcomer post + ~25% silent). Block 02c1–0300. Voiced to a
--    hike-then-taproom vibe; ≥1 announces the Trail + Taproom Saturday.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-00000000000c'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_hrs || ' hours')::interval, true
FROM (VALUES
 -- ---- Host (Conduit) — 3 posts ----
 ('f4000000-0000-0000-0000-0000000002c1','f1000000-0000-0000-0000-0000000000e6',
   'Trail + Taproom Saturday is on the books! ⛰️🍺 Moderate five-and-a-half-miler with real shade, a ridgeline view, and a cold one waiting at the end. Carpool from the brewery lot at 8:15, boots on the trail by 8:30. Earn the pint, every single time.', 30),
 ('f4000000-0000-0000-0000-0000000002c2','f1000000-0000-0000-0000-0000000000e6',
   'Reminder for the new folks: this is a no-drop crew. We hike at the pace of the people who showed up, not the people who race. Bring more water than you think you need — it gets warm inland fast.', 168),
 ('f4000000-0000-0000-0000-0000000002c3','f1000000-0000-0000-0000-0000000000e6',
   'Last Saturday''s out-and-back recap: 18 of us, zero blisters that I heard about, and the taproom held our big table without blinking. This crew has officially outgrown the small patio. I love that for us. 🥾', 312),
 -- ---- Crew (Agents) — 2 posts each ----
 ('f4000000-0000-0000-0000-0000000002c4','f1000000-0000-0000-0000-0000000000e7',
   'Scouted Saturday''s route this morning and the wildflowers are absolutely popping along the back stretch. There''s a shady overlook about mile three that''s perfect for a snack stop. Trailhead lot fills early — please carpool from the brewery.', 26),
 ('f4000000-0000-0000-0000-0000000002c5','f1000000-0000-0000-0000-0000000000e7',
   'San Marcos folks: I''ve got two seats in my truck leaving the brewery lot at 8:10 sharp. Reply and they''re yours. No reason to drive solo when we''re all going to the same dirt.', 90),
 ('f4000000-0000-0000-0000-0000000002c6','f1000000-0000-0000-0000-0000000000e8',
   'Carpool board for Saturday is open — drop your neighborhood and whether you''re driving or riding and I''ll match you up. So far we''ve got rides covered out of Vista and Poway. Nobody hikes alone, nobody drives alone. 🚗', 22),
 ('f4000000-0000-0000-0000-0000000002c7','f1000000-0000-0000-0000-0000000000e8',
   'Gentle pace note from the back of the pack: we regroup at every junction, so if the front gets ahead, don''t sweat it. The whole point is we finish together and clink glasses together.', 200),
 -- ---- Guide (Operative, 2 posts) ----
 ('f4000000-0000-0000-0000-0000000002c8','f1000000-0000-0000-0000-0000000000e9',
   'Forty years on these inland trails and Saturday''s loop is still one of my favorites — early shade, a climb that earns the view, and a downhill that''s easy on old knees. Ask me about the side spur to the oak grove if you want a quiet detour.', 40),
 ('f4000000-0000-0000-0000-0000000002c9','f1000000-0000-0000-0000-0000000000e9',
   'Old-timer tip: start your hydrating the night before, not at the trailhead. Inland heat sneaks up on coastal folks. And tuck an electrolyte tab in your pack — your post-hike pint will thank you.', 220),
 -- ---- Members: Operative — 1 post each ----
 ('f4000000-0000-0000-0000-0000000002ca','f1000000-0000-0000-0000-0000000000ea',
   'Driving in from Poway again Saturday and happy to grab anyone on the way through. Honestly the climbs out here beat the gym every time, and the IPA after seals it.', 110),
 ('f4000000-0000-0000-0000-0000000002cb','f1000000-0000-0000-0000-0000000000eb',
   'Used to bomb these trails as a runner and never saw a thing. Slowing to hiking pace with this crew, I''m noticing the views I sprinted past for years. Rancho Bernardo represent.', 470),
 ('f4000000-0000-0000-0000-0000000002cc','f1000000-0000-0000-0000-0000000000ec',
   'Spotted a pair of red-tailed hawks riding the thermals last Saturday and made everyone stop to watch 🦅 No apologies. Bring binos this week if you''ve got ''em — the back ridge is prime.', 36),
 ('f4000000-0000-0000-0000-0000000002cd','f1000000-0000-0000-0000-0000000000ed',
   'Long drive in from Valley Center but this is the best Saturday I''ve got. Shaded climb, good people, cold pint. Worth every mile of the 78.', 205),
 -- ---- Members: Runner — 1 post each ----
 ('f4000000-0000-0000-0000-0000000002ce','f1000000-0000-0000-0000-0000000000ee',
   'Came for the hops, stayed for the hikes. Three Saturdays in and I have a standing trail crew and a favorite San Marcos taproom. Should''ve stopped lurking sooner.', 20),
 ('f4000000-0000-0000-0000-0000000002cf','f1000000-0000-0000-0000-0000000000ef',
   'Traded my desk for dirt this morning and feel like a whole new person. Shaded singletrack is my reset button. See you all Saturday for the real thing.', 165),
 ('f4000000-0000-0000-0000-0000000002d0','f1000000-0000-0000-0000-0000000000f0',
   'Local question: are the easy Saturday loops dog-friendly? My two would never forgive me if the taproom has a patio and they got left home. 🐕', 80),
 ('f4000000-0000-0000-0000-0000000002d1','f1000000-0000-0000-0000-0000000000f1',
   'The knees protested the last climb but the post-hike pint settled the argument. Slow and steady gets me to the top and to the bar. That''s a win in my book.', 14),
 ('f4000000-0000-0000-0000-0000000002d2','f1000000-0000-0000-0000-0000000000f2',
   'Bringing the little one in the carrier Saturday if the pace works — she logs more trail miles than half of us at this point. Thanks for keeping a stroller-friendly option in the mix.', 300),
 ('f4000000-0000-0000-0000-0000000002d3','f1000000-0000-0000-0000-0000000000f3',
   'Showed up to one hike on a whim and now I have a Saturday crew and a brewery table that''s basically reserved. Best accident of my year. In for this weekend.', 1440),
 -- ---- Members: Ghost — 5 short newcomer posts (~75% of 7); f9 & fa silent ----
 ('f4000000-0000-0000-0000-0000000002d4','f1000000-0000-0000-0000-0000000000f4',
   'New to Vista and trading screen time for trail time. Hoping to make Saturday my first one — is the climb beginner-friendly? 🥾', 9),
 ('f4000000-0000-0000-0000-0000000002d5','f1000000-0000-0000-0000-0000000000f5',
   'New boots, big plans, here mostly for the shaded climbs and the cold reward. Looking forward to meeting the crew.', 95),
 ('f4000000-0000-0000-0000-0000000002d6','f1000000-0000-0000-0000-0000000000f6',
   'San Marcos grad student here — using these hikes to get off campus and actually breathe. Excited for Saturday.', 220),
 ('f4000000-0000-0000-0000-0000000002d7','f1000000-0000-0000-0000-0000000000f7',
   'Won''t lie, I came for the taproom. Then the hike grew on me. Now I''m the guy planning his week around Saturday. 🍺', 10),
 ('f4000000-0000-0000-0000-0000000002d8','f1000000-0000-0000-0000-0000000000f8',
   'Lurked from Rancho Bernardo for a month, finally laced up and joined. No regrets. See everyone on the trail.', 320)
) AS v(id, author_id, body, age_hrs)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — 11, clustered on the liveliest posts (the Saturday
--    announcement, the carpool thread, the dog-patio question, the
--    new-to-Vista intro). Block 12c1–1300.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-00000000000c'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_hrs || ' hours')::interval, true
FROM (VALUES
 -- thread on the Trail + Taproom Saturday announcement (…02c1)
 ('f4000000-0000-0000-0000-0000000012c1','f1000000-0000-0000-0000-0000000000ee','f4000000-0000-0000-0000-0000000002c1',
   'In! First one for me — riding from San Marcos if anyone''s got a seat.', 28),
 ('f4000000-0000-0000-0000-0000000012c2','f1000000-0000-0000-0000-0000000000e8','f4000000-0000-0000-0000-0000000002c1',
   'Got you, Theo — drop your cross streets on the carpool thread and I''ll sort a ride.', 27),
 ('f4000000-0000-0000-0000-0000000012c3','f1000000-0000-0000-0000-0000000000f1','f4000000-0000-0000-0000-0000000002c1',
   'Five and a half is doable for these knees if we keep the no-drop promise. Saving my pint already.', 25),
 ('f4000000-0000-0000-0000-0000000012c4','f1000000-0000-0000-0000-0000000000ed','f4000000-0000-0000-0000-0000000002c1',
   'Leaving Valley Center at 7:15 to make the 8:15 lot. Worth it. See you all there. 🥾', 24),
 -- thread on the carpool board (…02c6)
 ('f4000000-0000-0000-0000-0000000012c5','f1000000-0000-0000-0000-0000000000ea','f4000000-0000-0000-0000-0000000002c6',
   'Driving from Poway, two seats open. Happy to swing through Rancho Bernardo on the way.', 20),
 ('f4000000-0000-0000-0000-0000000012c6','f1000000-0000-0000-0000-0000000000f8','f4000000-0000-0000-0000-0000000002c6',
   'Priya you''re a lifesaver — RB rider here, I''ll take a seat!', 19),
 ('f4000000-0000-0000-0000-0000000012c7','f1000000-0000-0000-0000-0000000000e8','f4000000-0000-0000-0000-0000000002c6',
   'Matched! That''s Vista, Poway, and RB all covered. Keep ''em coming.', 18),
 -- thread on the dog-patio question (…02d0)
 ('f4000000-0000-0000-0000-0000000012c8','f1000000-0000-0000-0000-0000000000e6','f4000000-0000-0000-0000-0000000002d0',
   'The easy loops are dog-friendly and the taproom has a big shaded patio that loves dogs. Bring ''em! Just pack extra water for the pups too.', 78),
 ('f4000000-0000-0000-0000-0000000012c9','f1000000-0000-0000-0000-0000000000f0','f4000000-0000-0000-0000-0000000002d0',
   'This is the best news. Two very good (loud) boys will be there Saturday. 🐕🐕', 76),
 -- thread on the new-to-Vista intro (…02d4)
 ('f4000000-0000-0000-0000-0000000012ca','f1000000-0000-0000-0000-0000000000e9','f4000000-0000-0000-0000-0000000002d4',
   'Welcome, Nora! The climb is steady, not steep — plenty of shade and we regroup often. You''ll be fine. Start hydrating tonight.', 8),
 ('f4000000-0000-0000-0000-0000000012cb','f1000000-0000-0000-0000-0000000000e6','f4000000-0000-0000-0000-0000000002d4',
   'Perfect first one. Find me at the lot in the orange cap and stick with the crew. The pint at the end is mandatory. 🍺', 7)
) AS v(id, author_id, parent_id, body, age_hrs)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — Trail + Taproom Saturday (f5…0f), hosted by the circle host.
--    +13d 08:30, Vista trailhead → local taproom.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-00000000000f'::uuid,
       'f1000000-0000-0000-0000-0000000000e6'::uuid,
       'f2000000-0000-0000-0000-00000000000c'::uuid,
       'circle',
       'Trail + Taproom Saturday', 'vista-trail-taproom',
       (now() + interval '13 days')::date + time '08:30',
       (now() + interval '13 days')::date + time '12:30',
       'Vista trailhead → local taproom',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-00000000000f'::uuid);

COMMIT;
