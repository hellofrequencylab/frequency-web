-- =====================================================================
-- Demo seed v2 — CIRCLE 5: Cottonwood Creek Mindfulness
-- =====================================================================
-- Channel: spirituality · slug cottonwood-mindfulness
-- Circle id: f2000000-0000-0000-0000-000000000005 · Encinitas (33.0530,-117.2930)
-- Host rank: ⚡ Conduit.
--
-- Roster 20 · quota Lum0 / Con1 / Agent2 / Op4 / Run7 / Ghost6.
-- Profile UUID tails (hex) 54–67 (20 people).
-- Post block tails 0101–0140; reply block tails 1101–1140.
-- Event: f5…0a Silent Half-Day Sit (-7d 08:00, Cottonwood Creek Park).
-- Active practice: e1000000-0000-0000-0000-000000000007 (Morning sit).
--
-- Mirrors the SD template exactly (column lists per docs/DEMO-CAST.md B.5).
-- member_count is NOT set — the membership trigger maintains it.
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING. Safe to re-run.
-- =====================================================================

BEGIN;

-- Resolve shared geography once.
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='spirituality') AS channel_id;

-- =====================================================================
-- 1. CIRCLE
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000005'::uuid,
       'Cottonwood Creek Mindfulness', 'cottonwood-mindfulness',
       NULL::uuid, 'in-person', 50, 'active',
       'Silent sits and journaling by Cottonwood Creek. We gather early, settle in together, and let the morning be quiet. Cushions provided, beginners always welcome — you don''t have to be good at this, you just have to show up.',
       33.0530, -117.2930, 'Cottonwood Creek', 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/cottonwood-mindfulness/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (20) — quota Lum0/Con1/Agent2/Op4/Run7/Ghost6.
--    roles: 1 host (the Conduit) + 2 crew + 1 guide; rest member.
--    Stats sit inside the §3 band for each rank.
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
       m.rank::season_rank_enum, m.zaps, m.lzaps, m.gems, m.streak, m.lstreak,
       m.achiev, false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank, zaps, lzaps, gems, streak, lstreak, achiev, seen_min
 -- ---- Conduit · host ----
 ('f1000000-0000-0000-0000-000000000054','Maren Holloway','maren.sits','host','⚡ Conduit',
   'Holding the cushion at Cottonwood for a year now. Silence is the most generous thing we make together.',
   true,'conduit',1780,5400,1080,24,29,19,140),
 -- ---- Agents · crew ----
 ('f1000000-0000-0000-0000-000000000055','Ansar Petrov','ansar.stillness','crew','🛰️ Agent',
   'I unlock the gate, set the cushions, and keep the kettle warm. Logistics as a quiet devotion.',
   true,'agent',1180,3100,620,15,18,13,55),
 ('f1000000-0000-0000-0000-000000000056','Delphine Aubert','delphine.notes','crew','🛰️ Agent',
   'Journaling prompts are my love language. I write the morning question and pour the tea after.',
   true,'agent',940,2600,510,12,16,12,80),
 -- ---- Operatives ----
 ('f1000000-0000-0000-0000-000000000057','Rohan Kapadia','rohan.breathes','guide','🔹 Operative',
   'Sat ten silent retreats before I found this creek. Happy to walk a first-timer through the basics.',
   true,'operative',680,1600,360,13,15,10,220),
 ('f1000000-0000-0000-0000-000000000058','Beatrix Sundqvist','bea.morningsit','member','🔹 Operative',
   'Dawn sitter, slow journaler. The half-day sits rearranged something in me for the better.',
   true,'operative',520,1300,290,11,13,9,40),
 ('f1000000-0000-0000-0000-000000000059','Caius Mendoza','caius.quiet','member','🔹 Operative',
   'Came for the stillness, stayed for the people who let me be quiet with them.',
   false,'operative',410,1050,230,8,11,8,300),
 ('f1000000-0000-0000-0000-00000000005a','Yusuf Demirel','yusuf.creekside','member','🔹 Operative',
   'Midday sits on my lunch break keep the whole week from tipping over.',
   true,'operative',340,900,180,7,9,7,160),
 -- ---- Runners ----
 ('f1000000-0000-0000-0000-00000000005b','Petra Nilsson','petra.unhurried','member','🏃 Runner',
   'Recovering over-thinker. Ten quiet minutes here beats an hour of scrolling.',
   true,'runner',270,640,140,7,8,6,18),
 ('f1000000-0000-0000-0000-00000000005c','Tomas Ferreira','tomas.exhale','member','🏃 Runner',
   'I journal more than I talk lately and I''m better for it. Found my groove at the creek.',
   true,'runner',230,560,120,6,7,6,90),
 ('f1000000-0000-0000-0000-00000000005d','Anneke Visser','anneke.softfocus','member','🏃 Runner',
   'Stiff shoulders, busy head, slowly learning to set both down on the cushion.',
   false,'runner',190,470,95,5,6,5,260),
 ('f1000000-0000-0000-0000-00000000005e','Bashir Haddad','bashir.dawnsit','member','🏃 Runner',
   'Early riser who finally found somewhere to point all that quiet morning energy.',
   true,'runner',160,400,80,4,6,5,15),
 ('f1000000-0000-0000-0000-00000000005f','Lioba Krause','lioba.stillwater','member','🏃 Runner',
   'Anxiety brought me, the journaling kept me. Small habit, big difference.',
   true,'runner',140,350,70,4,5,4,120),
 ('f1000000-0000-0000-0000-000000000060','Marco Bianchi','marco.sitsstill','member','🏃 Runner',
   'Skeptic turned regular. Turns out doing nothing on purpose is harder and better than it sounds.',
   false,'runner',120,300,60,3,5,4,340),
 ('f1000000-0000-0000-0000-000000000061','Saanvi Rao','saanvi.quietmorning','member','🏃 Runner',
   'Grad student using the midday sit to survive the semester. It works.',
   true,'runner',105,290,55,3,4,4,9),
 -- ---- Ghosts (6) — ~75% write one short post, ~25% silent ----
 ('f1000000-0000-0000-0000-000000000062','Eero Lahtinen','eero.newcushion','member','👻 Ghost',
   'Brand new to sitting. Showed up nervous, left calmer than I''ve been in months.',
   true,'ghost',80,210,45,2,3,3,12),
 ('f1000000-0000-0000-0000-000000000063','Clara Wenzel','clara.firstsit','member','👻 Ghost',
   'First-ever meditation circle. Less intimidating than I built it up to be.',
   true,'ghost',60,160,32,1,2,3,40),
 ('f1000000-0000-0000-0000-000000000064','Tariq Nasser','tariq.lurking','member','👻 Ghost',
   'Lurked for weeks before I came. The silence does the talking, turns out.',
   true,'ghost',45,120,24,1,2,2,520),
 ('f1000000-0000-0000-0000-000000000065','Maja Olsen','maja.stilltrying','member','👻 Ghost',
   'Restless mind, soft cushion. Still figuring out the sitting-still part.',
   false,'ghost',32,90,18,1,1,2,1440),
 ('f1000000-0000-0000-0000-000000000066','Hugo Marchetti','hugo.warmingup','member','👻 Ghost',
   'New this month, mostly here to listen and warm up to it slowly.',
   true,'ghost',22,60,12,0,1,1,2880),
 ('f1000000-0000-0000-0000-000000000067','Wren Ashby','wren.justarrived','member','👻 Ghost',
   'Just moved to Encinitas. Heard there was a quiet morning crew by the creek.',
   false,'ghost',15,40,8,0,1,1,4320)
) AS m(id,display_name,handle,role,rank,bio,avatar,zaps,lzaps,gems,streak,lstreak,achiev,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT mm.profile_id::uuid, 'f2000000-0000-0000-0000-000000000005'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM (VALUES
 ('f1000000-0000-0000-0000-000000000054'),
 ('f1000000-0000-0000-0000-000000000055'),
 ('f1000000-0000-0000-0000-000000000056'),
 ('f1000000-0000-0000-0000-000000000057'),
 ('f1000000-0000-0000-0000-000000000058'),
 ('f1000000-0000-0000-0000-000000000059'),
 ('f1000000-0000-0000-0000-00000000005a'),
 ('f1000000-0000-0000-0000-00000000005b'),
 ('f1000000-0000-0000-0000-00000000005c'),
 ('f1000000-0000-0000-0000-00000000005d'),
 ('f1000000-0000-0000-0000-00000000005e'),
 ('f1000000-0000-0000-0000-00000000005f'),
 ('f1000000-0000-0000-0000-000000000060'),
 ('f1000000-0000-0000-0000-000000000061'),
 ('f1000000-0000-0000-0000-000000000062'),
 ('f1000000-0000-0000-0000-000000000063'),
 ('f1000000-0000-0000-0000-000000000064'),
 ('f1000000-0000-0000-0000-000000000065'),
 ('f1000000-0000-0000-0000-000000000066'),
 ('f1000000-0000-0000-0000-000000000067')
) AS mm(profile_id)
JOIN profiles p ON p.id = mm.profile_id::uuid
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active practice set by the host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000005'::uuid,
        'e1000000-0000-0000-0000-000000000007'::uuid,
        'f1000000-0000-0000-0000-000000000054'::uuid,
        true)
ON CONFLICT (circle_id, practice_id) DO NOTHING;

-- =====================================================================
-- 5. POSTS — voiced to a quiet meditation/journaling vibe.
--    Con 3 · Agt 2 each · Op 1–2 · Run 1 each · ~75% of ghosts one short post.
--    ≥1 recaps the silent sit · ≥1 about the weekly midday sits.
--    created_at staggered across the last ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000005'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- ---- Host (Conduit ×3) ----
 ('f4000000-0000-0000-0000-000000000101','f1000000-0000-0000-0000-000000000054',
   'welcome to Cottonwood Creek 🌿 we sit early and we sit quiet. no experience needed, no goals to hit — cushions are provided, just bring yourself and a willingness to be still for a little while. say hi on the grass before we begin.',
   62000),
 ('f4000000-0000-0000-0000-000000000102','f1000000-0000-0000-0000-000000000054',
   'recap of saturday''s silent half-day sit 🙏 thirty of us, four hours, not a word — and somehow the most connected morning we''ve had. thank you to everyone who held the silence so gently. the way the creek sounded once we all settled… i''m still carrying it. we''ll do another in the fall.',
   10000),
 ('f4000000-0000-0000-0000-000000000103','f1000000-0000-0000-0000-000000000054',
   'a small reminder for the week: you don''t have to empty your mind. you just have to keep coming back to the breath, kindly, a thousand times if that''s what it takes. that returning IS the practice. see you at the creek.',
   3000),
 -- ---- Crew (Agent ×2 each) ----
 ('f4000000-0000-0000-0000-000000000104','f1000000-0000-0000-0000-000000000055',
   'gate''s open by 7:45 so come early and settle. i''ll have cushions laid out and the kettle on for tea after. if it''s your first time just find me — i''m the one quietly fussing over blanket placement.',
   48000),
 ('f4000000-0000-0000-0000-000000000105','f1000000-0000-0000-0000-000000000055',
   'midday sits this week are on as usual — wednesday + friday, 12:15, by the big cottonwood. twenty minutes to reset the day. bring nothing, leave lighter. perfect if a full morning feels like too much right now.',
   16000),
 ('f4000000-0000-0000-0000-000000000106','f1000000-0000-0000-0000-000000000056',
   'this week''s journaling prompt, for anyone sitting at home too: "what am i still carrying that this morning could set down?" no wrong answers, no need to share. just three lines after you sit.',
   40000),
 ('f4000000-0000-0000-0000-000000000107','f1000000-0000-0000-0000-000000000056',
   'tea + quiet journaling after the silent sit on saturday was my favorite part. so many of you stayed and wrote on the grass without a word. i topped up the kettle four times and regret nothing 🍵',
   9000),
 -- ---- Operatives (Op ×4, 1–2 each) ----
 ('f4000000-0000-0000-0000-000000000108','f1000000-0000-0000-0000-000000000057',
   'for the newer sitters who asked: posture before everything. let the breath be ordinary, don''t chase a special state. if the mind wanders (it will), just notice and come home. grab me before we start and i''ll get you comfortable.',
   52000),
 ('f4000000-0000-0000-0000-000000000109','f1000000-0000-0000-0000-000000000057',
   'sat the full four hours saturday and time did that strange thing where it folds. came out feeling like i''d slept a week. the half-day sits are quietly the best thing this circle does.',
   8500),
 ('f4000000-0000-0000-0000-00000000010a','f1000000-0000-0000-0000-000000000058',
   'the wednesday midday sit is the only meeting i never reschedule. twenty minutes by the cottonwood and the afternoon stops feeling like a cliff edge.',
   30000),
 ('f4000000-0000-0000-0000-00000000010b','f1000000-0000-0000-0000-000000000058',
   'still thinking about saturday. four hours of silence sounded terrifying on paper and turned out to be the calmest i''ve felt all year. grateful to this little crew by the creek.',
   7000),
 ('f4000000-0000-0000-0000-00000000010c','f1000000-0000-0000-0000-000000000059',
   'came expecting to white-knuckle the silence and instead just… sank into it. who knew sitting still with strangers could feel like the opposite of lonely.',
   38000),
 ('f4000000-0000-0000-0000-00000000010d','f1000000-0000-0000-0000-00000000005a',
   'lunch-break sits are carrying me through this stretch at work. fifteen minutes under the big tree and i walk back to my desk an actual person again. thanks for keeping the midday ones going.',
   22000),
 -- ---- Runners (Run ×7, 1 each) ----
 ('f4000000-0000-0000-0000-00000000010e','f1000000-0000-0000-0000-00000000005b',
   'three weeks of showing up and my morning scroll habit is quietly dying. turns out ten minutes of nothing beats an hour of everything. small win, taking it.',
   34000),
 ('f4000000-0000-0000-0000-00000000010f','f1000000-0000-0000-0000-00000000005c',
   'i journal more than i talk these days and honestly i''m better company for it. the prompt this week got me good. thanks delphine.',
   26000),
 ('f4000000-0000-0000-0000-000000000110','f1000000-0000-0000-0000-00000000005d',
   'still can''t sit still for long without my shoulders creeping up to my ears, but i''m here every week trying. nobody''s rushing me and that''s exactly why it''s working.',
   44000),
 ('f4000000-0000-0000-0000-000000000111','f1000000-0000-0000-0000-00000000005e',
   'early-riser energy finally has somewhere to go. dawn sit, then the creek, then the whole day feels like mine before anyone else is awake. hooked.',
   20000),
 ('f4000000-0000-0000-0000-000000000112','f1000000-0000-0000-0000-00000000005f',
   'anxiety walked me in the door, the journaling is what keeps me coming back. three lines after a sit does more for me than a whole evening of overthinking.',
   14000),
 ('f4000000-0000-0000-0000-000000000113','f1000000-0000-0000-0000-000000000060',
   'was a complete skeptic about "doing nothing on purpose." six weeks in and it''s the hardest, best thing on my calendar. don''t tell anyone i said that.',
   28000),
 ('f4000000-0000-0000-0000-000000000114','f1000000-0000-0000-0000-000000000061',
   'midday sit is the only reason i''m surviving this semester intact. ten quiet minutes between classes and i stop spiraling. small thing, huge difference 🙏',
   6000),
 -- ---- Ghosts (6 → ~75% = 4 short newcomer posts; 2 silent: 0065, 0067) ----
 ('f4000000-0000-0000-0000-000000000115','f1000000-0000-0000-0000-000000000062',
   'first sit ever this morning. showed up nervous, left calmer than i''ve been in months. is it always like that? 🌿',
   18000),
 ('f4000000-0000-0000-0000-000000000116','f1000000-0000-0000-0000-000000000063',
   'new here! first meditation circle of my life and way less intimidating than i''d built it up to be. see you next week.',
   12000),
 ('f4000000-0000-0000-0000-000000000117','f1000000-0000-0000-0000-000000000064',
   'lurked for weeks before i finally came down to the creek. should''ve done it sooner. the silence really does do the talking.',
   25000),
 ('f4000000-0000-0000-0000-000000000118','f1000000-0000-0000-0000-000000000066',
   'new this month and mostly just listening for now. happy to be the quiet one warming up slowly. thanks for the welcome.',
   33000)
) AS v(id, author_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — ~8–14, clustered on the liveliest posts (silent-sit recap
--    0102, midday-sit 0105, journaling 0106, first-sit 0115). Reply UUID block.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000005'::uuid, 'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- on the silent half-day recap (0102)
 ('f4000000-0000-0000-0000-000000001101','f1000000-0000-0000-0000-000000000058','f4000000-0000-0000-0000-000000000102',
   'still floating from it. four hours flew. count me in for the fall one already.', 9800),
 ('f4000000-0000-0000-0000-000000001102','f1000000-0000-0000-0000-000000000057','f4000000-0000-0000-0000-000000000102',
   'that moment when everyone settled and the creek got loud — unreal. thank you for holding it, maren.', 9700),
 ('f4000000-0000-0000-0000-000000001103','f1000000-0000-0000-0000-000000000062','f4000000-0000-0000-0000-000000000102',
   'gutted i missed my first one. is the fall sit open to total beginners?', 9500),
 ('f4000000-0000-0000-0000-000000001104','f1000000-0000-0000-0000-000000000054','f4000000-0000-0000-0000-000000000102',
   'absolutely, eero — beginners are exactly who these are for. we''ll go gently, promise. 🌿', 9400),
 -- on the midday sits post (0105)
 ('f4000000-0000-0000-0000-000000001105','f1000000-0000-0000-0000-00000000005a','f4000000-0000-0000-0000-000000000105',
   'wednesday + friday lunch sits = the only reason my workweek holds together. thank you ansar.', 15800),
 ('f4000000-0000-0000-0000-000000001106','f1000000-0000-0000-0000-000000000061','f4000000-0000-0000-0000-000000000105',
   'can i come straight from class in regular clothes or should i bring something?', 15600),
 ('f4000000-0000-0000-0000-000000001107','f1000000-0000-0000-0000-000000000055','f4000000-0000-0000-0000-000000000105',
   'come exactly as you are, saanvi — cushions and a blanket here if you want one. nothing to bring but you.', 15500),
 -- on the journaling prompt (0106)
 ('f4000000-0000-0000-0000-000000001108','f1000000-0000-0000-0000-00000000005c','f4000000-0000-0000-0000-000000000106',
   'this prompt got me right in the chest. wrote way more than three lines.', 39000),
 ('f4000000-0000-0000-0000-000000001109','f1000000-0000-0000-0000-00000000005f','f4000000-0000-0000-0000-000000000106',
   'love these. could we get the prompt the night before so i can sit with it overnight?', 38500),
 ('f4000000-0000-0000-0000-00000000110a','f1000000-0000-0000-0000-000000000056','f4000000-0000-0000-0000-000000000106',
   'great idea lioba — i''ll start posting them the evening before. 🍵', 38200),
 -- on the first-sit-ever ghost post (0115)
 ('f4000000-0000-0000-0000-00000000110b','f1000000-0000-0000-0000-000000000056','f4000000-0000-0000-0000-000000000115',
   'welcome eero! and yes — that openness after a first sit is real. glad you came down.', 17800),
 ('f4000000-0000-0000-0000-00000000110c','f1000000-0000-0000-0000-00000000005b','f4000000-0000-0000-0000-000000000115',
   'felt exactly the same after mine. it keeps getting better, stick with it 🌿', 17600),
 ('f4000000-0000-0000-0000-00000000110d','f1000000-0000-0000-0000-000000000057','f4000000-0000-0000-0000-000000000115',
   'grab me before next week''s sit and i''ll get your posture dialed in. makes a world of difference.', 17400)
) AS v(id, author_id, parent_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — Silent Half-Day Sit (past, -7d). Host = circle host.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug, starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-00000000000a'::uuid,
       'f1000000-0000-0000-0000-000000000054'::uuid,
       'f2000000-0000-0000-0000-000000000005'::uuid, 'circle',
       'Silent Half-Day Sit', 'cottonwood-silent-sit',
       ((now() - interval '7 days')::date + time '08:00')::timestamptz,
       ((now() - interval '7 days')::date + time '12:00')::timestamptz,
       'Cottonwood Creek Park, Encinitas', false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-00000000000a'::uuid);

COMMIT;
