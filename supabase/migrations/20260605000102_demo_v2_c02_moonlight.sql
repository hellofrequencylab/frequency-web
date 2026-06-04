-- =====================================================================
-- Demo v2 seed — CIRCLE 2: Moonlight Beach Sound Bath
-- =====================================================================
-- Channel: holistic-health · slug moonlight-sound-bath
-- Circle id f2000000-…-0002 · Encinitas, Moonlight Beach (33.0470,-117.2950)
-- Host rank ⚡ Conduit. Roster 21 (Lum0/Con1/Agt2/Op5/Run7/Ghost6).
--
-- Part of the per-circle demo v2 series (see docs/DEMO-CAST.md Part B).
-- Mirrors the SD template's structure + voice. Idempotent: deterministic
-- UUIDs + ON CONFLICT DO NOTHING everywhere. Safe to re-run.
--
-- UUID blocks (strictly inside, no cross-circle collisions):
--   profiles f1000000-…-0000000000NN  tails 17–2b
--   circle   f2000000-…-000000000002
--   posts    f4000000-…-0000000NNNNN  top-level 0041–0080, replies 1041–1080
--   events   f5000000-…-00000000000N  08 (full-moon, past) + 0c (new-moon, upcoming)
--   practice e1000000-…-000000000006  (Sound bath sit), set_by host
--
-- Schema notes (per Part B.5):
--   * member_count is maintained by the membership trigger — NOT hand-set.
--   * hub_id NULL; type 'in-person'; member_cap 50; status 'active'.
--   * season_challenges_complete = false for ALL (no Luminary in this circle).
--   * community_role: 1 host (the Conduit), 2 crew, 1 guide, rest member.
-- =====================================================================

BEGIN;

-- Resolve shared geography + channel once.
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
SELECT 'f2000000-0000-0000-0000-000000000002'::uuid,
       'Moonlight Beach Sound Bath', 'moonlight-sound-bath',
       NULL::uuid, 'in-person', 50, 'active',
       'New-moon and full-moon sound baths on the sand at Moonlight. Bring a blanket, leave the rest behind. Crystal bowls, breath, gongs, and the surf doing half the work.',
       33.0470, -117.2950, 'Moonlight Beach', 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/moonlight-sound-bath/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (21)  — tails 17–2b. Quota: Con1/Agt2/Op5/Run7/Ghost6.
--    community_role: host (the Conduit), 2 crew, 1 guide, rest member.
--    season_challenges_complete = false for all (no Luminary here).
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
 -- id, display_name, handle, role, bio, avatar?, rank, season_zaps, lifetime_zaps, gems, streak, longest_streak, achievements, minutes-since-seen
 -- ---- Conduit host (tail 17) ----
 ('f1000000-0000-0000-0000-000000000017','Lila Moonwell','lila.moonwell.sb','host',
   'Sound healer and fire-pit keeper at Moonlight. The bowls do the talking; I just hold the space.',
   true,'conduit',1880,5600,1180,24,28,19,12),
 -- ---- Agents: crew + guide (tails 18, 19) ----
 ('f1000000-0000-0000-0000-000000000018','Noah Bellamy','noah.bellamy.sb','crew',
   'I haul the blankets, tune the bowls, and time the gongs. Logistics as devotion.',
   true,'agent',1140,3100,680,16,18,14,55),
 ('f1000000-0000-0000-0000-000000000019','Indira Vale','indira.vale.sb','guide',
   'Holding space on this coast for ten years. The ocean is the real facilitator — I just point at it.',
   true,'agent',980,2700,560,13,15,13,210),
 -- ---- Operatives ×5 (tails 1a–1e); one is crew ----
 ('f1000000-0000-0000-0000-00000000001a','Maya Brennan','maya.brennan.sb','crew',
   'Came for sleep, stayed for the stillness. Now I set out the eye pillows.',
   true,'operative',620,1500,330,11,12,9,140),
 ('f1000000-0000-0000-0000-00000000001b','Eli Sorensen','eli.sorensen.sb','member',
   'Skeptic turned regular. The nervous-system reset is annoyingly real.',
   false,'operative',540,1280,280,9,11,8,600),
 ('f1000000-0000-0000-0000-00000000001c','Freya Lindqvist','freya.lindqvist.sb','member',
   'Full moons only, but I never miss one. The bowls find the knot every time.',
   true,'operative',480,1140,250,8,10,8,40),
 ('f1000000-0000-0000-0000-00000000001d','Theo Marchetti','theo.marchetti.sb','member',
   'Bring my own gong now. Slow Sundays on the sand are the whole point.',
   true,'operative',410,980,210,7,9,7,260),
 ('f1000000-0000-0000-0000-00000000001e','Priya Anand','priya.anand.sb','member',
   'Yoga teacher down the street. I send my students here when they''re wound too tight.',
   true,'operative',360,860,190,6,8,7,180),
 -- ---- Runners ×7 (tails 1f–25) ----
 ('f1000000-0000-0000-0000-00000000001f','Sam Okafor','sam.okafor.sb','member',
   'Bringing my daughter — she calls it the singing beach. Best name for it, honestly.',
   true,'runner',250,620,120,5,6,6,320),
 ('f1000000-0000-0000-0000-000000000020','Hana Delgado','hana.delgado.sb','member',
   'Migraine person. An hour of bowls does what the pills don''t. Quiet convert.',
   true,'runner',210,540,105,4,5,5,90),
 ('f1000000-0000-0000-0000-000000000021','Marcus Feld','marcus.feld.sb','member',
   'Drove down from Poway on a whim, now it''s my standing new-moon ritual.',
   false,'runner',180,470,90,4,5,5,1440),
 ('f1000000-0000-0000-0000-000000000022','Greta Solis','greta.solis.sb','member',
   'I journal right after, half-asleep on the blanket. Some of my best lines come out of it.',
   true,'runner',160,420,80,3,4,5,18),
 ('f1000000-0000-0000-0000-000000000023','Niko Pareja','niko.pareja.sb','member',
   'Surfer all day, sound bath at night. Salt then silence. Good balance.',
   true,'runner',140,380,72,3,4,4,210),
 ('f1000000-0000-0000-0000-000000000024','Ravi Mehta','ravi.mehta.sb','member',
   'New-dad tired. Ninety minutes here is the most rest I get all week.',
   false,'runner',120,330,64,2,3,4,2880),
 ('f1000000-0000-0000-0000-000000000025','Esme Caldwell','esme.caldwell.sb','member',
   'Free-diver using the breath portion to train calm. The gongs are a bonus.',
   true,'runner',110,300,58,2,3,4,12),
 -- ---- Ghosts ×6 (tails 26–2b) ----
 ('f1000000-0000-0000-0000-000000000026','Jonah Rivers','jonah.rivers.sb','member',
   'Sound is medicine. Also it''s just a beautiful way to end a Sunday.',
   false,'ghost',85,210,42,2,3,3,4320),
 ('f1000000-0000-0000-0000-000000000027','Cleo Hartman','cleo.hartman.sb','member',
   'Lurked for a month, finally laid down on the sand. No regrets.',
   true,'ghost',60,150,30,1,2,2,7200),
 ('f1000000-0000-0000-0000-000000000028','Dmitri Volkov','dmitri.volkov.sb','member',
   'First-timer who definitely fell asleep mid-bath. Apparently that''s allowed.',
   true,'ghost',48,120,24,1,2,2,180),
 ('f1000000-0000-0000-0000-000000000029','Amara Nguyen','amara.nguyen.sb','member',
   'Came for the full moon, stayed for the quiet crew on the blankets.',
   false,'ghost',35,90,18,1,1,2,5760),
 ('f1000000-0000-0000-0000-00000000002a','Felix Bauer','felix.bauer.sb','member',
   'New to Encinitas. The singing beach made me feel at home faster than anything.',
   true,'ghost',28,70,14,0,1,1,9),
 ('f1000000-0000-0000-0000-00000000002b','Saoirse Quinn','saoirse.quinn.sb','member',
   'Midwest kid. Lying under the moon with bowls ringing still feels unreal.',
   false,'ghost',20,55,10,0,1,1,8640)
) AS m(id,display_name,handle,role,bio,avatar,rank,season_zaps,lifetime_zaps,gems,streak,longest_streak,achievements,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role.
--    member_count maintained by trigger. One row per member → this circle.
--    No cross-memberships here (handled in the weave migration).
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-000000000002'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id IN (
  'f1000000-0000-0000-0000-000000000017'::uuid,'f1000000-0000-0000-0000-000000000018'::uuid,
  'f1000000-0000-0000-0000-000000000019'::uuid,'f1000000-0000-0000-0000-00000000001a'::uuid,
  'f1000000-0000-0000-0000-00000000001b'::uuid,'f1000000-0000-0000-0000-00000000001c'::uuid,
  'f1000000-0000-0000-0000-00000000001d'::uuid,'f1000000-0000-0000-0000-00000000001e'::uuid,
  'f1000000-0000-0000-0000-00000000001f'::uuid,'f1000000-0000-0000-0000-000000000020'::uuid,
  'f1000000-0000-0000-0000-000000000021'::uuid,'f1000000-0000-0000-0000-000000000022'::uuid,
  'f1000000-0000-0000-0000-000000000023'::uuid,'f1000000-0000-0000-0000-000000000024'::uuid,
  'f1000000-0000-0000-0000-000000000025'::uuid,'f1000000-0000-0000-0000-000000000026'::uuid,
  'f1000000-0000-0000-0000-000000000027'::uuid,'f1000000-0000-0000-0000-000000000028'::uuid,
  'f1000000-0000-0000-0000-000000000029'::uuid,'f1000000-0000-0000-0000-00000000002a'::uuid,
  'f1000000-0000-0000-0000-00000000002b'::uuid
)
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE_PRACTICES — active practice "Sound bath sit", set_by host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000002'::uuid,
        'e1000000-0000-0000-0000-000000000006'::uuid,
        'f1000000-0000-0000-0000-000000000017'::uuid, true)
ON CONFLICT DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank cadence (Con 3, Agt 2, Op 1–2, Run 1, ~75% Ghosts
--    one short post, ~25% silent). Voiced calm sound-healing.
--    ≥1 announces the new-moon bath (f5…0c), ≥1 recaps the full-moon (f5…08).
--    scope_id = circle, visibility 'group', created_at staggered.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid,
       'f2000000-0000-0000-0000-000000000002'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_hours || ' hours')::interval, true
FROM (VALUES
 -- ---- Host (Conduit) ×3 ----
 ('f4000000-0000-0000-0000-000000000041','f1000000-0000-0000-0000-000000000017',
   'new-moon sound bath is on for next week 🌑 fire pits at moonlight, 7:30, we''ll settle as the light goes. bring a blanket, a layer for after, and water. new moons are for setting things down — come empty out the week with us.',8),
 ('f4000000-0000-0000-0000-000000000042','f1000000-0000-0000-0000-000000000017',
   'what a full moon that was on the sand 🌕 forty of you on blankets, the tide coming up almost to the fire pits, and that long held note at the end where nobody moved for a full minute. thank you for trusting the quiet. recap photos are with noah.',60),
 ('f4000000-0000-0000-0000-000000000043','f1000000-0000-0000-0000-000000000017',
   'a gentle reminder for newer folks: you don''t have to "do" anything in a sound bath. let the surf and the bowls do the work. your only job is to lie down, let your jaw unclench, and let go. that''s it. that''s the whole practice.',180),
 -- ---- Crew agent (Noah) ×2 ----
 ('f4000000-0000-0000-0000-000000000044','f1000000-0000-0000-0000-000000000018',
   'i''ll have spare blankets and a few extra eye pillows by the fire pit for the new moon, so don''t stress if you''re coming straight from work. just find me — i''m the one tuning bowls and looking very serious about it.',30),
 ('f4000000-0000-0000-0000-000000000045','f1000000-0000-0000-0000-000000000018',
   'full-moon recap photos are up if you want one — the long exposure of the bowls by firelight came out unreal. message me and i''ll send yours. logistics note: parking lot fills fast on bath nights, carpool if you can.',58),
 -- ---- Guide agent (Indira) ×2 ----
 ('f4000000-0000-0000-0000-000000000046','f1000000-0000-0000-0000-000000000019',
   'ten years of holding space and the lesson never changes: the ocean is doing most of it. we just give it a rhythm. if you''re new and nervous, lie near the back, close your eyes, and let the people around you carry you in. you''re held here.',200),
 ('f4000000-0000-0000-0000-000000000047','f1000000-0000-0000-0000-000000000019',
   'a small practice between baths: each night this week, three slow breaths before you sleep, exhale longer than the inhale. that''s the whole sound bath in miniature. the bowls just make it easier to remember.',150),
 -- ---- Operatives (Op band): 1–2 each. crew Maya gets 2, others 1 ----
 ('f4000000-0000-0000-0000-000000000048','f1000000-0000-0000-0000-00000000001a',
   'eye pillows are washed and ready for the new moon 🤍 came to this beach for better sleep and somehow ended up the person handing them out. funny how that works. see you on the sand.',45),
 ('f4000000-0000-0000-0000-000000000049','f1000000-0000-0000-0000-00000000001a',
   'still floating from the full moon. laid down stiff as a board and got up like someone had wrung the tension out of me. grateful for this little crew and this little beach. 🌕',70),
 ('f4000000-0000-0000-0000-00000000004a','f1000000-0000-0000-0000-00000000001b',
   'came in a full-on skeptic, sat at the back with my arms crossed. somewhere around the gong i just... stopped arguing. the nervous-system reset is real and i hate that i love it.',120),
 ('f4000000-0000-0000-0000-00000000004b','f1000000-0000-0000-0000-00000000001c',
   'full moons only for me but i never miss one. the bowls found the exact spot between my shoulders that''s been clenched since march. see you all under the new moon. 🌑',95),
 ('f4000000-0000-0000-0000-00000000004c','f1000000-0000-0000-0000-00000000001d',
   'bringing my own gong to the new moon if lila''s good with it — been practicing in the garage and the neighbors have been saints about it. slow sundays on the sand are the whole point of my week.',210),
 ('f4000000-0000-0000-0000-00000000004d','f1000000-0000-0000-0000-00000000001e',
   'sent three of my yoga students to the last full moon and all three texted me the next morning like they''d slept for a year. if you''re wound too tight, this is the gentlest place i know to put it down.',175),
 -- ---- Runners ×7: 1 each ----
 ('f4000000-0000-0000-0000-00000000004e','f1000000-0000-0000-0000-00000000001f',
   'my daughter calls this the singing beach and now i can''t call it anything else. she lasted twenty minutes of the full moon before falling asleep on me, which is basically a personal best. 🌙',330),
 ('f4000000-0000-0000-0000-00000000004f','f1000000-0000-0000-0000-000000000020',
   'migraine person here — an hour of bowls does what the pills don''t. walked off the sand after the full moon clear-headed for the first time in a week. quiet convert, signing up for the new moon.',110),
 ('f4000000-0000-0000-0000-000000000050','f1000000-0000-0000-0000-000000000021',
   'drove down from poway on a whim for the full moon and it''s officially my standing ritual now. worth every minute of the 78 at dusk. anyone coming from inland want to carpool to the new moon?',1400),
 ('f4000000-0000-0000-0000-000000000051','f1000000-0000-0000-0000-000000000022',
   'i journal right after, half-asleep on the blanket while everyone packs up. some of my best lines come out of that fog. the full moon one filled three pages. bring a notebook if you''re that kind of person.',40),
 ('f4000000-0000-0000-0000-000000000052','f1000000-0000-0000-0000-000000000023',
   'surfed all morning, sound bath at night under the full moon. salt then silence. didn''t know my body needed both until i had them in the same day. good balance. 🌊',220),
 ('f4000000-0000-0000-0000-000000000053','f1000000-0000-0000-0000-000000000024',
   'new-dad tired in a way i didn''t know was possible. the ninety minutes on that blanket is the most rest i get all week, no contest. thank you for keeping it gentle for the wrecked ones.',2800),
 ('f4000000-0000-0000-0000-000000000054','f1000000-0000-0000-0000-000000000025',
   'free-diver here, using the breath portion to train calm before deep sessions. the gongs are a bonus i didn''t expect to love. long slow exhales, then the whole beach goes still. unreal.',15),
 -- ---- Ghosts: ~75% one short post (4 of 6), ~25% silent (2 of 6) ----
 ('f4000000-0000-0000-0000-000000000055','f1000000-0000-0000-0000-000000000026',
   'sound is medicine. also it''s just a beautiful way to end a sunday. that''s all i''ve got. 🙏',4320),
 ('f4000000-0000-0000-0000-000000000056','f1000000-0000-0000-0000-000000000027',
   'lurked for a month, finally laid down on the sand at the full moon. zero regrets. why did i wait.',180),
 ('f4000000-0000-0000-0000-000000000057','f1000000-0000-0000-0000-000000000028',
   'first-timer who definitely fell asleep mid-bath and woke up to the last bowl. apparently that''s allowed? coming back for the new moon to do it on purpose.',175),
 ('f4000000-0000-0000-0000-000000000058','f1000000-0000-0000-0000-00000000002a',
   'new to encinitas and the singing beach made me feel at home faster than anything else has. quiet hello from the back blanket. 🤍',9)
 -- (tails 29 and 2b stay silent — they engage via reactions/RSVPs only)
) AS v(id, author_id, body, age_hours)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — 11 replies clustered on the liveliest posts (new-moon
--    announcement, full-moon recap, the skeptic post, the singing-beach post).
--    parent_id = a top-level post above; reply UUID block 1041–1080.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000002'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_hours || ' hours')::interval, true
FROM (VALUES
 -- on the new-moon announcement (…0041)
 ('f4000000-0000-0000-0000-000000001041','f4000000-0000-0000-0000-000000000041','f1000000-0000-0000-0000-00000000001c',
   'in. counting down already. 🌑',7),
 ('f4000000-0000-0000-0000-000000001042','f4000000-0000-0000-0000-000000000041','f1000000-0000-0000-0000-000000000020',
   'bringing a friend who needs it more than she''ll admit. room for one more blanket?',6),
 ('f4000000-0000-0000-0000-000000001043','f4000000-0000-0000-0000-000000000041','f1000000-0000-0000-0000-000000000018',
   'always room. i''ll have a spare for her too. 🤍',5),
 ('f4000000-0000-0000-0000-000000001044','f4000000-0000-0000-0000-000000000041','f1000000-0000-0000-0000-000000000021',
   'carpool from poway forming — say the word and i''ll grab you on the way down.',4),
 -- on the full-moon recap (…0042)
 ('f4000000-0000-0000-0000-000000001045','f4000000-0000-0000-0000-000000000042','f1000000-0000-0000-0000-00000000001a',
   'that held note at the end undid me. didn''t want to move either.',58),
 ('f4000000-0000-0000-0000-000000001046','f4000000-0000-0000-0000-000000000042','f1000000-0000-0000-0000-000000000022',
   'the tide almost reaching the pits was so dramatic and perfect. couldn''t have planned it.',56),
 ('f4000000-0000-0000-0000-000000001047','f4000000-0000-0000-0000-000000000042','f1000000-0000-0000-0000-00000000001f',
   'my daughter still talks about the singing beach. thank you for letting the little ones lie in. 🌙',54),
 -- on the skeptic post (…004a)
 ('f4000000-0000-0000-0000-000000001048','f4000000-0000-0000-0000-00000000004a','f1000000-0000-0000-0000-000000000017',
   'the arms-crossed-to-asleep pipeline is my favorite thing to watch. welcome in. 🤍',118),
 ('f4000000-0000-0000-0000-000000001049','f4000000-0000-0000-0000-00000000004a','f1000000-0000-0000-0000-000000000026',
   'this was me exactly. the gong gets everyone eventually.',116),
 -- on the singing-beach runner post (…004e)
 ('f4000000-0000-0000-0000-00000000104a','f4000000-0000-0000-0000-00000000004e','f1000000-0000-0000-0000-000000000019',
   'kids feel it faster than adults do — no skepticism to get past. she''s onto something.',325),
 -- on the migraine post (…004f)
 ('f4000000-0000-0000-0000-00000000104b','f4000000-0000-0000-0000-00000000004f','f1000000-0000-0000-0000-00000000001e',
   'this matches what i hear from my students too. so glad it''s reaching you. see you at the new moon.',108)
) AS v(id, parent_id, author_id, body, age_hours)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENTS — full-moon (past, f5…08) recapped above; new-moon (upcoming,
--    f5…0c) announced above. Host hosts both. scope_type 'circle'.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT v.id::uuid, v.host_id::uuid,
       'f2000000-0000-0000-0000-000000000002'::uuid, 'circle',
       v.title, v.slug, v.starts_at::timestamptz, v.ends_at::timestamptz,
       v.location, false, true
FROM (VALUES
 ('f5000000-0000-0000-0000-000000000008','f1000000-0000-0000-0000-000000000017',
   'Full-Moon Sound Bath (May)','moonlight-may-full-moon',
   (now() - interval '14 days')::date + time '19:00',
   (now() - interval '14 days')::date + time '20:30',
   'Moonlight Beach fire pits, Encinitas'),
 ('f5000000-0000-0000-0000-00000000000c','f1000000-0000-0000-0000-000000000017',
   'New-Moon Sound Bath','moonlight-new-moon',
   (now() + interval '6 days')::date + time '19:30',
   (now() + interval '6 days')::date + time '21:00',
   'Moonlight Beach fire pits, Encinitas')
) AS v(id, host_id, title, slug, starts_at, ends_at, location)
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = v.id::uuid);

COMMIT;
