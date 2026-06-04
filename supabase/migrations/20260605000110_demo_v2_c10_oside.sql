-- =====================================================================
-- Demo v2 seed — CIRCLE 10: Oside Sunrise Surf  (channel: movement)
-- =====================================================================
-- Pier dawn-patrol crew off Oceanside Pier. Longboards, groms, tacos after.
-- 21 primary members, host = a Luminary (🌟). Roster quota:
--   Lum 1 / Con 1 / Agent 3 / Operative 5 / Runner 6 / Ghost 5.
-- One BEGIN/COMMIT, idempotent (deterministic UUIDs + ON CONFLICT DO NOTHING).
--
-- UUID blocks (strictly inside these, per docs/DEMO-CAST.md Part B):
--   profiles  f1000000-…-0000000000NN  tails bb–cf  (21 people)
--   circle    f2000000-0000-0000-0000-00000000000a  (note: tail 0a, NOT 10)
--   posts     f4000000-…-0000000NNNNN  tails 0241–0280
--   replies   f4000000-…-0000000NNNNN  tails 1241–1280
--   event     f5000000-…-0000000000NN  tail 09 (Grom Surf Comp, -10d 07:30)
--   practice  e1000000-0000-0000-0000-000000000001 (Dawn patrol surf), set_by host
--
-- Schema rules copied VERBATIM from DEMO-CAST.md §B.5. Do NOT set member_count
-- (the membership trigger maintains it). community_role enum: member|crew|host|
-- guide|mentor — exactly 1 host (the Luminary), 2 crew, 1 guide, rest member.
-- season_challenges_complete=true ONLY for the Luminary.
-- =====================================================================

BEGIN;

-- Resolve shared geography + channel once (mirror the SD template).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='movement') AS channel_id;

-- =====================================================================
-- 1. CIRCLE  (hub_id NULL, type in-person, member_cap 50; member_count -> trigger)
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-00000000000a'::uuid,
       'Oside Sunrise Surf', 'oside-sunrise-surf',
       NULL::uuid, 'in-person', 50, 'active',
       'Dawn patrol off Oceanside Pier. Longboards, shortboards, groms and graybeards. We paddle out at first light, trade waves on the north side, then roll for breakfast tacos. All levels, all stoke.',
       33.1933, -117.3831, 'Oceanside Pier', 'Oceanside',
       ctx.channel_id,
       'https://picsum.photos/seed/oside-sunrise-surf/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (21) — tails bb–cf. Stats sit inside the §3 rank bands.
--    season_challenges_complete=true ONLY for the Luminary host.
--    avatar for ~75%; leaders seen recently, ghosts older.
-- =====================================================================
INSERT INTO profiles (id, auth_user_id, display_name, handle, community_role,
                      nexus_region_id, bio, avatar_url, current_season_rank,
                      current_season_zaps, lifetime_zaps, lifetime_gems,
                      current_streak, longest_streak, achievement_count,
                      season_challenges_complete, last_seen_at, is_active, is_demo)
SELECT p.id::uuid, NULL, p.display_name, p.handle, p.role::community_role,
       ctx.region_id, p.bio,
       CASE WHEN p.avatar THEN 'https://i.pravatar.cc/240?u=' || p.handle ELSE NULL END,
       p.rank::season_rank_enum,
       p.szaps, p.lzaps, p.gems, p.streak, p.lstreak, p.achv,
       p.season_complete,
       now() - (p.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, name, handle, role, rank, szaps, lzaps, gems, streak, lstreak, achv, season_complete, avatar, seen_min, bio
 -- ---- Luminary (1) — HOST ----
 ('f1000000-0000-0000-0000-0000000000bb','Kai Moana','kai.moana.oside','host','luminary',
   2980, 10400, 2150, 44, 51, 26, true, true, 6,
   'Pier rat since birth. Dawn patrol then tacos, no exceptions. If the buoy''s up, I''m already wet.'),

 -- ---- Conduit (1) ----
 ('f1000000-0000-0000-0000-0000000000bc','Esme Vcollard','esme.vollard.oside','crew','conduit',
   1880, 5600, 1180, 24, 27, 19, false, true, 42,
   'Surf-report poster and stoke amplifier. I run the group chat and the post-session taco run.'),

 -- ---- Agents (3) ----
 ('f1000000-0000-0000-0000-0000000000bd','Tomas Quill','tomas.quill.oside','crew','agent',
   1240, 3100, 690, 18, 21, 14, false, true, 30,
   'North-side longboard logger. I''ll wave you into the set wave, then razz you for missing it.'),
 ('f1000000-0000-0000-0000-0000000000be','Marisol Vega','marisol.vega.oside','guide','agent',
   980, 2700, 540, 14, 17, 13, false, true, 90,
   'Coached groms for fifteen years. Happy to share a peak, a pointer, and the right tide window.'),
 ('f1000000-0000-0000-0000-0000000000bf','Hollis Trent','hollis.trent.oside','member','agent',
   820, 2200, 470, 11, 14, 12, false, false, 150,
   'Shaper out of a Oside garage. I ride my mistakes so you don''t have to.'),

 -- ---- Operatives (5) ----
 ('f1000000-0000-0000-0000-0000000000c0','Bruno Salcedo','bruno.salcedo.oside','member','operative',
   620, 1600, 340, 12, 14, 10, false, true, 22,
   'North-side logger, every morning I can swing it before the kids wake up.'),
 ('f1000000-0000-0000-0000-0000000000c1','Dahlia Mercer','dahlia.mercer.oside','member','operative',
   540, 1350, 290, 9, 11, 9, false, true, 70,
   'Traded a desk for tide charts. Mid-tide glass is the only meeting I keep.'),
 ('f1000000-0000-0000-0000-0000000000c2','Reza Amini','reza.amini.oside','member','operative',
   470, 1100, 240, 8, 10, 8, false, false, 200,
   'Shortboarder relearning patience on a log. The pier crowd is shockingly kind.'),
 ('f1000000-0000-0000-0000-0000000000c3','Penny Aoki','penny.aoki.oside','member','operative',
   400, 980, 210, 7, 9, 8, false, true, 30,
   'Grom mom turned surfer. The pier crew adopted us and never gave us back.'),
 ('f1000000-0000-0000-0000-0000000000c4','Gideon Marsh','gideon.marsh.oside','member','operative',
   330, 840, 175, 6, 8, 7, false, false, 1440,
   'Bodysurf convert. Fins, foam, and the best company on the sand.'),

 -- ---- Runners (6) ----
 ('f1000000-0000-0000-0000-0000000000c5','Lena Faro','lena.faro.oside','member','runner',
   270, 700, 140, 7, 9, 6, false, true, 18,
   'Weekend warrior chasing the glassy mornings. Slowly earning my spot on the peak.'),
 ('f1000000-0000-0000-0000-0000000000c6','Cy Beaumont','cy.beaumont.oside','member','runner',
   210, 560, 110, 5, 7, 5, false, true, 12,
   'Learning the etiquette one wave (and one mistake) at a time.'),
 ('f1000000-0000-0000-0000-0000000000c7','Maeve Dunleavy','maeve.dunleavy.oside','member','runner',
   180, 470, 90, 4, 6, 5, false, false, 320,
   'Cold water, warm crew. Here for the sunrise more than the barrels.'),
 ('f1000000-0000-0000-0000-0000000000c8','Otis Krange','otis.krange.oside','member','runner',
   150, 400, 75, 4, 5, 4, false, true, 60,
   'Surf-cam screenshotter and group-chat hype man. See you at 6.'),
 ('f1000000-0000-0000-0000-0000000000c9','Suki Larsen','suki.larsen.oside','member','runner',
   130, 340, 62, 3, 5, 4, false, true, 9,
   'Free-diver using dawn patrol to start the day slow and salty.'),
 ('f1000000-0000-0000-0000-0000000000ca','Andre Pico','andre.pico.oside','member','runner',
   110, 300, 55, 2, 4, 4, false, false, 900,
   'Bought the wetsuit, committed to the bit. No regrets so far.'),

 -- ---- Ghosts (5) — ~75% post one short newcomer line, ~25% silent ----
 ('f1000000-0000-0000-0000-0000000000cb','Greer Halloran','greer.halloran.oside','member','ghost',
   85, 260, 45, 2, 3, 3, false, true, 14,
   'Just moved from Tahoe. Snow to surf, figuring out which end of the board is up.'),
 ('f1000000-0000-0000-0000-0000000000cc','Imani Soto','imani.soto.oside','member','ghost',
   62, 180, 30, 1, 2, 2, false, true, 220,
   'Beginner foamie rider, big on the after-coffee part.'),
 ('f1000000-0000-0000-0000-0000000000cd','Ned Calloway','ned.calloway.oside','member','ghost',
   44, 120, 20, 1, 2, 2, false, false, 4320,
   'Lurked for a month, finally paddled out off the pier. No regrets.'),
 ('f1000000-0000-0000-0000-0000000000ce','Talia Brandt','talia.brandt.oside','member','ghost',
   28, 80, 14, 0, 1, 1, false, true, 7,
   'Midwest kid. The ocean at sunrise still feels completely unreal.'),
 ('f1000000-0000-0000-0000-0000000000cf','Wes Okafor','wes.okafor.oside','member','ghost',
   18, 40, 8, 0, 1, 1, false, false, 5760,
   'Grom dad. If the kids paddle out off the pier, so do I.')
) AS p(id, display_name, handle, role, rank, szaps, lzaps, gems, streak, lstreak, achv,
       season_complete, avatar, seen_min, bio)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role
--    (members -> NULL). member_count maintained by the trigger.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT mm.profile_id::uuid, 'f2000000-0000-0000-0000-00000000000a'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM (VALUES
 ('f1000000-0000-0000-0000-0000000000bb'),
 ('f1000000-0000-0000-0000-0000000000bc'),
 ('f1000000-0000-0000-0000-0000000000bd'),
 ('f1000000-0000-0000-0000-0000000000be'),
 ('f1000000-0000-0000-0000-0000000000bf'),
 ('f1000000-0000-0000-0000-0000000000c0'),
 ('f1000000-0000-0000-0000-0000000000c1'),
 ('f1000000-0000-0000-0000-0000000000c2'),
 ('f1000000-0000-0000-0000-0000000000c3'),
 ('f1000000-0000-0000-0000-0000000000c4'),
 ('f1000000-0000-0000-0000-0000000000c5'),
 ('f1000000-0000-0000-0000-0000000000c6'),
 ('f1000000-0000-0000-0000-0000000000c7'),
 ('f1000000-0000-0000-0000-0000000000c8'),
 ('f1000000-0000-0000-0000-0000000000c9'),
 ('f1000000-0000-0000-0000-0000000000ca'),
 ('f1000000-0000-0000-0000-0000000000cb'),
 ('f1000000-0000-0000-0000-0000000000cc'),
 ('f1000000-0000-0000-0000-0000000000cd'),
 ('f1000000-0000-0000-0000-0000000000ce'),
 ('f1000000-0000-0000-0000-0000000000cf')
) AS mm(profile_id)
JOIN profiles p ON p.id = mm.profile_id::uuid
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active practice set by the host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-00000000000a'::uuid,
        'e1000000-0000-0000-0000-000000000001'::uuid,
        'f1000000-0000-0000-0000-0000000000bb'::uuid,
        true)
ON CONFLICT (circle_id, practice_id) DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank counts (Lum 4, Con 3, Agt 2, Op 1–2, Run 1, ~75%
--    Ghosts one short post + ~25% silent). Tails 0241–0280.
--    scope_id = circle, visibility group, created_at = now() - random window.
--    ≥1 recaps the Grom Surf Comp; ≥1 about dawn sessions.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-00000000000a'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- ===== Luminary host (bb) — 4 posts =====
 ('f4000000-0000-0000-0000-000000000241','f1000000-0000-0000-0000-0000000000bb',
   'welcome to Oside Sunrise Surf 🌅 the deal is simple: paddle out at first light off the north side of the pier, trade some waves, then we roll for breakfast tacos. all levels, all boards, zero ego. if you''re new, find me on the sand first and i''ll point you to a friendly peak.',
   62000),
 ('f4000000-0000-0000-0000-000000000242','f1000000-0000-0000-0000-0000000000bb',
   'dawn patrol tomorrow — buoy''s reading waist-to-chest, light offshore til about 9, mid-tide filling in. longboard kind of morning. paddle out 6 sharp, i''ll be the one already grinning by the third piling. ☕ after at the usual taco window.',
   1500),
 ('f4000000-0000-0000-0000-000000000243','f1000000-0000-0000-0000-0000000000bb',
   'GROM COMP RECAP 🏆 what a morning. forty-some kids, perfect little peelers on the north side, and not a single dry eye when the under-8s caught their first comp waves. huge thanks to everyone who ran heats, slung tacos, and cheered til they lost their voices. this is exactly why we get up before the sun. 🤙',
   13800),
 ('f4000000-0000-0000-0000-000000000244','f1000000-0000-0000-0000-0000000000bb',
   'reminder that dawn patrol is a year-round thing, not a fair-weather thing. cold mornings are the quiet ones — empty lineup, glassy faces, just the crew. some of the best sessions of my life have been 58-degree water and nobody out. see you at the pier.',
   34000),

 -- ===== Conduit (bc) — 3 posts =====
 ('f4000000-0000-0000-0000-000000000245','f1000000-0000-0000-0000-0000000000bc',
   'surf report 📋 small but clean this morning, wind''s light til mid, tide''s dropping through the session. i''ll post a pier photo at 5:45 so you can see before you commit. group chat''s open for carpools from the south lot.',
   2200),
 ('f4000000-0000-0000-0000-000000000246','f1000000-0000-0000-0000-0000000000bc',
   'taco accounting from after the grom comp: we put away an absurd number of breakfast burritos and i regret nothing. shout out to the window crew for staying open late for us. dawn patrol earns the carbs. 🌯',
   12600),
 ('f4000000-0000-0000-0000-000000000247','f1000000-0000-0000-0000-0000000000bc',
   'newcomers — don''t be shy about the group chat. that''s where the daily "you out?" texts live and it''s how half this crew became friends. drop a wave emoji and someone will adopt you by friday.',
   48000),

 -- ===== Agents (bd, be, bf) — 2 posts each =====
 ('f4000000-0000-0000-0000-000000000248','f1000000-0000-0000-0000-0000000000bd',
   'north side has been the call all week — the lefts off the second sandbar are peeling forever. longboarders this is your moment. i''ll wave you into one, no charge. 🏄',
   5400),
 ('f4000000-0000-0000-0000-000000000249','f1000000-0000-0000-0000-0000000000bd',
   'grom comp was a blast to help run. watching a kid who could barely stand last month link three turns in a heat? unreal. that''s the whole point of dawn patrol — the next crew coming up.',
   14400),
 ('f4000000-0000-0000-0000-00000000024a','f1000000-0000-0000-0000-0000000000be',
   'little etiquette note for the newer folks at the pier: watch where the regulars sit, don''t paddle straight to the peak, and call your drop. give a smile and a hoot and you''ll be welcome on any peak here. respect the lineup, it gives back.',
   7200),
 ('f4000000-0000-0000-0000-00000000024b','f1000000-0000-0000-0000-0000000000be',
   'if you''ve got a grom who wants to learn, bring them to a dawn session — we go gentle and there''s always an extra set of hands on the inside. the pier is the friendliest classroom on the coast.',
   26000),
 ('f4000000-0000-0000-0000-00000000024c','f1000000-0000-0000-0000-0000000000bf',
   'shaped a new 9''2 log this week and tested it at first light off the pier this morning. glides like butter on the north-side rollers. swing by the garage if you want to feel one before you commit to a board. 🔧',
   9000),
 ('f4000000-0000-0000-0000-00000000024d','f1000000-0000-0000-0000-0000000000bf',
   'pro tip from a guy who''s broken a lot of boards: wax your deck the night before so you''re not fumbling in the dark at 5:45. dawn patrol rewards the prepared.',
   38000),

 -- ===== Operatives (c0–c4) — ~1–2 each =====
 ('f4000000-0000-0000-0000-00000000024e','f1000000-0000-0000-0000-0000000000c0',
   'snuck a dawn session in before the kids woke up and the north side was glass. nothing fixes a week like a sunrise log session and a taco. back tomorrow if the buoy holds.',
   16000),
 ('f4000000-0000-0000-0000-00000000024f','f1000000-0000-0000-0000-0000000000c0',
   'helped sling tacos at the grom comp and somehow ate more than i served. great morning, great kids, great crew. 🌯🤙',
   13200),
 ('f4000000-0000-0000-0000-000000000250','f1000000-0000-0000-0000-0000000000c1',
   'mid-tide glass this morning was the only meeting i kept all day and i regret nothing. this is why i traded the desk for tide charts.',
   21000),
 ('f4000000-0000-0000-0000-000000000251','f1000000-0000-0000-0000-0000000000c2',
   'relearning patience on a log after years on a shortboard. the pier crowd has been shockingly kind about my flailing. caught two clean ones at dawn and felt like a kid again.',
   28000),
 ('f4000000-0000-0000-0000-000000000252','f1000000-0000-0000-0000-0000000000c3',
   'my kid surfed her first heat at the grom comp and i cried behind my sunglasses the entire time. this crew adopted us off the pier and i will never get over how kind everyone is. 🥹',
   13500),
 ('f4000000-0000-0000-0000-000000000253','f1000000-0000-0000-0000-0000000000c4',
   'bodysurfed the dawn session this morning — no board, just fins and foam and the sunrise. cannot recommend it enough when the waves are small and the company''s good.',
   33000),

 -- ===== Runners (c5–ca) — 1 each =====
 ('f4000000-0000-0000-0000-000000000254','f1000000-0000-0000-0000-0000000000c5',
   'finally caught a clean one off the point this morning and the hoots from the lineup made my whole week. slowly earning my spot on the peak. ☀️',
   42000),
 ('f4000000-0000-0000-0000-000000000255','f1000000-0000-0000-0000-0000000000c6',
   'learning the etiquette one mistake at a time but everyone''s been patient with a kook. dawn patrol is the best part of my morning now.',
   50000),
 ('f4000000-0000-0000-0000-000000000256','f1000000-0000-0000-0000-0000000000c7',
   'cold water, warm crew. came for the sunrise more than the barrels and i''m not disappointed. the after-coffee debrief might be my favorite part.',
   56000),
 ('f4000000-0000-0000-0000-000000000257','f1000000-0000-0000-0000-0000000000c8',
   'i screenshot the surf cam every morning at 5am like a maniac so you don''t have to. tomorrow''s looking fun — see you at the pier, hype levels maxed. 📸',
   31000),
 ('f4000000-0000-0000-0000-000000000258','f1000000-0000-0000-0000-0000000000c9',
   'using dawn patrol to start the day slow and salty before the free-diving picks up. there''s something about being in the water before the rest of the town wakes up.',
   60000),
 ('f4000000-0000-0000-0000-000000000259','f1000000-0000-0000-0000-0000000000ca',
   'bought the wetsuit, committed to the bit, showed up at 6am off the pier. so far: zero regrets and one very sunburned scalp. 🤙',
   64000),

 -- ===== Ghosts (cb–cf) — 4 post one short line, ce stays silent (~25%) =====
 ('f4000000-0000-0000-0000-00000000025a','f1000000-0000-0000-0000-0000000000cb',
   'just moved from Tahoe — snow to surf. still figuring out which end of the board goes first but the pier crew has been great. 🏔️➡️🌊',
   70000),
 ('f4000000-0000-0000-0000-00000000025b','f1000000-0000-0000-0000-0000000000cc',
   'beginner foamie rider here, mostly in it for the after-coffee part tbh. lurked a while, finally said hi this week.',
   80000),
 ('f4000000-0000-0000-0000-00000000025c','f1000000-0000-0000-0000-0000000000cd',
   'lurked for a month, finally paddled out off the pier this morning. no regrets. why did i wait so long.',
   90000),
 ('f4000000-0000-0000-0000-00000000025d','f1000000-0000-0000-0000-0000000000cf',
   'grom dad checking in — if the kids are paddling out off the pier, so am i. see you out there. 👶🏄',
   100000)
 -- (ce — Talia Brandt — stays silent; engages via membership only)
) AS v(id, author_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — 12, clustered on the liveliest posts (welcome, dawn-patrol
--    call, grom-comp recap, taco accounting). Tails 1241–1280.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-00000000000a'::uuid, 'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- on the welcome post (0241)
 ('f4000000-0000-0000-0000-000000001241','f1000000-0000-0000-0000-0000000000cb','f4000000-0000-0000-0000-000000000241',
   'new here and this is the warmest welcome i''ve gotten anywhere. see you at 6. 🙏', 61000),
 ('f4000000-0000-0000-0000-000000001242','f1000000-0000-0000-0000-0000000000c8','f4000000-0000-0000-0000-000000000241',
   'best crew on the coast, no notes. drop a wave emoji in the chat and you''re basically family.', 60500),
 -- on the dawn-patrol call (0242)
 ('f4000000-0000-0000-0000-000000001243','f1000000-0000-0000-0000-0000000000c0','f4000000-0000-0000-0000-000000000242',
   'in. setting the alarm now. north side or the cove if it''s crowded?', 1400),
 ('f4000000-0000-0000-0000-000000001244','f1000000-0000-0000-0000-0000000000bc','f4000000-0000-0000-0000-000000000242',
   'north side, the lefts are firing. i''ll post the 5:45 photo. 📸', 1350),
 ('f4000000-0000-0000-0000-000000001245','f1000000-0000-0000-0000-0000000000c5','f4000000-0000-0000-0000-000000000242',
   'first time joining a weekday session — promise i''ll stay out of everyone''s way 😅', 1300),
 ('f4000000-0000-0000-0000-000000001246','f1000000-0000-0000-0000-0000000000bd','f4000000-0000-0000-0000-000000000242',
   '@lena.faro.oside come sit by me, plenty of room on the inside. you''ll be fine.', 1200),
 -- on the grom comp recap (0243)
 ('f4000000-0000-0000-0000-000000001247','f1000000-0000-0000-0000-0000000000c3','f4000000-0000-0000-0000-000000000243',
   'still emotional about it. thank you for making it so welcoming for the little ones. 🥹', 13600),
 ('f4000000-0000-0000-0000-000000001248','f1000000-0000-0000-0000-0000000000be','f4000000-0000-0000-0000-000000000243',
   'those under-8s have more courage than i do. proudest morning of the year.', 13400),
 ('f4000000-0000-0000-0000-000000001249','f1000000-0000-0000-0000-0000000000cc','f4000000-0000-0000-0000-000000000243',
   'lurker here — this is the post that finally made me want to actually paddle out. 🌊', 13000),
 ('f4000000-0000-0000-0000-00000000124a','f1000000-0000-0000-0000-0000000000bf','f4000000-0000-0000-0000-000000000243',
   'lent out three of my logs for the day and got them all back waxed and grinning. worth it.', 12800),
 -- on the taco accounting (0246)
 ('f4000000-0000-0000-0000-00000000124b','f1000000-0000-0000-0000-0000000000ca','f4000000-0000-0000-0000-000000000246',
   'i am the absurd number of burritos. no regrets. 🌯', 12400),
 ('f4000000-0000-0000-0000-00000000124c','f1000000-0000-0000-0000-0000000000c4','f4000000-0000-0000-0000-000000000246',
   'the window crew staying open for us is the real MVP. dawn patrol runs on tacos.', 12200)
) AS v(id, author_id, parent_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — Grom Surf Comp (past, -10d 07:30, Oceanside Pier north side).
--    Hosted by the circle host (bb). id tail 09.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-000000000009'::uuid,
       'f1000000-0000-0000-0000-0000000000bb'::uuid,
       'f2000000-0000-0000-0000-00000000000a'::uuid, 'circle',
       'Grom Surf Comp', 'oside-grom-comp',
       ((now() - interval '10 days')::date + time '07:30')::timestamptz,
       ((now() - interval '10 days')::date + time '11:30')::timestamptz,
       'Oceanside Pier, north side', false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-000000000009'::uuid);

COMMIT;
