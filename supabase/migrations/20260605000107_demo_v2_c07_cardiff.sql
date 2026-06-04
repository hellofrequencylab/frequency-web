-- =====================================================================
-- Demo seed v2 — CIRCLE 7: Cardiff Cold Plunge (holistic-health)
-- =====================================================================
-- Dawn reef plunges at Cardiff-by-the-Sea. Host rank ⚡ Conduit.
-- Roster 20: Lum 0 / Con 1 / Agt 2 / Op 4 / Run 7 / Ghost 6.
-- Profile tails 7e–91, posts 0181–01c0, replies 1181–11c0,
-- events f5…06 (100-Day Plunge Celebration, past) + f5…10 (Sunrise Reef
-- Plunge, upcoming), active practice e1…0004 (Cold plunge).
--
-- Mirrors 20260603000003_demo_2_sandiego.sql. All rows is_demo=true,
-- deterministic UUIDs + ON CONFLICT DO NOTHING, safe to re-run.
-- member_count is left to the membership trigger (NOT hand-set).
-- =====================================================================

BEGIN;

-- Resolve shared geography once (region + this circle's channel).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='holistic-health') AS channel_id;

-- =====================================================================
-- 1. CIRCLE
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000007'::uuid,
       'Cardiff Cold Plunge', 'cardiff-cold-plunge',
       NULL::uuid, 'in-person', 50, 'active',
       'Dawn cold-water dips at the Cardiff reef. We breathe together on the sand, plunge at first light, and recover with ginger tea. Two minutes is plenty for your first time — come change your year.',
       33.0150, -117.2800, 'Cardiff-by-the-Sea', 'Cardiff-by-the-Sea',
       ctx.channel_id,
       'https://picsum.photos/seed/cardiff-cold-plunge/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (20) — tails 7e–91. Stats sit inside §3 rank bands.
--    community_role: 1 host (top-ranked Conduit), 2 crew, 1 guide,
--    1 mentor; everyone else member. season_challenges_complete=true
--    only for Luminaries (none here → all false).
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
       m.season_zaps, m.lifetime_zaps, m.gems,
       m.streak, m.longest_streak, m.achievements,
       false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank,
 --   season_zaps, lifetime_zaps, gems, streak, longest_streak, achievements, minutes-since-seen
 -- ---- Conduit · HOST ----
 ('f1000000-0000-0000-0000-00000000007e','Sigrid Halvorsen','sigrid.plunge','host',
   'Cold-water guide. The reef at first light will change your whole year. Long exhale, then in.',
   true,'conduit',1840,5600,1180,24,31,19,12),
 -- ---- Agent · CREW (×2) ----
 ('f1000000-0000-0000-0000-00000000007f','Reza Tahan','reza.icebreath','crew',
   'I time the rounds and keep the ginger tea hot. Don''t fight the gasp — ride it.',
   true,'agent',1180,3100,640,16,18,14,40),
 ('f1000000-0000-0000-0000-000000000080','Joelle Marchetti','joelle.reefdawn','crew',
   'Group-text wrangler and tide-chart obsessive. If the water''s 58, I''m already on the sand.',
   true,'agent',860,2400,470,12,15,12,55),
 -- ---- Operative · GUIDE + members (×4) ----
 ('f1000000-0000-0000-0000-000000000081','Aksel Berg','aksel.coldreef','guide',
   'Eight winters of Wim Hof and reef dawns. Happy to coach your breath before your first plunge.',
   true,'operative',620,1700,360,13,16,10,210),
 ('f1000000-0000-0000-0000-000000000082','Mira Donnelly','mira.plunge','member',
   'The gasp, then the calm. Hooked since day one. Two-minute regular now.',
   true,'operative',540,1500,300,11,13,9,30),
 ('f1000000-0000-0000-0000-000000000083','Niko Vasquez','niko.coldwater','member',
   'Surfer who finally embraced the cold without a wetsuit. The reef humbles you kindly.',
   true,'operative',460,1300,260,9,12,8,160),
 ('f1000000-0000-0000-0000-000000000084','Priya Anand','priya.dawnplunge','member',
   'Nurse on night shifts — cold mornings reset me better than sleep ever did.',
   false,'operative',360,1000,190,7,10,7,720),
 -- ---- Runner (×7) ----
 ('f1000000-0000-0000-0000-000000000085','Tobias Lund','tobias.reef','member',
   'Came for recovery after a knee rebuild, stayed for the morning crew.',
   true,'runner',260,640,120,6,8,6,18),
 ('f1000000-0000-0000-0000-000000000086','Amara Cole','amara.plunge','member',
   'Anxiety melts in 90 seconds of cold. Cheaper than therapy, colder than coffee.',
   true,'runner',220,560,100,5,7,5,9),
 ('f1000000-0000-0000-0000-000000000087','Diego Salcedo','diego.coldreef','member',
   'Free-diver using the plunge to extend my breath-hold. Bonus: I''m calmer all day.',
   true,'runner',190,500,90,4,6,5,200),
 ('f1000000-0000-0000-0000-000000000088','Hana Yoshida','hana.icereef','member',
   'Brought a thermos, brought a friend, brought my whole nervous system back online.',
   false,'runner',160,440,75,4,5,4,1440),
 ('f1000000-0000-0000-0000-000000000089','Soren Dahl','soren.plunge','member',
   'Weekday warrior. Plunge, dry off, ship code. The cold makes the standups bearable.',
   true,'runner',130,380,60,3,5,4,15),
 ('f1000000-0000-0000-0000-00000000008a','Lucia Ferraro','lucia.reefdawn','member',
   'Traded my snooze button for the reef stairs. Best swap I''ve made all year.',
   true,'runner',110,330,55,3,4,4,260),
 ('f1000000-0000-0000-0000-00000000008b','Marcus Webb','marcus.coldplunge','member',
   'Big guy, big gasp, big smile after. The crew kept me coming back.',
   false,'runner',100,310,50,2,4,4,2880),
 -- ---- Ghost (×6) — one is the mentor; ~75% post once, ~25% silent ----
 ('f1000000-0000-0000-0000-00000000008c','Indira Rao','indira.stillcold','mentor',
   'Breath teacher for a decade. The ocean is the real facilitator — I just hold the count.',
   true,'ghost',88,260,55,2,3,4,300),
 ('f1000000-0000-0000-0000-00000000008d','Felix Brenner','felix.newplunge','member',
   'Just moved from Tahoe. Traded snow for saltwater shock. Figuring it out one dip at a time.',
   true,'ghost',70,200,40,2,3,3,140),
 ('f1000000-0000-0000-0000-00000000008e','Greta Olsen','greta.coldreef','member',
   'Lurked for a month watching the tide reports. Finally got in. No regrets.',
   true,'ghost',55,150,30,1,2,3,520),
 ('f1000000-0000-0000-0000-00000000008f','Ravi Menon','ravi.reefcold','member',
   'Skeptic dragged here by a friend. Annoyingly, it worked.',
   false,'ghost',40,110,20,1,2,2,4320),
 ('f1000000-0000-0000-0000-000000000090','Tess Whitfield','tess.dawnice','member',
   'New to the cold, big on the after-coffee part. Slowly earning my two minutes.',
   true,'ghost',28,80,15,1,1,2,860),
 ('f1000000-0000-0000-0000-000000000091','Jonah Pike','jonah.coldstart','member',
   'Bought the changing robe, committed to the bit. See you at the reef.',
   false,'ghost',20,60,10,0,1,1,7200)
) AS m(id,display_name,handle,role,bio,avatar,rank,
       season_zaps,lifetime_zaps,gems,streak,longest_streak,achievements,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role.
--    member_count maintained by trigger. No cross-memberships here.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-000000000007'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id IN (
  'f1000000-0000-0000-0000-00000000007e','f1000000-0000-0000-0000-00000000007f',
  'f1000000-0000-0000-0000-000000000080','f1000000-0000-0000-0000-000000000081',
  'f1000000-0000-0000-0000-000000000082','f1000000-0000-0000-0000-000000000083',
  'f1000000-0000-0000-0000-000000000084','f1000000-0000-0000-0000-000000000085',
  'f1000000-0000-0000-0000-000000000086','f1000000-0000-0000-0000-000000000087',
  'f1000000-0000-0000-0000-000000000088','f1000000-0000-0000-0000-000000000089',
  'f1000000-0000-0000-0000-00000000008a','f1000000-0000-0000-0000-00000000008b',
  'f1000000-0000-0000-0000-00000000008c','f1000000-0000-0000-0000-00000000008d',
  'f1000000-0000-0000-0000-00000000008e','f1000000-0000-0000-0000-00000000008f',
  'f1000000-0000-0000-0000-000000000090','f1000000-0000-0000-0000-000000000091'
)
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active: Cold plunge (e1…0004), set_by host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000007'::uuid,
        'e1000000-0000-0000-0000-000000000004'::uuid,
        'f1000000-0000-0000-0000-00000000007e'::uuid, true)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank cadence (Con 3, Agt 2, Op 1–2, Run 1, Ghost ~75%×1).
--    Tails 0181–01c0. ≥1 recap of the 100-Day Celebration, ≥1 announcing
--    the Sunrise Reef Plunge. created_at staggered over the last ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000007'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_hours || ' hours')::interval, true
FROM (VALUES
 -- ---- HOST (Conduit) ×3 ----
 ('f4000000-0000-0000-0000-000000000181','f1000000-0000-0000-0000-00000000007e',
   'sunrise reef plunge is on for this week 🧊 we meet on the sand at 6:30, breathe together, then in we go at first light. water''s sitting around 60. two minutes is plenty for your first time — you''ll walk out a new human. bring a towel and something warm for after.', 30),
 ('f4000000-0000-0000-0000-000000000182','f1000000-0000-0000-0000-00000000007e',
   'still floating from the 100-day plunge celebration last month 🥹 watching this crew go from white-knuckle gaspers to people who exhale and just sink in — that''s the whole thing. 100 mornings at the reef together. thank you for showing up in the dark and the cold. here''s to the next hundred.', 640),
 ('f4000000-0000-0000-0000-000000000183','f1000000-0000-0000-0000-00000000007e',
   'first-timer note since we''ve got new faces: the cold is not the enemy, the breath is the whole game. long slow exhale as you lower in, drop the shoulders, let the gasp pass. you''re never alone out there — someone''s always counting you through it.', 200),

 -- ---- CREW (Agent) ×2 each ----
 ('f4000000-0000-0000-0000-000000000184','f1000000-0000-0000-0000-00000000007f',
   'i''ll have the timer and a thermos of ginger tea going at the stairs before sunrise. the trick is the exhale — long and slow as you get in. don''t fight the gasp, ride it. i''ve got you on the count. ❄️', 26),
 ('f4000000-0000-0000-0000-000000000185','f1000000-0000-0000-0000-00000000007f',
   'recap from the 100-day celebration: we did a group round on the sand, then 17 of us went in together at first light. the cheer when everyone surfaced is burned into my brain. proud of this crew. 🔥🧊', 600),
 ('f4000000-0000-0000-0000-000000000186','f1000000-0000-0000-0000-000000000080',
   'tide + temp check for the sunrise plunge: low tide right around dawn so the reef access is easy, water reading 59–60. glassy and clear. genuinely could not ask for a better morning to get in. see you on the sand. 🌅', 28),
 ('f4000000-0000-0000-0000-000000000187','f1000000-0000-0000-0000-000000000080',
   'reminder there''s no wetsuit-required vibe here and no macho thing either. stay in for 30 seconds or two minutes, both count. we''re here to reset the nervous system, not to suffer for points.', 320),

 -- ---- GUIDE (Operative) ×2 ----
 ('f4000000-0000-0000-0000-000000000188','f1000000-0000-0000-0000-000000000081',
   'breath coaching offer stands: if it''s your first reef dawn, find me 10 min early and i''ll walk you through the exhale-led entry. eight winters in and i still do my rounds on the sand first. it works. happy to share it.', 210),
 ('f4000000-0000-0000-0000-000000000189','f1000000-0000-0000-0000-000000000081',
   'small thing that changed everything for me: warm the core BEFORE, not just after. light movement on the sand, a few big breaths, then in. you''ll last longer and shiver less. dawn reef science. 🧊', 900),

 -- ---- members (Operative) ×1–2 ----
 ('f4000000-0000-0000-0000-00000000018a','f1000000-0000-0000-0000-000000000082',
   'two minutes in the cold this morning and i''ve been buzzing and calm all day. didn''t even touch my afternoon coffee. whatever this is, i''m keeping it. ❄️', 50),
 ('f4000000-0000-0000-0000-00000000018b','f1000000-0000-0000-0000-000000000082',
   'going to the 100-day celebration was the moment i realized i''m actually part of something here. didn''t know a single name in january. now i know everyone''s gasp. 🥹', 660),
 ('f4000000-0000-0000-0000-00000000018c','f1000000-0000-0000-0000-000000000083',
   'finally ditched the wetsuit this week and went in bare. the reef does not care about your ego and i love it for that. the after-glow is unreal.', 180),
 ('f4000000-0000-0000-0000-00000000018d','f1000000-0000-0000-0000-000000000084',
   'rolled off a night shift straight to the reef at dawn instead of crashing. against all logic i feel more rested than if i''d slept. cold mornings + this crew = my actual medicine.', 700),

 -- ---- Runner ×1 each (7) ----
 ('f4000000-0000-0000-0000-00000000018e','f1000000-0000-0000-0000-000000000085',
   'six weeks post knee rebuild and the cold plunge is the only thing that takes the swelling down for real. came for recovery, staying for the morning crew. 🙏', 18),
 ('f4000000-0000-0000-0000-00000000018f','f1000000-0000-0000-0000-000000000086',
   '90 seconds in the cold and the worry-spiral just… stops. cheaper than therapy, colder than coffee, better than both some mornings.', 9),
 ('f4000000-0000-0000-0000-000000000190','f1000000-0000-0000-0000-000000000087',
   'free-diver here using the plunge for breath-hold training and it''s working — but honestly i keep coming back for how calm i am the rest of the day. bonus calm. 🌊', 200),
 ('f4000000-0000-0000-0000-000000000191','f1000000-0000-0000-0000-000000000088',
   'brought a thermos and a nervous friend to the reef this morning. she gasped, she laughed, she''s coming back tuesday. that''s how it gets you. ❄️', 240),
 ('f4000000-0000-0000-0000-000000000192','f1000000-0000-0000-0000-000000000089',
   'plunge → dry off → ship code. the cold genuinely makes the morning standups bearable. who knew freezing on a reef was a productivity hack.', 15),
 ('f4000000-0000-0000-0000-000000000193','f1000000-0000-0000-0000-00000000008a',
   'traded my snooze button for the reef stairs and i don''t recognize my mornings anymore. in the best way. best swap i''ve made all year.', 260),
 ('f4000000-0000-0000-0000-000000000194','f1000000-0000-0000-0000-00000000008b',
   'big guy, big gasp, big smile after. didn''t think the cold was for me. the crew talked me through round one and now i can''t stop. 🧊', 480),

 -- ---- Ghost ×1 (4 of 6; mentor + 3 newcomers post, 2 silent) ----
 ('f4000000-0000-0000-0000-000000000195','f1000000-0000-0000-0000-00000000008c',
   'a gentle word for the new folks: you don''t have to conquer the cold. just meet it. one breath at a time, the reef does the rest. holding the count for whoever shows up at dawn. 🙏', 300),
 ('f4000000-0000-0000-0000-000000000196','f1000000-0000-0000-0000-00000000008d',
   'tahoe transplant here — traded snow for saltwater shock. first reef dawn was brutal and now i''m weirdly looking forward to the next one. is this normal? 😅', 150),
 ('f4000000-0000-0000-0000-000000000197','f1000000-0000-0000-0000-00000000008e',
   'lurked on the tide reports for a month before i finally got in. should have done it weeks ago. hi everyone, i''m in now. ❄️', 520),
 ('f4000000-0000-0000-0000-000000000198','f1000000-0000-0000-0000-000000000090',
   'new to all this and very much here for the after-coffee part, but the two minutes in the water are growing on me. slowly earning my spot on the sand. 🌅', 860)
) AS v(id, author_id, body, age_hours)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — 12, clustered on the liveliest posts (sunrise announce,
--    100-day recap, the host's first-timer note). Reply block 1181–11c0.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000007'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_hours || ' hours')::interval, true
FROM (VALUES
 -- on the sunrise reef plunge announcement (…0181)
 ('f4000000-0000-0000-0000-000000001181','f1000000-0000-0000-0000-000000000086','f4000000-0000-0000-0000-000000000181',
   'first-timer here and terrified but i''m coming. someone hold my towel. 😅', 28),
 ('f4000000-0000-0000-0000-000000001182','f1000000-0000-0000-0000-00000000007f','f4000000-0000-0000-0000-000000000181',
   'i''ll hold the towel AND the tea. you''ve got this. just breathe out as you go in.', 27),
 ('f4000000-0000-0000-0000-000000001183','f1000000-0000-0000-0000-000000000089','f4000000-0000-0000-0000-000000000181',
   'in. setting three alarms so the snooze button doesn''t win this time.', 26),
 ('f4000000-0000-0000-0000-000000001184','f1000000-0000-0000-0000-00000000008d','f4000000-0000-0000-0000-000000000181',
   'count me in for my second ever. last one wrecked me in the best way.', 24),

 -- on the host's 100-day celebration recap (…0182)
 ('f4000000-0000-0000-0000-000000001185','f1000000-0000-0000-0000-000000000082','f4000000-0000-0000-0000-000000000182',
   'that surfacing cheer 🥹 i think about it every cold morning. here for the next hundred.', 636),
 ('f4000000-0000-0000-0000-000000001186','f1000000-0000-0000-0000-000000000081','f4000000-0000-0000-0000-000000000182',
   'proudest morning of my year, no contest. this crew is something special.', 632),
 ('f4000000-0000-0000-0000-000000001187','f1000000-0000-0000-0000-00000000008c','f4000000-0000-0000-0000-000000000182',
   'watching the gaspers become guides has been the gift. grateful to count for you all.', 620),

 -- on crew recap (…0185)
 ('f4000000-0000-0000-0000-000000001188','f1000000-0000-0000-0000-000000000083','f4000000-0000-0000-0000-000000000185',
   '17 of us in at once was unreal. felt the temperature of the whole crew''s stoke, not the water.', 598),
 ('f4000000-0000-0000-0000-000000001189','f1000000-0000-0000-0000-00000000008b','f4000000-0000-0000-0000-000000000185',
   'my first ever plunge was that day. terrified going in, hooked coming out.', 590),

 -- on the host's first-timer breath note (…0183)
 ('f4000000-0000-0000-0000-00000000118a','f1000000-0000-0000-0000-000000000090','f4000000-0000-0000-0000-000000000183',
   'this is the reassurance i needed, thank you. the breath part makes it sound doable.', 198),
 ('f4000000-0000-0000-0000-00000000118b','f1000000-0000-0000-0000-000000000081','f4000000-0000-0000-0000-000000000183',
   'exhale-led entry is everything. come find me on the sand and i''ll demo it.', 195),

 -- on the night-shift nurse post (…018d)
 ('f4000000-0000-0000-0000-00000000118c','f1000000-0000-0000-0000-000000000087','f4000000-0000-0000-0000-00000000018d',
   'the post-nightshift plunge is elite recovery. respect for choosing the reef over the bed.', 696)
) AS v(id, author_id, parent_id, body, age_hours)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENTS — both hosted by the circle host (…007e).
--    06: 100-Day Plunge Celebration (past, -28d 06:30).
--    10: Sunrise Reef Plunge (upcoming, +2d 06:30).
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT v.id::uuid, 'f1000000-0000-0000-0000-00000000007e'::uuid,
       'f2000000-0000-0000-0000-000000000007'::uuid, 'circle',
       v.title, v.slug, v.starts_at::timestamptz, v.ends_at::timestamptz,
       v.location, false, true
FROM (VALUES
 ('f5000000-0000-0000-0000-000000000006',
   '100-Day Plunge Celebration','cardiff-100-day-plunge',
   (now() - interval '28 days')::date + time '06:30',
   (now() - interval '28 days')::date + time '08:30',
   'Cardiff reef beach access'),
 ('f5000000-0000-0000-0000-000000000010',
   'Sunrise Reef Plunge','cardiff-sunrise-reef-plunge',
   (now() + interval '2 days')::date + time '06:30',
   (now() + interval '2 days')::date + time '07:30',
   'Cardiff reef beach access')
) AS v(id, title, slug, starts_at, ends_at, location)
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = v.id::uuid);

COMMIT;
