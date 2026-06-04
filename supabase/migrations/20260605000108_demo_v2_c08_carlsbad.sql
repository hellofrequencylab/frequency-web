-- =====================================================================
-- Demo seed v2 — CIRCLE 8: Carlsbad Village Run Club (movement)
-- =====================================================================
-- One circle + 21 auth-less demo members + memberships + circle_practice
-- + posts + replies + one past event, all is_demo = true.
--
-- Casting bible: docs/DEMO-CAST.md (Part B). Template mirrored exactly:
--   supabase/migrations/20260603000003_demo_2_sandiego.sql
--
-- Rank quota (= §3 pyramid slice): Lum 0 / Con 1 / Agt 3 / Op 5 / Run 6 / Ghost 6 = 21.
-- community_role: exactly 1 host (the Conduit), 2 crew, 1 guide, rest member.
--
-- UUID blocks (strictly inside, per B.2):
--   profiles f1…0000000000NN  tails 92–a6 (21)
--   circle   f2000000-…-000000000008
--   posts    f4…0000000NNNNN  top-level 01c1–0200, replies 11c1–1200
--   event    f5000000-…-000000000005 (Carlsbad Spring Half Relay, past, -36d)
--   active practice e1000000-0000-0000-0000-000000000002 (Daily run)
--
-- SCHEMA NOTES (per template):
--   * memberships INSERT fires the circle member_count trigger; we DO NOT
--     hand-set circles.member_count.
--   * hub_id left NULL (topic+location circle).
--   * nexus_region_id resolved by name at runtime (non-deterministic UUIDs).
--   * season_challenges_complete = true only for Luminaries (none here -> all false).
--
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING. Safe to re-run.
-- =====================================================================

BEGIN;

-- Resolve shared geography + this circle's channel once.
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
SELECT 'f2000000-0000-0000-0000-000000000008'::uuid,
       'Carlsbad Village Run Club',
       'carlsbad-village-run',
       NULL::uuid,
       'in-person', 50, 'active',
       'No-drop run club from the Village to the seawall and back. Tuesdays + Saturdays, every pace welcome, walk breaks honored, and breakfast burritos after. If you can move, you belong here.',
       33.1581, -117.3506, 'Village', 'Carlsbad',
       ctx.channel_id,
       'https://picsum.photos/seed/carlsbad-village-run/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (21) — tails 92–a6.
--    host=Conduit (92); crew x2 = Agents (93,94); guide = Agent (95);
--    everyone else member. Ranks: Con1/Agt3/Op5/Run6/Ghost6.
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
       m.zaps, m.lifetime, m.gems, m.streak, m.longest, m.achv,
       false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank, zaps, lifetime, gems, streak, longest, achv, minutes-since-seen
 -- ---- Conduit host ----
 ('f1000000-0000-0000-0000-000000000092','Dani Voss','dani.voss.run','host',
   'Pace leader and burrito-stop organizer. No one runs alone in the Village.',true,
   'conduit',1860,5600,1180,24,28,20,9),
 -- ---- Agents (crew, crew, guide) ----
 ('f1000000-0000-0000-0000-000000000093','Marisol Tran','marisol.runclub','crew',
   'Sweep runner — I''ve always got the back of the pack. Chatty and slow on purpose.',true,
   'agent',1240,3300,690,16,18,14,38),
 ('f1000000-0000-0000-0000-000000000094','Beau Castellano','beau.castellano','crew',
   'Route mapper and Saturday-long-run wrangler. I find the flat parts and the coffee.',true,
   'agent',980,2700,540,13,15,13,52),
 ('f1000000-0000-0000-0000-000000000095','Coach Reggie Pham','coach.reggie.cv','guide',
   'Thirty years of coaching cross-country. Form tips, race plans, and zero judgment.',true,
   'agent',1380,3700,720,18,20,15,210),
 -- ---- Operatives (5) ----
 ('f1000000-0000-0000-0000-000000000096','Esther Lindqvist','esther.miles','member',
   'Marathon base miles, mostly here for the company and the post-run breakfast.',true,
   'operative',640,1700,330,11,13,9,90),
 ('f1000000-0000-0000-0000-000000000097','Hollis Wray','hollis.wray','member',
   'Tuesday tempo, Saturday long, every week I can swing it. Consistency is my superpower.',true,
   'operative',520,1450,280,9,11,8,140),
 ('f1000000-0000-0000-0000-000000000098','Priyanka Bose','priyanka.bose','member',
   'Stroller-pace, please and thank you. This crew never makes me feel behind.',false,
   'operative',410,1180,220,7,9,8,1440),
 ('f1000000-0000-0000-0000-000000000099','Tomás Berg','tomas.berg.run','member',
   'Sprinter pretending to enjoy long slow distance. The burritos help.',true,
   'operative',360,980,190,6,8,7,300),
 ('f1000000-0000-0000-0000-00000000009a','Wendy Achebe','wendy.achebe','member',
   'Back to running after an injury year. Slow seawall miles are healing me.',true,
   'operative',330,860,170,6,9,7,18),
 -- ---- Runners (6) ----
 ('f1000000-0000-0000-0000-00000000009b','Soren Mikkel','soren.mikkel','member',
   'Couch-to-5K graduate now chasing the seawall sunrise. Still pinching myself.',true,
   'runner',260,720,130,5,7,6,20),
 ('f1000000-0000-0000-0000-00000000009c','Lana Okafor','lana.okafor','member',
   'New in town, used the run club to make friends. It absolutely worked.',true,
   'runner',210,620,110,4,6,5,8),
 ('f1000000-0000-0000-0000-00000000009d','Curtis Yamada','curtis.yamada','member',
   'Saturdays are sacred, Tuesdays are negotiable. Walk breaks are a feature.',false,
   'runner',180,540,95,4,6,5,520),
 ('f1000000-0000-0000-0000-00000000009e','Brigid Nolan','brigid.nolan','member',
   'Run-walk-run convert. Finished my first 10K with this crew cheering.',true,
   'runner',160,470,85,3,5,5,110),
 ('f1000000-0000-0000-0000-00000000009f','Amani Diallo','amani.diallo','member',
   'Early bird who loves a cold-morning Village loop. Coffee is non-negotiable.',true,
   'runner',130,400,70,3,5,4,12),
 ('f1000000-0000-0000-0000-0000000000a0','Pernille Strand','pernille.strand','member',
   'Treadmill refugee. Turns out running outside with people is actually fun.',false,
   'runner',110,340,60,2,4,4,1440),
 -- ---- Ghosts (6) ----
 ('f1000000-0000-0000-0000-0000000000a1','Eddie Mwangi','eddie.mwangi','member',
   'Just laced up for the first time in years. Show me the slow lane.',true,
   'ghost',85,260,55,2,3,3,9),
 ('f1000000-0000-0000-0000-0000000000a2','Yara Halloran','yara.halloran','member',
   'Walk-mostly, jog-sometimes. The burrito after is my real motivation.',true,
   'ghost',60,180,38,1,2,2,260),
 ('f1000000-0000-0000-0000-0000000000a3','Niko Petrakis','niko.petrakis','member',
   'Moved to Carlsbad last month, heard the club is no-drop. Trying it out.',true,
   'ghost',45,140,28,1,2,2,7),
 ('f1000000-0000-0000-0000-0000000000a4','Delphine Roux','delphine.roux','member',
   'Lurked the chat for weeks. Finally showing up Tuesday. Be gentle.',false,
   'ghost',32,100,18,0,1,1,4320),
 ('f1000000-0000-0000-0000-0000000000a5','Grant Sefolosha','grant.sefolosha','member',
   'Former couch champion attempting a comeback. One Village loop at a time.',true,
   'ghost',24,80,14,1,1,1,330),
 ('f1000000-0000-0000-0000-0000000000a6','Mei Lindqvist','mei.cvrun','member',
   'New to running, big on the after-coffee part. Here for the people.',true,
   'ghost',18,60,10,0,1,1,1440)
) AS m(id,display_name,handle,role,bio,avatar,rank,zaps,lifetime,gems,streak,longest,achv,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role.
--    (No cross-memberships here — handled in the weave migration.)
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-000000000008'::uuid, 'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id IN (
  'f1000000-0000-0000-0000-000000000092','f1000000-0000-0000-0000-000000000093',
  'f1000000-0000-0000-0000-000000000094','f1000000-0000-0000-0000-000000000095',
  'f1000000-0000-0000-0000-000000000096','f1000000-0000-0000-0000-000000000097',
  'f1000000-0000-0000-0000-000000000098','f1000000-0000-0000-0000-000000000099',
  'f1000000-0000-0000-0000-00000000009a','f1000000-0000-0000-0000-00000000009b',
  'f1000000-0000-0000-0000-00000000009c','f1000000-0000-0000-0000-00000000009d',
  'f1000000-0000-0000-0000-00000000009e','f1000000-0000-0000-0000-00000000009f',
  'f1000000-0000-0000-0000-0000000000a0','f1000000-0000-0000-0000-0000000000a1',
  'f1000000-0000-0000-0000-0000000000a2','f1000000-0000-0000-0000-0000000000a3',
  'f1000000-0000-0000-0000-0000000000a4','f1000000-0000-0000-0000-0000000000a5',
  'f1000000-0000-0000-0000-0000000000a6'
)
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active practice e1…0002 (Daily run), set_by host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000008'::uuid,
        'e1000000-0000-0000-0000-000000000002'::uuid,
        'f1000000-0000-0000-0000-000000000092'::uuid,
        true)
ON CONFLICT (circle_id, practice_id) DO NOTHING;

-- =====================================================================
-- 5. POSTS (top-level) — block 01c1–0200. Per-rank cadence:
--    Con 3, Agt 2 each, Op 1–2, Run 1, ~75% Ghosts one short post.
--    >=1 recaps the Spring Half Relay; >=1 about the Tuesday/Saturday runs.
--    created_at staggered over the last ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid,
       'f2000000-0000-0000-0000-000000000008'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- ---- Host: Dani Voss (Conduit) — 3 posts ----
 ('f4000000-0000-0000-0000-0000000001c1','f1000000-0000-0000-0000-000000000092',
   'Welcome to Carlsbad Village Run Club! 🏃 The deal is simple: we run Tuesdays and Saturdays, we don''t drop anybody, walk breaks are 100% legit, and we get breakfast burritos after. If you can move, you belong here. Drop a 👋 so we know to look for you.',
   62000),
 ('f4000000-0000-0000-0000-0000000001c2','f1000000-0000-0000-0000-000000000092',
   'Saturday long run! We roll from the Village train station at 7 sharp, out to the seawall and back, every pace welcome. Loop options for 3, 5, or 8 miles so nobody''s stuck doing more than they want. Burrito stop after — you''ll have earned it.',
   18000),
 ('f4000000-0000-0000-0000-0000000001c3','f1000000-0000-0000-0000-000000000092',
   'RELAY RECAP 🏅 The Carlsbad Spring Half Relay was everything I hoped for. Four legs, every team finished, and the handoffs at the train station were pure chaos in the best way. Huge shoutout to the first-timers who anchored their legs like veterans. Photos in the chat — proud of this crew.',
   51000),
 -- ---- Crew: Marisol Tran (Agent) — 2 posts ----
 ('f4000000-0000-0000-0000-0000000001c4','f1000000-0000-0000-0000-000000000093',
   'Sweeping the back of the pack again this Tuesday, so if you''re nervous about pace — please don''t be. We literally do not leave anyone behind. Find me at the start, I''m chatty and slow on purpose and I''ll talk you through the whole loop.',
   40000),
 ('f4000000-0000-0000-0000-0000000001c5','f1000000-0000-0000-0000-000000000093',
   'Relay reminder for next year''s first-timers: a half-marathon split four ways is so much more doable than it sounds. If you ran Saturday''s long loop, you''ve already basically done your leg. We''ll get you on a team. 🙌',
   49000),
 -- ---- Crew: Beau Castellano (Agent) — 2 posts ----
 ('f4000000-0000-0000-0000-0000000001c6','f1000000-0000-0000-0000-000000000094',
   'Mapped a new Saturday route along the seawall with a turnaround at the lagoon — flatter than the old one and the sunrise view is unreal. Posting the map in the chat. Carpool from the train station lot if parking''s tight.',
   30000),
 ('f4000000-0000-0000-0000-0000000001c7','f1000000-0000-0000-0000-000000000094',
   'Tuesday is our easy/social pace night — no watches required. Just show up at the Village station at 6, run and chat, and we''ll regroup for coffee after. It''s honestly the best part of my week.',
   25000),
 -- ---- Guide: Coach Reggie (Agent) — 2 posts ----
 ('f4000000-0000-0000-0000-0000000001c8','f1000000-0000-0000-0000-000000000095',
   'Coach tip for the new folks: run by effort, not by pace. If you can hold a conversation, you''re doing it right. Save the heavy breathing for the last block. Happy to look at anyone''s form on Tuesday — no charge, just enthusiasm.',
   58000),
 ('f4000000-0000-0000-0000-0000000001c9','f1000000-0000-0000-0000-000000000095',
   'Watching the relay teams pace themselves smartly was a coach''s dream. Nobody blew up on their leg. That''s what all those easy Tuesday miles buy you — fitness that shows up on race day. Well run, everyone.',
   50000),
 -- ---- Operatives (5): 1–2 posts ----
 ('f4000000-0000-0000-0000-0000000001ca','f1000000-0000-0000-0000-000000000096',
   'Got my long run in with the Saturday crew this week instead of solo and the miles flew by. Marathon training is so much less lonely with company. Also the post-run breakfast burrito is now a load-bearing part of my fueling strategy.',
   33000),
 ('f4000000-0000-0000-0000-0000000001cb','f1000000-0000-0000-0000-000000000097',
   'Tempo Tuesday, long Saturday, repeat. Six weeks straight now and I''ve never been more consistent in my life. Turns out the secret was just other people expecting me to show up.',
   28000),
 ('f4000000-0000-0000-0000-0000000001cc','f1000000-0000-0000-0000-000000000098',
   'Stroller-pace shoutout: thank you to whoever hung back with me and the little one on Saturday. This is the only run group that''s never once made me feel like the slow one. 💛',
   44000),
 ('f4000000-0000-0000-0000-0000000001cd','f1000000-0000-0000-0000-000000000099',
   'Ran my relay leg way too fast (sprinter brain, sorry team) but we still finished and nobody yelled at me. 10/10 would chaotically hand off a baton again. 🥖 burrito earned.',
   47000),
 ('f4000000-0000-0000-0000-0000000001ce','f1000000-0000-0000-0000-00000000009a',
   'First Saturday back after my injury year. Did the 3-mile loop with walk breaks and didn''t care about the time at all. Slow seawall miles with this crew are exactly the medicine I needed.',
   17000),
 -- ---- Runners (6): 1 each ----
 ('f4000000-0000-0000-0000-0000000001cf','f1000000-0000-0000-0000-00000000009b',
   'Six months ago I couldn''t run to the end of my street. Did the full seawall loop this morning without stopping. Still can''t quite believe it. Thank you, crew. 🥹',
   21000),
 ('f4000000-0000-0000-0000-0000000001d0','f1000000-0000-0000-0000-00000000009c',
   'Moved to Carlsbad three weeks ago knowing nobody. Showed up to a Tuesday run on a whim and now I have brunch plans and a standing Saturday crew. Best decision I''ve made here.',
   14000),
 ('f4000000-0000-0000-0000-0000000001d1','f1000000-0000-0000-0000-00000000009d',
   'Made it to a Saturday for once (Tuesdays are tough with my schedule) and the lagoon turnaround route is gorgeous. Walk breaks honored the whole way. Will be back.',
   36000),
 ('f4000000-0000-0000-0000-0000000001d2','f1000000-0000-0000-0000-00000000009e',
   'Finished my first 10K this weekend with half of you cheering at the seawall. I run-walk-run and nobody blinked. This crew turned running from a chore into the thing I look forward to. 🎉',
   24000),
 ('f4000000-0000-0000-0000-0000000001d3','f1000000-0000-0000-0000-00000000009f',
   'Cold-morning Village loop today before the sun was even up. Just me, the crew, and the smell of the coffee cart opening. Genuinely my favorite way to start a day.',
   11000),
 ('f4000000-0000-0000-0000-0000000001d4','f1000000-0000-0000-0000-0000000000a0',
   'Recovering treadmill person here — turns out running outside with actual humans is, shockingly, fun. Who knew. See you Tuesday.',
   39000),
 -- ---- Ghosts: ~75% of 6 = 4 short newcomer posts (a1,a2,a3,a5); a4 & a6 stay silent ----
 ('f4000000-0000-0000-0000-0000000001d5','f1000000-0000-0000-0000-0000000000a1',
   'New here — laced up for the first time in years. Heard this is the no-drop crew. Show me the slow lane and I''m in. 🙋',
   8000),
 ('f4000000-0000-0000-0000-0000000001d6','f1000000-0000-0000-0000-0000000000a2',
   'Mostly walk, sometimes jog, fully here for the burrito after. Is that allowed? (Read the rules — pretty sure that''s allowed.)',
   16000),
 ('f4000000-0000-0000-0000-0000000001d7','f1000000-0000-0000-0000-0000000000a3',
   'Just moved to Carlsbad and a neighbor told me the Village run club doesn''t drop anyone. Trying my first Tuesday this week. Wish me luck. 👋',
   6000),
 ('f4000000-0000-0000-0000-0000000001d8','f1000000-0000-0000-0000-0000000000a5',
   'Former couch champion attempting a comeback. Plan: one Village loop, zero expectations. See you out there.',
   13000)
) AS v(id, author_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — block 11c1–1200. ~11 replies clustered on the liveliest
--    posts (welcome 01c1, Saturday run 01c2, relay recap 01c3, the
--    couch-to-5K win 01cf, the new-Carlsbad-friends post 01d0).
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000008'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- on welcome (01c1)
 ('f4000000-0000-0000-0000-0000000011c1','f1000000-0000-0000-0000-0000000000a3','f4000000-0000-0000-0000-0000000001c1',
   '👋 New and nervous but the no-drop thing sold me. See you Tuesday.',5500),
 ('f4000000-0000-0000-0000-0000000011c2','f1000000-0000-0000-0000-000000000093','f4000000-0000-0000-0000-0000000001c1',
   'Welcome Niko! Find me at the start, I''m the one at the back going nice and easy. 🙌',5400),
 ('f4000000-0000-0000-0000-0000000011c3','f1000000-0000-0000-0000-0000000000a1','f4000000-0000-0000-0000-0000000001c1',
   '👋 here for the slow lane and the burritos.',5200),
 -- on Saturday long run (01c2)
 ('f4000000-0000-0000-0000-0000000011c4','f1000000-0000-0000-0000-000000000096','f4000000-0000-0000-0000-0000000001c2',
   'In for the 8. Anyone want to hold ~9:30s with me out to the seawall?',17500),
 ('f4000000-0000-0000-0000-0000000011c5','f1000000-0000-0000-0000-00000000009e','f4000000-0000-0000-0000-0000000001c2',
   'I''ll take the 3 with walk breaks — and the burrito, obviously. 🥖',17400),
 ('f4000000-0000-0000-0000-0000000011c6','f1000000-0000-0000-0000-000000000092','f4000000-0000-0000-0000-0000000001c2',
   'Perfect, that''s exactly the spread we love. Coffee cart will be open by the time we''re back.',17200),
 -- on relay recap (01c3)
 ('f4000000-0000-0000-0000-0000000011c7','f1000000-0000-0000-0000-000000000099','f4000000-0000-0000-0000-0000000001c3',
   'My handoff was a disaster and I''d do it again in a heartbeat. Best morning. 🏅',50500),
 ('f4000000-0000-0000-0000-0000000011c8','f1000000-0000-0000-0000-000000000095','f4000000-0000-0000-0000-0000000001c3',
   'Smart pacing across the board. That''s a year of easy Tuesday miles paying off. Proud of you all.',50300),
 ('f4000000-0000-0000-0000-0000000011c9','f1000000-0000-0000-0000-00000000009a','f4000000-0000-0000-0000-0000000001c3',
   'Cheered from the seawall since I was still on the injury bench — y''all looked incredible out there.',50100),
 -- on couch-to-5K win (01cf)
 ('f4000000-0000-0000-0000-0000000011ca','f1000000-0000-0000-0000-000000000092','f4000000-0000-0000-0000-0000000001cf',
   'This is the whole reason we do this. So proud of you. 🥹',20800),
 ('f4000000-0000-0000-0000-0000000011cb','f1000000-0000-0000-0000-00000000009c','f4000000-0000-0000-0000-0000000001cf',
   'Witnessing this gave me chills. Full loop no stopping is HUGE. 👏',20600),
 -- on new-Carlsbad-friends post (01d0)
 ('f4000000-0000-0000-0000-0000000011cc','f1000000-0000-0000-0000-0000000000a3','f4000000-0000-0000-0000-0000000001d0',
   'This is giving me the courage to actually show up Tuesday. Save me a spot at the back.',13500)
) AS v(id, author_id, parent_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — Carlsbad Spring Half Relay (past, -36d 07:00), hosted by Dani.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-000000000005'::uuid,
       'f1000000-0000-0000-0000-000000000092'::uuid,
       'f2000000-0000-0000-0000-000000000008'::uuid,
       'circle',
       'Carlsbad Spring Half Relay',
       'carlsbad-spring-half-relay',
       ((now() - interval '36 days')::date + time '07:00')::timestamptz,
       ((now() - interval '36 days')::date + time '11:00')::timestamptz,
       'Carlsbad Village train station',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-000000000005'::uuid);

COMMIT;
