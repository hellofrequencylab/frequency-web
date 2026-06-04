-- =====================================================================
-- Demo seed v2 — CIRCLE 1: Swami's Dawn Patrol (movement)
-- =====================================================================
-- One circle from the v2 Encinitas cast. 22 auth-less demo members +
-- memberships + an active circle practice + posts + replies + 2 events,
-- all flagged is_demo = true. Mirrors the structure/SQL patterns of
-- 20260603000003_demo_2_sandiego.sql and follows DEMO-CAST.md Part B.
--
-- SCHEMA NOTES (per DEMO-CAST.md B.5, copied column lists verbatim):
--   * circles: hub_id NULL, type 'in-person', member_cap 50, status 'active'.
--     member_count is DELIBERATELY NOT set — trg_increment_circle_member_count
--     maintains it on each membership insert (hand-setting would double-count).
--   * member nexus_region_id reuses a real nexus_region resolved by name at
--     runtime (North County -> San Diego -> any depth-0 region).
--   * topical_channel resolved by slug ('movement').
--   * profiles.community_role enum (member|crew|host|guide|mentor) mirrored to
--     memberships.volunteer_role via NULLIF(...,'member').
--   * season_challenges_complete = true ONLY for the Luminary host.
--
-- UUID blocks (no collisions with other circles' files):
--   profiles  f1000000-…-0000000000{01..16}
--   circle    f2000000-…-000000000001
--   posts     f4000000-…-00000000{0001..0040}
--   replies   f4000000-…-00000000{1001..1040}
--   events    f5000000-…-0000000000{01,0b}
--   practice  e1000000-…-000000000001 (active)
--
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING everywhere.
-- =====================================================================

BEGIN;

-- Resolve shared geography + channel once.
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='movement') AS channel_id;

-- =====================================================================
-- 1. CIRCLE — member_count left to the trigger; hub_id NULL.
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000001'::uuid,
       'Swami''s Dawn Patrol', 'swamis-dawn-patrol',
       NULL::uuid, 'in-person', 50, 'active',
       'Sunrise surf crew at Swami''s. Paddle out before work, trade waves, regroup over coffee on the bluff. All levels, all boards, good vibes only.',
       33.0369, -117.2920, 'Swami''s Beach', 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/swamis-dawn-patrol/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (22) — quota Lum1 / Con1 / Agt3 / Op5 / Run7 / Ghost5.
--    Stats inside each rank's §3 band; season_zaps <= lifetime_zaps;
--    longest_streak >= current_streak. avatar for ~75%, else NULL.
--    season_challenges_complete = true ONLY for the Luminary.
--    community_role: 1 host (the Luminary) / 2 crew / 1 guide / rest member.
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
       p.szaps, p.lzaps, p.gems, p.cstreak, p.lstreak, p.achv,
       p.scc,
       now() - (p.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank,
 --   szaps, lzaps, gems, cstreak, lstreak, achv, scc, minutes-since-seen
 -- ---- Luminary (1) — host ----
 ('f1000000-0000-0000-0000-000000000001','Marcus Reyes','marcus.r.swamis','host',
   'Up before the sun, in the water by six. Swami''s is my church.',true,'luminary',
   2840,9600,2100,47,51,26,true,14),
 -- ---- Conduit (1) — guide ----
 ('f1000000-0000-0000-0000-000000000002','Owen Maddox','owen.m.swamis','guide',
   'Twenty years on this reef. Happy to share a peak and a pointer.',true,'conduit',
   1620,5400,980,22,29,19,false,210),
 -- ---- Agents (3) — 2 crew + 1 member ----
 ('f1000000-0000-0000-0000-000000000003','Sofia Brandt','sofia.b.swamis','crew',
   'Logging dawn sessions and stoke. Wax in, worries out.',true,'agent',
   1180,3200,640,17,21,14,false,42),
 ('f1000000-0000-0000-0000-000000000004','Priya Nair','priya.n.swamis','crew',
   'Longboard cruiser, sunrise chaser, dawn-patrol text-thread admin.',true,'agent',
   890,2400,470,12,16,12,false,75),
 ('f1000000-0000-0000-0000-000000000005','Dao Tran','dao.t.swamis','member',
   'Shaper by trade. I''ll fix your ding and tell you to surf more.',true,'agent',
   1010,2900,560,15,18,13,false,330),
 -- ---- Operatives (5) ----
 ('f1000000-0000-0000-0000-000000000006','Diego Salas','diego.s.swamis','member',
   'Weekends only but never missing a glassy morning.',true,'operative',
   540,1500,260,9,12,9,false,1440),
 ('f1000000-0000-0000-0000-000000000007','Hana Okafor','hana.o.swamis','member',
   'Bodysurfing convert. Fins, foam, and good company.',true,'operative',
   420,1100,190,7,10,8,false,95),
 ('f1000000-0000-0000-0000-000000000008','Caleb Wren','caleb.w.swamis','member',
   'Grom dad. If the kids paddle out, so do I.',false,'operative',
   360,950,170,6,9,7,false,260),
 ('f1000000-0000-0000-0000-000000000009','Bruno Costa','bruno.c.swamis','member',
   'North-side logger, every morning I can.',true,'operative',
   480,1300,220,8,11,8,false,55),
 ('f1000000-0000-0000-0000-00000000000a','Ines Vargas','ines.v.swamis','member',
   'Nurse on night shifts — dawn patrol is how I come down.',true,'operative',
   310,840,160,5,8,7,false,520),
 -- ---- Runners (7) ----
 ('f1000000-0000-0000-0000-00000000000b','Lucia Marín','lucia.m.swamis','member',
   'Traded the trading desk for tide charts. Best decision yet.',false,'runner',
   240,600,110,5,7,6,false,2880),
 ('f1000000-0000-0000-0000-00000000000c','Theo Alvarez','theo.a.swamis','member',
   'Learning the etiquette one wave at a time.',true,'runner',
   190,500,90,4,6,5,false,180),
 ('f1000000-0000-0000-0000-00000000000d','Naomi Frost','naomi.f.swamis','member',
   'Cold water, warm crew. Here for both.',true,'runner',
   160,440,75,3,5,5,false,300),
 ('f1000000-0000-0000-0000-00000000000e','Sam Devlin','sam.d.swamis','member',
   'Surf-report screenshotter and group-chat hype man.',true,'runner',
   130,380,60,3,5,4,false,9),
 ('f1000000-0000-0000-0000-00000000000f','Imani Cole','imani.c.swamis','member',
   'New to the lineup, slowly earning my spot on the peak.',false,'runner',
   110,320,55,2,4,4,false,1320),
 ('f1000000-0000-0000-0000-000000000010','Esme Lindqvist','esme.l.swamis','member',
   'Free-diver using dawn patrol to start slow.',true,'runner',
   150,420,70,3,5,5,false,140),
 ('f1000000-0000-0000-0000-000000000011','Pono Kahale','pono.k.swamis','member',
   'Island transplant. Smaller waves, same aloha.',true,'runner',
   200,520,95,4,6,6,false,40),
 -- ---- Ghosts (5) ----
 ('f1000000-0000-0000-0000-000000000012','Felix Brunner','felix.b.swamis','member',
   'Just moved from Tahoe. Snow to surf, figuring it out.',true,'ghost',
   85,220,40,2,3,3,false,4320),
 ('f1000000-0000-0000-0000-000000000013','Greta Holm','greta.h.swamis','member',
   'Beginner foamie rider, big on the after-coffee part.',true,'ghost',
   70,160,30,1,2,2,false,8640),
 ('f1000000-0000-0000-0000-000000000014','Malik Reed','malik.r.swamis','member',
   'Shortboard, high tide, low expectations, big smiles.',false,'ghost',
   55,120,22,1,2,2,false,1440),
 ('f1000000-0000-0000-0000-000000000015','Tess Okada','tess.o.swamis','member',
   'Grom mom turned surfer. The pier crew adopted us.',true,'ghost',
   40,90,18,1,1,2,false,2880),
 ('f1000000-0000-0000-0000-000000000016','Ravi Banerjee','ravi.b.swamis','member',
   'Lurked for a month, finally paddled out. No regrets.',false,'ghost',
   30,60,12,0,1,1,false,7200)
) AS p(id,display_name,handle,role,bio,avatar,rank,
       szaps,lzaps,gems,cstreak,lstreak,achv,scc,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — each member -> this circle; status active;
--    volunteer_role = NULLIF(community_role,'member'). Trigger keeps member_count.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-000000000001'::uuid, 'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id IN (
  'f1000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000002',
  'f1000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000004',
  'f1000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000006',
  'f1000000-0000-0000-0000-000000000007','f1000000-0000-0000-0000-000000000008',
  'f1000000-0000-0000-0000-000000000009','f1000000-0000-0000-0000-00000000000a',
  'f1000000-0000-0000-0000-00000000000b','f1000000-0000-0000-0000-00000000000c',
  'f1000000-0000-0000-0000-00000000000d','f1000000-0000-0000-0000-00000000000e',
  'f1000000-0000-0000-0000-00000000000f','f1000000-0000-0000-0000-000000000010',
  'f1000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000012',
  'f1000000-0000-0000-0000-000000000013','f1000000-0000-0000-0000-000000000014',
  'f1000000-0000-0000-0000-000000000015','f1000000-0000-0000-0000-000000000016'
)
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active "Dawn patrol surf", set by the host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000001'::uuid,
        'e1000000-0000-0000-0000-000000000001'::uuid,
        'f1000000-0000-0000-0000-000000000001'::uuid,
        true)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank counts: Lum 4 · Con 3 · Agt 2 · Op 1–2 · Run 1 ·
--    Ghost ~75% one short newcomer post (4 of 5) + ~25% silent (1 of 5).
--    >=1 post announces the upcoming Saturday Dawn Session, >=1 recaps the
--    New Year's Day Paddle-Out. created_at scattered over the last ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000001'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- ---- Luminary: Marcus Reyes (host) — 4 posts ----
 ('f4000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001',
   'welcome to the Dawn Patrol 🌊 the deal is simple: paddle out before work, trade a few waves, regroup for coffee on the bluff. all levels, all boards. if you''re new, find me on the sand first and i''ll point you to a friendly peak.',
   64800),
 ('f4000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000001',
   '📣 SATURDAY DAWN SESSION is on — meet at the Swami''s Beach stairs, 6am sharp. forecast is chest-high and clean with a light offshore. coffee on the bluff after like always. bring a newbie, the more the merrier.',
   2880),
 ('f4000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000001',
   'still buzzing about the New Year''s Day paddle-out. sixty-odd of us in a circle past the lineup, flowers on the water, that long silence then the whoops. best way i know to start a year. thank you all for showing up in the dark. 🌅',
   223200),
 ('f4000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000001',
   'reminder that the bluff coffee is half the point. you don''t have to surf well, you don''t even have to surf — show up, say hi, watch the sun come over the reef. that''s the whole thing.',
   14400),
 -- ---- Conduit: Owen Maddox (guide) — 3 posts ----
 ('f4000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000002',
   'twenty-plus years on this reef so a little etiquette for the newer folks: watch where the regulars sit, don''t paddle straight to the peak, don''t drop in, and smile. respect the lineup and it gives back. happy to share a wave anytime.',
   43200),
 ('f4000000-0000-0000-0000-000000000006','f1000000-0000-0000-0000-000000000002',
   'tide''s gonna drop through saturday morning so the inside section off the point should stand up nicely around 7. longboards will be having the most fun. see you at the stairs.',
   1800),
 ('f4000000-0000-0000-0000-000000000007','f1000000-0000-0000-0000-000000000002',
   'for anyone learning to read swami''s: the keyhole is the safest paddle-out at low tide, but mind the urchins on the inside reef. ask me on the sand and i''ll walk you through it.',
   25200),
 -- ---- Agents (3) — 2 posts each ----
 ('f4000000-0000-0000-0000-000000000008','f1000000-0000-0000-0000-000000000003',
   'surf report for the crew: tide''s dropping through the morning, light offshore, should stay clean til about 9. i''ll be the one in the teal wetsuit waving like a lunatic. 🤙',
   3600),
 ('f4000000-0000-0000-0000-000000000009','f1000000-0000-0000-0000-000000000003',
   'wax in, worries out. logged my 17th week straight this morning and the reef gave me the cleanest right of the season for it. dawn patrol is undefeated.',
   18000),
 ('f4000000-0000-0000-0000-00000000000a','f1000000-0000-0000-0000-000000000004',
   'added six new names to the dawn-patrol text thread this week 🎉 if you came out and didn''t get the morning blast, reply here and i''ll add you. that''s how you know if it''s on before you drive down.',
   7200),
 ('f4000000-0000-0000-0000-00000000000b','f1000000-0000-0000-0000-000000000004',
   'longboard cruiser PSA: glassy little waist-high mornings are the BEST learning conditions and we''ve had a run of them. don''t wait for the swell, just come.',
   32400),
 ('f4000000-0000-0000-0000-00000000000c','f1000000-0000-0000-0000-000000000005',
   'shaper here — if your board took a hit on the reef bring it by, i''ll patch the ding cheap and tell you to surf more. winter''s rocks are no joke at low tide.',
   50400),
 ('f4000000-0000-0000-0000-00000000000d','f1000000-0000-0000-0000-000000000005',
   'glassed a fresh 7''2 funboard this week and it''s looking for a home in the lineup. perfect step-down for anyone graduating off the foamie. find me saturday.',
   10800),
 -- ---- Operatives (5) — 1-2 posts each ----
 ('f4000000-0000-0000-0000-00000000000e','f1000000-0000-0000-0000-000000000006',
   'weekends only over here but i drove down at 5:45 for that glass this morning and it was so worth it. nothing beats a saturday that starts in the water.',
   21600),
 ('f4000000-0000-0000-0000-00000000000f','f1000000-0000-0000-0000-000000000006',
   'counting down to the saturday session already. set the alarm, laid out the wetsuit, made peace with the cold paddle. see everyone at the stairs.',
   1200),
 ('f4000000-0000-0000-0000-000000000010','f1000000-0000-0000-0000-000000000007',
   'bodysurfing convert checking in — caught the best closeout of my life on the inside this week. fins, foam, and good company, that''s the whole recipe.',
   28800),
 ('f4000000-0000-0000-0000-000000000011','f1000000-0000-0000-0000-000000000008',
   'grom dad report: both kids paddled out before me this morning and i''ve never been prouder or slower. if your littles want to come saturday, mine will show them the ropes.',
   16200),
 ('f4000000-0000-0000-0000-000000000012','f1000000-0000-0000-0000-000000000009',
   'north-side logger here, every morning i can. the peak past the keyhole has been so friendly lately — plenty of room, mellow crowd. come share it.',
   39600),
 ('f4000000-0000-0000-0000-000000000013','f1000000-0000-0000-0000-00000000000a',
   'off a run of night shifts and the dawn paddle is the only thing that un-knots me after. quiet water, pink sky, then i can finally sleep. thanks for keeping it gentle, crew.',
   46800),
 -- ---- Runners (7) — 1 post each ----
 ('f4000000-0000-0000-0000-000000000014','f1000000-0000-0000-0000-00000000000b',
   'one year ago i was at a trading desk by 6am. today i was under the pier watching the sun come up between sets. still can''t believe i get to call this the new routine.',
   54000),
 ('f4000000-0000-0000-0000-000000000015','f1000000-0000-0000-0000-00000000000c',
   'learning the etiquette one wave at a time — apologies to whoever i accidentally dropped in on tuesday 😅 thanks for the patient pointer instead of the stink eye. won''t happen again.',
   12600),
 ('f4000000-0000-0000-0000-000000000016','f1000000-0000-0000-0000-00000000000d',
   'cold water, warm crew. i was so nervous to paddle out the first time and now mornings without it feel wrong. here for the waves AND the coffee, in that order. ❄️☕',
   30600),
 ('f4000000-0000-0000-0000-000000000017','f1000000-0000-0000-0000-00000000000e',
   'your friendly neighborhood surf-report screenshotter reporting: saturday is looking CLEAN. consider this your hype-man notice to set the alarm. 🌊📲',
   3000),
 ('f4000000-0000-0000-0000-000000000018','f1000000-0000-0000-0000-00000000000f',
   'slowly earning my spot on the peak. caught two without anyone having to wave me off today, which for me is basically a contest win. small steps.',
   23400),
 ('f4000000-0000-0000-0000-000000000019','f1000000-0000-0000-0000-000000000010',
   'free-diver using dawn patrol to start the day slow before deeper stuff. the breath-up on the bluff watching the sets roll in might be my favorite ten minutes of any day.',
   36000),
 ('f4000000-0000-0000-0000-00000000001a','f1000000-0000-0000-0000-000000000011',
   'island transplant settling in — smaller waves than home but the same aloha in this lineup, which is all i was really missing. mahalo for the warm welcome, crew. 🤙',
   9000),
 -- ---- Ghosts — 4 of 5 write one short newcomer post; #16 stays silent ----
 ('f4000000-0000-0000-0000-00000000001b','f1000000-0000-0000-0000-000000000012',
   'just moved down from tahoe — snow to surf, total beginner, very cold and very stoked. hi everyone. 👋',
   60000),
 ('f4000000-0000-0000-0000-00000000001c','f1000000-0000-0000-0000-000000000013',
   'foamie rider here, mostly in it for the after-coffee part if i''m honest. excited to actually meet people instead of lurking the thread.',
   48000),
 ('f4000000-0000-0000-0000-00000000001d','f1000000-0000-0000-0000-000000000014',
   'shortboard, high tide, low expectations, big smiles. first time posting — see you out there sometime soon.',
   33000),
 ('f4000000-0000-0000-0000-00000000001e','f1000000-0000-0000-0000-000000000015',
   'grom mom turned surfer, the pier crew kind of adopted us. hoping to bring the little one to a saturday soon if that''s cool. 🌅',
   26400)
) AS v(id, author_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — 12 replies clustered on the liveliest posts (Saturday
--    announcement, NYE paddle-out recap, etiquette, surf report).
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000001'::uuid, 'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- on the Saturday Dawn Session announcement (…0002)
 ('f4000000-0000-0000-0000-000000001001','f1000000-0000-0000-0000-000000000003','f4000000-0000-0000-0000-000000000002',
   'in. teal wetsuit will be there. 🤙', 2820),
 ('f4000000-0000-0000-0000-000000001002','f1000000-0000-0000-0000-000000000006','f4000000-0000-0000-0000-000000000002',
   'driving down from the weekend cabin for this one. save me a wave.', 2760),
 ('f4000000-0000-0000-0000-000000001003','f1000000-0000-0000-0000-000000000012','f4000000-0000-0000-0000-000000000002',
   'first saturday for me — is 6am the real start or do people trickle in?', 2700),
 ('f4000000-0000-0000-0000-000000001004','f1000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000002',
   'come at 6, we paddle together at 6:15. you''ll be in good hands @felix.', 2640),
 ('f4000000-0000-0000-0000-000000001005','f1000000-0000-0000-0000-00000000000e','f4000000-0000-0000-0000-000000000002',
   'told you the report looked clean 😎 see everyone at the stairs.', 2580),
 -- on the NYE paddle-out recap (…0003)
 ('f4000000-0000-0000-0000-000000001006','f1000000-0000-0000-0000-000000000004','f4000000-0000-0000-0000-000000000003',
   'still get chills thinking about that silence on the water. nothing like it.', 222000),
 ('f4000000-0000-0000-0000-000000001007','f1000000-0000-0000-0000-000000000007','f4000000-0000-0000-0000-000000000003',
   'my first paddle-out ever and i cried behind my sunglasses. no regrets. 🌊', 221400),
 ('f4000000-0000-0000-0000-000000001008','f1000000-0000-0000-0000-000000000002','f4000000-0000-0000-0000-000000000003',
   'twenty years of these and that one was special. the flowers in the lineup got me.', 220800),
 -- on Owen's etiquette post (…0005)
 ('f4000000-0000-0000-0000-000000001009','f1000000-0000-0000-0000-00000000000c','f4000000-0000-0000-0000-000000000005',
   'saving this. exactly the stuff nobody tells you until you''ve already blown it once.', 42600),
 ('f4000000-0000-0000-0000-00000000100a','f1000000-0000-0000-0000-000000000013','f4000000-0000-0000-0000-000000000005',
   'as a foamie person this is so reassuring, thank you owen. 🙏', 42000),
 -- on Sofia's surf report (…0008)
 ('f4000000-0000-0000-0000-00000000100b','f1000000-0000-0000-0000-000000000009','f4000000-0000-0000-0000-000000000008',
   'confirmed clean on the north side too. light offshore, peeling. go go go.', 3480),
 ('f4000000-0000-0000-0000-00000000100c','f1000000-0000-0000-0000-000000000010','f4000000-0000-0000-0000-000000000008',
   'on my way down now. breath-up on the bluff first as always. ☀️', 3360)
) AS v(id, author_id, parent_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENTS (2) — host = the Luminary; scope_type 'circle'.
--    f5…01 New Year's Day Paddle-Out (past, -155d 07:00),
--    f5…0b Saturday Dawn Session (upcoming, +3d 06:00).
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug, starts_at, ends_at, location, is_cancelled, is_demo)
SELECT v.id::uuid, 'f1000000-0000-0000-0000-000000000001'::uuid,
       'f2000000-0000-0000-0000-000000000001'::uuid, 'circle',
       v.title, v.slug, v.starts_at::timestamptz, v.ends_at::timestamptz, v.location, false, true
FROM (VALUES
 ('f5000000-0000-0000-0000-000000000001',
   'New Year''s Day Paddle-Out','swamis-nye-paddle-out',
   (now() - interval '155 days')::date + time '07:00', (now() - interval '155 days')::date + time '09:30',
   'Swami''s Beach stairs, Encinitas'),
 ('f5000000-0000-0000-0000-00000000000b',
   'Saturday Dawn Session','swamis-saturday-dawn',
   (now() + interval '3 days')::date + time '06:00', (now() + interval '3 days')::date + time '08:30',
   'Swami''s Beach stairs, Encinitas')
) AS v(id, title, slug, starts_at, ends_at, location)
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = v.id::uuid);

COMMIT;
