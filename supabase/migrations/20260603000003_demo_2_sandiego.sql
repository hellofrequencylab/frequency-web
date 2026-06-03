-- =====================================================================
-- Demo seed (Beta) — VERTICAL 2: North County San Diego
-- =====================================================================
-- 12 circles + ~72 auth-less demo members + memberships + posts + events,
-- all flagged is_demo = true (column from 20260603000001_demo_0_infrastructure).
--
-- This is the "home cluster": circles are fuller (8–16 members each).
--
-- SCHEMA NOTES / ASSUMPTIONS (verified against migrations + database.types.ts):
--   * memberships INSERT fires trg_memberships_insert ->
--     trg_increment_circle_member_count(), which does
--     `UPDATE circles SET member_count = member_count + 1`. Therefore this
--     seed DELIBERATELY DOES NOT hand-set circles.member_count — the trigger
--     keeps it correct. (Hand-setting it too would double-count.)
--   * circles.hub_id is NOT NULL (hierarchy_v2). The task asked to "leave
--     hub_id NULL", but the constraint forbids NULL, so every circle is
--     attached to the existing real San-Diego-area hubs created in
--     supabase/seed_hierarchy.sql: Coastal Hub (44…001) for coastal circles
--     and Encinitas Hub (44…003) for Encinitas circles. These hubs are
--     structural/shared geography and are NOT demo-flagged. If those hub rows
--     are absent (seed_hierarchy.sql never run), the circle inserts are guarded
--     so the whole migration still applies cleanly (see hub COALESCE below).
--   * member nexus_region_id reuses a real San-Diego-area nexus_region created
--     by 20240107000000_seed_nexus_regions.sql ('North County', falling back to
--     'San Diego', then any depth-0 region) — looked up by name at runtime
--     since those rows have non-deterministic UUIDs.
--   * posts has no hidden_at column in this schema; omitted. Replies use
--     parent_id (unused here — all top-level). post_type default 'feed',
--     visibility 'group'.
--   * events columns: host_id, title, slug, starts_at, ends_at, location,
--     scope_id, scope_type ('circle'), is_cancelled.
--   * community_role enum: member|crew|host|guide|mentor. Role stored on the
--     profile (profiles.community_role) AND mirrored to memberships.volunteer_role.
--
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING everywhere; posts
-- and events use fixed UUIDs. Safe to re-run.
--
-- UUID prefixes (avoid collisions with other seed files):
--   members c1…, circles c2…, posts c4…, events c5…
-- =====================================================================

BEGIN;

-- Resolve shared geography once (kept in a temp table for readability).
CREATE TEMP TABLE _sd_ctx ON COMMIT DROP AS
SELECT
  -- Real SD-area hubs (NOT NULL hub_id). Fall back to ANY hub if the named
  -- ones are missing so the migration still applies.
  COALESCE(
    (SELECT id FROM hubs WHERE slug = 'coastal-hub'),
    (SELECT id FROM hubs ORDER BY created_at NULLS LAST, id LIMIT 1)
  ) AS coastal_hub_id,
  COALESCE(
    (SELECT id FROM hubs WHERE slug = 'encinitas-hub'),
    (SELECT id FROM hubs WHERE slug = 'coastal-hub'),
    (SELECT id FROM hubs ORDER BY created_at NULLS LAST, id LIMIT 1)
  ) AS encinitas_hub_id,
  -- Real SD-area nexus_region for members.
  COALESCE(
    (SELECT id FROM nexus_regions WHERE name = 'North County' ORDER BY depth LIMIT 1),
    (SELECT id FROM nexus_regions WHERE name = 'San Diego'    ORDER BY depth LIMIT 1),
    (SELECT id FROM nexus_regions WHERE depth = 0 ORDER BY name LIMIT 1)
  ) AS sd_region_id,
  -- Topical channels by slug.
  (SELECT id FROM topical_channels WHERE slug = 'movement')         AS tc_movement,
  (SELECT id FROM topical_channels WHERE slug = 'holistic-health')  AS tc_holistic,
  (SELECT id FROM topical_channels WHERE slug = 'creative')         AS tc_creative,
  (SELECT id FROM topical_channels WHERE slug = 'business-support') AS tc_business,
  (SELECT id FROM topical_channels WHERE slug = 'spirituality')     AS tc_spirit;

-- =====================================================================
-- 1. CIRCLES (12)  — member_count left to the trigger; hub_id from _sd_ctx.
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT v.id, v.name, v.slug,
       CASE WHEN v.hub = 'enc' THEN ctx.encinitas_hub_id ELSE ctx.coastal_hub_id END,
       'in-person', 50, 'active', v.about, v.lat, v.lng, v.neighborhood, v.city,
       CASE v.interest
         WHEN 'movement'        THEN ctx.tc_movement
         WHEN 'holistic-health' THEN ctx.tc_holistic
         WHEN 'creative'        THEN ctx.tc_creative
         WHEN 'business-support' THEN ctx.tc_business
         WHEN 'spirituality'    THEN ctx.tc_spirit
       END,
       'https://picsum.photos/seed/' || v.slug || '/400/400',
       true
FROM _sd_ctx ctx,
(VALUES
 ('c2000000-0000-0000-0000-000000000001','Swami''s Dawn Patrol','swamis-dawn-patrol','enc','movement',
   'Sunrise surf crew at Swami''s. Paddle out before work, trade waves, regroup over coffee on the bluff. All levels, good vibes only.',
   33.0369,-117.2920,'Swami''s Beach','Encinitas'),
 ('c2000000-0000-0000-0000-000000000002','Moonlight Beach Sound Bath','moonlight-sound-bath','enc','holistic-health',
   'New-moon and full-moon sound baths on the sand at Moonlight. Bring a blanket, leave the rest behind. Crystal bowls, breath, and the surf.',
   33.0470,-117.2950,'Moonlight Beach','Encinitas'),
 ('c2000000-0000-0000-0000-000000000003','Leucadia Makers','leucadia-makers','enc','creative',
   'Woodworkers, ceramicists, and screen-printers swapping skills in the 101 corridor. Monthly maker nights, open studios, show-and-tell.',
   33.0608,-117.3000,'Leucadia','Encinitas'),
 ('c2000000-0000-0000-0000-000000000004','Carlsbad Village Run Club','carlsbad-village-run','coastal','movement',
   'No-drop run club from the Village to the seawall and back. Tuesdays + Saturdays, every pace welcome, breakfast burritos after.',
   33.1581,-117.3506,'Carlsbad Village','Carlsbad'),
 ('c2000000-0000-0000-0000-000000000005','Carlsbad Breathwork Collective','carlsbad-breathwork','coastal','holistic-health',
   'Weekly conscious-breathing sessions — down-regulate, reset the nervous system, share a cup of tea after. Beginners always welcome.',
   33.1200,-117.3100,'Carlsbad','Carlsbad'),
 ('c2000000-0000-0000-0000-000000000006','Carlsbad Founders Table','carlsbad-founders-table','coastal','business-support',
   'Founders and operators building in North County. Honest accountability, warm intros, no pitch decks. We meet over coffee in the Village.',
   33.1600,-117.3500,'Carlsbad Village','Carlsbad'),
 ('c2000000-0000-0000-0000-000000000007','Cardiff Cold Plunge','cardiff-cold-plunge','coastal','holistic-health',
   'Cold-water dips at Cardiff reef at first light. Breathe, plunge, recover together. Tubs and the ocean — your choice.',
   33.0150,-117.2800,'Cardiff','Cardiff-by-the-Sea'),
 ('c2000000-0000-0000-0000-000000000008','Cedros Creatives','cedros-creatives','coastal','creative',
   'Designers, photographers, and shop owners in the Cedros Design District. Coffee walks, portfolio nights, and collabs across the lane.',
   32.9912,-117.2713,'Cedros Design District','Solana Beach'),
 ('c2000000-0000-0000-0000-000000000009','Oside Sunrise Surf','oside-sunrise-surf','coastal','movement',
   'Dawn sessions off Oceanside Pier. Longboards, shortboards, groms and graybeards. We surf, then we get tacos.',
   33.1933,-117.3831,'Oceanside Pier','Oceanside'),
 ('c2000000-0000-0000-0000-000000000010','Oceanside Vinyasa','oceanside-vinyasa','coastal','movement',
   'Flow on the bluff overlooking the water. Donation-based vinyasa, all bodies, all mornings start better here.',
   33.1959,-117.3795,'Oceanside','Oceanside'),
 ('c2000000-0000-0000-0000-000000000011','Vista Hops & Hikes','vista-hops-hikes','coastal','movement',
   'Trail hikes around Vista that end at a local taproom. Move your legs, meet your neighbors, earn the pint.',
   33.2000,-117.2425,'Vista','Vista'),
 ('c2000000-0000-0000-0000-000000000012','CSUSM Mindfulness','csusm-mindfulness','coastal','spirituality',
   'Student-led meditation and mindfulness circle near CSUSM. Sits, journaling prompts, and quiet company between classes.',
   33.1300,-117.1580,'San Marcos','San Marcos')
) AS v(id,name,slug,hub,interest,about,lat,lng,neighborhood,city)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. MEMBERS (~72) — auth-less demo profiles.
--    role: one host per circle (leader). A scatter of crew/guide/mentor.
--    leaders/guides/mentors get higher zaps/gems/streak so the leaderboard
--    ranks believably; members get modest values. last_seen_at staggered.
-- =====================================================================
INSERT INTO profiles (id, auth_user_id, display_name, handle, community_role,
                      nexus_region_id, bio, avatar_url, current_season_zaps,
                      lifetime_gems, current_streak, last_seen_at, is_active, is_demo)
SELECT m.id, NULL, m.display_name, m.handle, m.role::community_role,
       ctx.sd_region_id, m.bio,
       CASE WHEN m.avatar THEN 'https://i.pravatar.cc/240?u=' || m.handle ELSE NULL END,
       m.zaps, m.gems, m.streak,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _sd_ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, zaps, gems, streak, minutes-since-seen
 -- ---- Circle 1: Swami's Dawn Patrol (movement / surf) ----
 ('c1000000-0000-0000-0000-000000000001','Marcus Demo','marcus.demo','host','Up before the sun, in the water by six. Swami''s is my church.',true,940,520,21,5),
 ('c1000000-0000-0000-0000-000000000002','Sofia Demonski','sofia.demonski','crew','Logging dawn sessions and stoke. Wax in, worries out.',true,410,180,9,40),
 ('c1000000-0000-0000-0000-000000000003','Theo Demø','theo.demo','member','New to the lineup, learning the etiquette one wave at a time.',true,120,40,3,180),
 ('c1000000-0000-0000-0000-000000000004','Priya Demonte','priya.demonte','member','Longboard cruiser. Here for the sunrise more than the barrels.',false,90,25,2,520),
 ('c1000000-0000-0000-0000-000000000005','Diego Demsky','diego.demsky','member','Weekends only but never missing a glassy morning.',true,150,60,4,1440),
 ('c1000000-0000-0000-0000-000000000006','Hana Demir','hana.demir','member','Bodysurfing convert. Fins, foam, and good company.',true,80,20,1,95),
 ('c1000000-0000-0000-0000-000000000007','Owen Demarchi','owen.demarchi','guide','Twenty years on this reef. Happy to share a peak and a pointer.',true,720,360,14,260),
 ('c1000000-0000-0000-0000-000000000008','Lucia Demova','lucia.demova','member','Trading desk life for tide charts. Best decision yet.',false,60,15,1,2880),
 ('c1000000-0000-0000-0000-000000000009','Caleb Demmel','caleb.demmel','member','Grom dad. If the kids paddle out, so do I.',true,110,35,2,30),

 -- ---- Circle 2: Moonlight Beach Sound Bath (holistic) ----
 ('c1000000-0000-0000-0000-000000000010','Aria Demonov','aria.demonov','host','Sound healer and beach-fire keeper. The bowls do the talking.',true,880,610,18,8),
 ('c1000000-0000-0000-0000-000000000011','Noah Demula','noah.demula','crew','I haul the blankets and tune the bowls. Logistics as devotion.',true,380,200,7,55),
 ('c1000000-0000-0000-0000-000000000012','Maya Demby','maya.demby','member','Came for sleep, stayed for the stillness.',true,70,30,2,140),
 ('c1000000-0000-0000-0000-000000000013','Eli Demko','eli.demko','member','Skeptic turned regular. The nervous-system reset is real.',false,55,18,1,600),
 ('c1000000-0000-0000-0000-000000000014','Freya Demidov','freya.demidov','member','Full moons only, but I never miss one.',true,95,40,3,7),
 ('c1000000-0000-0000-0000-000000000015','Sam Demonski','sam.demonski','member','Bringing my daughter — she calls it the singing beach.',true,65,22,1,320),
 ('c1000000-0000-0000-0000-000000000016','Indira Dem','indira.dem','mentor','Holding space for ten years. The ocean is the real facilitator.',true,690,480,16,210),
 ('c1000000-0000-0000-0000-000000000017','Jonah Demarchi','jonah.demarchi','member','Sound is medicine. Also it''s just a beautiful way to end a Sunday.',false,40,12,1,4320),

 -- ---- Circle 3: Leucadia Makers (creative) ----
 ('c1000000-0000-0000-0000-000000000018','Wren Demonte','wren.demonte','host','Furniture maker on the 101. Open studio is open invitation.',true,910,540,19,12),
 ('c1000000-0000-0000-0000-000000000019','Tobias Demsky','tobias.demsky','crew','Run the screen-print station and the sign-up sheet.',true,360,170,6,80),
 ('c1000000-0000-0000-0000-000000000020','Camille Demova','camille.demova','member','Ceramics. I trade mugs for honest critique.',true,85,30,2,150),
 ('c1000000-0000-0000-0000-000000000021','Ravi Demir','ravi.demir','member','Learning the lathe. Mostly making sawdust so far.',false,45,14,1,900),
 ('c1000000-0000-0000-0000-000000000022','Greta Demmel','greta.demmel','member','Bookbinder hiding in a surf town. Found my people here.',true,100,42,3,9),
 ('c1000000-0000-0000-0000-000000000023','Felix Demula','felix.demula','member','Neon and signage. I light up the maker nights, literally.',true,70,24,1,260),
 ('c1000000-0000-0000-0000-000000000024','Astrid Demby','astrid.demby','guide','Two decades in the trade. Show me your work-in-progress.',true,640,330,12,420),
 ('c1000000-0000-0000-0000-000000000025','Mateo Demko','mateo.demko','member','Weekend whittler, weekday spreadsheet wrangler.',false,35,10,1,5760),

 -- ---- Circle 4: Carlsbad Village Run Club (movement) ----
 ('c1000000-0000-0000-0000-000000000026','Nadia Demidov','nadia.demidov','host','Pace leader and burrito-stop organizer. No one runs alone here.',true,960,580,22,6),
 ('c1000000-0000-0000-0000-000000000027','Liam Demonov','liam.demonov','crew','Sweep runner — I''ve got the back of the pack.',true,400,190,8,45),
 ('c1000000-0000-0000-0000-000000000028','Yuki Demonski','yuki.demonski','member','Couch-to-5K graduate, now chasing the seawall sunrise.',true,130,50,4,20),
 ('c1000000-0000-0000-0000-000000000029','Omar Dem','omar.dem','member','Marathon training base miles. Love the company.',false,160,70,5,300),
 ('c1000000-0000-0000-0000-000000000030','Bea Demarchi','bea.demarchi','member','Stroller-friendly pace, please. Thank you, crew.',true,75,28,2,110),
 ('c1000000-0000-0000-0000-000000000031','Soren Demsky','soren.demsky','member','New in town, used the run club to make friends. Worked.',true,90,32,2,8),
 ('c1000000-0000-0000-0000-000000000032','Tara Demova','tara.demova','member','Saturdays are sacred. Tuesdays are negotiable.',false,55,18,1,1440),
 ('c1000000-0000-0000-0000-000000000033','Kofi Demir','kofi.demir','member','Sprinter pretending to enjoy long slow distance.',true,140,55,3,200),

 -- ---- Circle 5: Carlsbad Breathwork Collective (holistic) ----
 ('c1000000-0000-0000-0000-000000000034','Selene Demmel','selene.demmel','host','Breath facilitator. We meet to exhale the week away.',true,870,560,17,11),
 ('c1000000-0000-0000-0000-000000000035','Arman Demula','arman.demula','crew','Mats, tea, and timing the rounds. Glad to help you land.',true,350,160,6,70),
 ('c1000000-0000-0000-0000-000000000036','Lena Demby','lena.demby','member','Came for anxiety, found a community. Both improved.',true,80,30,2,130),
 ('c1000000-0000-0000-0000-000000000037','Pablo Demko','pablo.demko','member','First-timer who definitely cried. No regrets.',false,40,12,1,650),
 ('c1000000-0000-0000-0000-000000000038','Iris Demidov','iris.demidov','member','Three breaths in, I''m already calmer walking in the door.',true,95,38,2,9),
 ('c1000000-0000-0000-0000-000000000039','Dmitri Demonov','dmitri.demonov','member','Free-diver using this to extend my breath-hold. Bonus calm.',true,120,46,3,240),
 ('c1000000-0000-0000-0000-000000000040','Naomi Dem','naomi.dem','mentor','Trauma-informed practitioner. Slow is fast here.',true,660,440,15,360),

 -- ---- Circle 6: Carlsbad Founders Table (business-support) ----
 ('c1000000-0000-0000-0000-000000000041','Gabe Demonte','gabe.demonte','host','Second-time founder. I host the table and keep us honest.',true,930,600,20,7),
 ('c1000000-0000-0000-0000-000000000042','Lila Demsky','lila.demsky','crew','I run the intro round and the follow-ups. Connector by nature.',true,390,210,7,50),
 ('c1000000-0000-0000-0000-000000000043','Hugo Demova','hugo.demova','member','Bootstrapping a hardware startup out of my garage in Carlsbad.',true,110,44,3,160),
 ('c1000000-0000-0000-0000-000000000044','Priscilla Demir','priscilla.demir','member','Agency owner. Here for the accountability, staying for the people.',false,70,26,1,1080),
 ('c1000000-0000-0000-0000-000000000045','Ben Demmel','ben.demmel','member','Pre-revenue and proud. This table keeps me sane.',true,85,30,2,10),
 ('c1000000-0000-0000-0000-000000000046','Anya Demula','anya.demula','mentor','Exited once, advising now. Ask me the hard questions.',true,700,500,16,280),
 ('c1000000-0000-0000-0000-000000000047','Carlos Demby','carlos.demby','member','SaaS founder. Trading growth tactics over flat whites.',false,60,20,1,2160),

 -- ---- Circle 7: Cardiff Cold Plunge (holistic) ----
 ('c1000000-0000-0000-0000-000000000048','Sigrid Demko','sigrid.demko','host','Cold-water guide. The reef at dawn will change your year.',true,900,570,19,9),
 ('c1000000-0000-0000-0000-000000000049','Reza Demidov','reza.demidov','crew','I time the rounds and warm the tea. Breathe, you''ve got this.',true,370,180,6,60),
 ('c1000000-0000-0000-0000-000000000050','Joelle Demonov','joelle.demonov','member','Two-minute plunges and a whole new nervous system.',true,90,34,2,15),
 ('c1000000-0000-0000-0000-000000000051','Aaron Dem','aaron.dem','member','Came for recovery, stayed for the morning crew.',false,50,16,1,720),
 ('c1000000-0000-0000-0000-000000000052','Mira Demonte','mira.demonte','member','The gasp, then the calm. Hooked since day one.',true,100,40,3,8),
 ('c1000000-0000-0000-0000-000000000053','Niko Demsky','niko.demsky','member','Surfer who finally embraced the cold without a wetsuit.',true,130,52,4,190),

 -- ---- Circle 8: Cedros Creatives (creative) ----
 ('c1000000-0000-0000-0000-000000000054','Vera Demova','vera.demova','host','Studio owner on Cedros. I host portfolio nights and pour the wine.',true,890,550,18,13),
 ('c1000000-0000-0000-0000-000000000055','Idris Demir','idris.demir','crew','Photographer documenting the lane. Tag me, I''ll shoot it.',true,360,170,6,75),
 ('c1000000-0000-0000-0000-000000000056','Cleo Demmel','cleo.demmel','member','Textile designer. I find collabs faster on this block than online.',true,85,32,2,140),
 ('c1000000-0000-0000-0000-000000000057','Hassan Demula','hassan.demula','member','Brand designer between clients. Here for the critique nights.',false,45,15,1,980),
 ('c1000000-0000-0000-0000-000000000058','Juno Demby','juno.demby','member','Illustrator. The coffee walks unblock me every single time.',true,95,38,3,10),
 ('c1000000-0000-0000-0000-000000000059','Theo Demko','theo.demko2','guide','Ran a studio for fifteen years. Ask me about pricing your work.',true,630,340,12,400),

 -- ---- Circle 9: Oside Sunrise Surf (movement) ----
 ('c1000000-0000-0000-0000-000000000060','Kai Demidov','kai.demidov','host','Pier rat since birth. Dawn patrol, then tacos. Always.',true,950,590,21,6),
 ('c1000000-0000-0000-0000-000000000061','Esme Demonov','esme.demonov','crew','Surf-report poster and stoke amplifier. See you out there.',true,390,185,7,48),
 ('c1000000-0000-0000-0000-000000000062','Bruno Demonte','bruno.demonte','member','Longboard logger. North side, every morning I can.',true,120,48,3,18),
 ('c1000000-0000-0000-0000-000000000063','Saoirse Demsky','saoirse.demsky','member','Just moved from the Midwest. The ocean still feels unreal.',false,55,18,1,860),
 ('c1000000-0000-0000-0000-000000000064','Malik Dem','malik.dem','member','Shortboard, high tide, low expectations, big smiles.',true,100,40,2,9),
 ('c1000000-0000-0000-0000-000000000065','Tess Demova','tess.demova','member','Grom mom turned surfer. The pier crew adopted us.',true,75,28,2,210),

 -- ---- Circle 10: Oceanside Vinyasa (movement) ----
 ('c1000000-0000-0000-0000-000000000066','Yara Demir','yara.demir','host','Bluff-top flow teacher. Donation-based, judgment-free, ocean-fed.',true,880,560,18,10),
 ('c1000000-0000-0000-0000-000000000067','Cyrus Demmel','cyrus.demmel','crew','I lug the mats and greet newcomers. First class is the hardest.',true,350,165,6,65),
 ('c1000000-0000-0000-0000-000000000068','Lottie Demby','lottie.demby','member','Stiff cyclist learning to bend. The view helps.',true,80,30,2,120),
 ('c1000000-0000-0000-0000-000000000069','Amara Demko','amara.demko','member','Sunrise flow is the only meeting I never reschedule.',false,50,16,1,700),
 ('c1000000-0000-0000-0000-000000000070','Finn Demidov','finn.demidov','member','Came for the stretch, stayed for the community breakfast.',true,95,36,3,8),

 -- ---- Circle 11: Vista Hops & Hikes (movement) ----
 ('c1000000-0000-0000-0000-000000000071','Rosa Demonte','rosa.demonte','host','Trail leader and taproom navigator. Earn the pint, every time.',true,910,560,19,14),
 ('c1000000-0000-0000-0000-000000000072','Gus Demsky','gus.demsky','crew','Route scout. I find the shade and the best post-hike beer.',true,360,175,6,90),
 ('c1000000-0000-0000-0000-000000000073','Imani Demova','imani.demova','member','New hiker, fast friend-maker. Vista trails are underrated.',true,85,32,2,160),
 ('c1000000-0000-0000-0000-000000000074','Dane Demmel','dane.demmel','member','Here mostly for the hops, won over by the hikes.',false,45,14,1,1300),
 ('c1000000-0000-0000-0000-000000000075','Priya Demko','priya.demko','member','Birder on the move. I''ll slow us down for a good hawk.',true,90,34,2,12),

 -- ---- Circle 12: CSUSM Mindfulness (spirituality) ----
 ('c1000000-0000-0000-0000-000000000076','Sana Demidov','sana.demidov','host','Student facilitator. Ten quiet minutes between classes change my day.',true,870,540,17,9),
 ('c1000000-0000-0000-0000-000000000077','Leo Demonov','leo.demonov','crew','I set up the cushions and send the reminders. See you on the mat.',true,330,150,5,55),
 ('c1000000-0000-0000-0000-000000000078','Mei Demonte','mei.demonte','member','Grad student using sits to survive thesis season.',true,70,26,2,130),
 ('c1000000-0000-0000-0000-000000000079','Jasper Dem','jasper.dem','member','First meditation circle ever. Less scary than I expected.',false,40,12,1,640),
 ('c1000000-0000-0000-0000-000000000080','Zoe Demova','zoe.demova','member','Journaling prompts > caffeine for my anxiety. Who knew.',true,95,38,3,7),
 ('c1000000-0000-0000-0000-000000000081','Ravi Demby','ravi.demby','mentor','Campus counselor volunteering my lunch hours. Quiet company helps.',true,650,430,15,300)
) AS m(id,display_name,handle,role,bio,avatar,zaps,gems,streak,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors the member's role.
--    member_count is maintained by trg_increment_circle_member_count.
--    Each member's primary circle (below). A subset also joins a 2nd circle.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT mm.profile_id, mm.circle_id, 'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)  -- members get NULL volunteer_role
FROM (VALUES
 -- Circle 1
 ('c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000004','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000005','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000006','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000007','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000008','c2000000-0000-0000-0000-000000000001'),
 ('c1000000-0000-0000-0000-000000000009','c2000000-0000-0000-0000-000000000001'),
 -- Circle 2
 ('c1000000-0000-0000-0000-000000000010','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000011','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000012','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000013','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000014','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000015','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000016','c2000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000017','c2000000-0000-0000-0000-000000000002'),
 -- Circle 3
 ('c1000000-0000-0000-0000-000000000018','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000019','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000020','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000021','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000022','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000023','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000024','c2000000-0000-0000-0000-000000000003'),
 ('c1000000-0000-0000-0000-000000000025','c2000000-0000-0000-0000-000000000003'),
 -- Circle 4
 ('c1000000-0000-0000-0000-000000000026','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000027','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000028','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000029','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000030','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000031','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000032','c2000000-0000-0000-0000-000000000004'),
 ('c1000000-0000-0000-0000-000000000033','c2000000-0000-0000-0000-000000000004'),
 -- Circle 5
 ('c1000000-0000-0000-0000-000000000034','c2000000-0000-0000-0000-000000000005'),
 ('c1000000-0000-0000-0000-000000000035','c2000000-0000-0000-0000-000000000005'),
 ('c1000000-0000-0000-0000-000000000036','c2000000-0000-0000-0000-000000000005'),
 ('c1000000-0000-0000-0000-000000000037','c2000000-0000-0000-0000-000000000005'),
 ('c1000000-0000-0000-0000-000000000038','c2000000-0000-0000-0000-000000000005'),
 ('c1000000-0000-0000-0000-000000000039','c2000000-0000-0000-0000-000000000005'),
 ('c1000000-0000-0000-0000-000000000040','c2000000-0000-0000-0000-000000000005'),
 -- Circle 6
 ('c1000000-0000-0000-0000-000000000041','c2000000-0000-0000-0000-000000000006'),
 ('c1000000-0000-0000-0000-000000000042','c2000000-0000-0000-0000-000000000006'),
 ('c1000000-0000-0000-0000-000000000043','c2000000-0000-0000-0000-000000000006'),
 ('c1000000-0000-0000-0000-000000000044','c2000000-0000-0000-0000-000000000006'),
 ('c1000000-0000-0000-0000-000000000045','c2000000-0000-0000-0000-000000000006'),
 ('c1000000-0000-0000-0000-000000000046','c2000000-0000-0000-0000-000000000006'),
 ('c1000000-0000-0000-0000-000000000047','c2000000-0000-0000-0000-000000000006'),
 -- Circle 7
 ('c1000000-0000-0000-0000-000000000048','c2000000-0000-0000-0000-000000000007'),
 ('c1000000-0000-0000-0000-000000000049','c2000000-0000-0000-0000-000000000007'),
 ('c1000000-0000-0000-0000-000000000050','c2000000-0000-0000-0000-000000000007'),
 ('c1000000-0000-0000-0000-000000000051','c2000000-0000-0000-0000-000000000007'),
 ('c1000000-0000-0000-0000-000000000052','c2000000-0000-0000-0000-000000000007'),
 ('c1000000-0000-0000-0000-000000000053','c2000000-0000-0000-0000-000000000007'),
 -- Circle 8
 ('c1000000-0000-0000-0000-000000000054','c2000000-0000-0000-0000-000000000008'),
 ('c1000000-0000-0000-0000-000000000055','c2000000-0000-0000-0000-000000000008'),
 ('c1000000-0000-0000-0000-000000000056','c2000000-0000-0000-0000-000000000008'),
 ('c1000000-0000-0000-0000-000000000057','c2000000-0000-0000-0000-000000000008'),
 ('c1000000-0000-0000-0000-000000000058','c2000000-0000-0000-0000-000000000008'),
 ('c1000000-0000-0000-0000-000000000059','c2000000-0000-0000-0000-000000000008'),
 -- Circle 9
 ('c1000000-0000-0000-0000-000000000060','c2000000-0000-0000-0000-000000000009'),
 ('c1000000-0000-0000-0000-000000000061','c2000000-0000-0000-0000-000000000009'),
 ('c1000000-0000-0000-0000-000000000062','c2000000-0000-0000-0000-000000000009'),
 ('c1000000-0000-0000-0000-000000000063','c2000000-0000-0000-0000-000000000009'),
 ('c1000000-0000-0000-0000-000000000064','c2000000-0000-0000-0000-000000000009'),
 ('c1000000-0000-0000-0000-000000000065','c2000000-0000-0000-0000-000000000009'),
 -- Circle 10
 ('c1000000-0000-0000-0000-000000000066','c2000000-0000-0000-0000-000000000010'),
 ('c1000000-0000-0000-0000-000000000067','c2000000-0000-0000-0000-000000000010'),
 ('c1000000-0000-0000-0000-000000000068','c2000000-0000-0000-0000-000000000010'),
 ('c1000000-0000-0000-0000-000000000069','c2000000-0000-0000-0000-000000000010'),
 ('c1000000-0000-0000-0000-000000000070','c2000000-0000-0000-0000-000000000010'),
 -- Circle 11
 ('c1000000-0000-0000-0000-000000000071','c2000000-0000-0000-0000-000000000011'),
 ('c1000000-0000-0000-0000-000000000072','c2000000-0000-0000-0000-000000000011'),
 ('c1000000-0000-0000-0000-000000000073','c2000000-0000-0000-0000-000000000011'),
 ('c1000000-0000-0000-0000-000000000074','c2000000-0000-0000-0000-000000000011'),
 ('c1000000-0000-0000-0000-000000000075','c2000000-0000-0000-0000-000000000011'),
 -- Circle 12
 ('c1000000-0000-0000-0000-000000000076','c2000000-0000-0000-0000-000000000012'),
 ('c1000000-0000-0000-0000-000000000077','c2000000-0000-0000-0000-000000000012'),
 ('c1000000-0000-0000-0000-000000000078','c2000000-0000-0000-0000-000000000012'),
 ('c1000000-0000-0000-0000-000000000079','c2000000-0000-0000-0000-000000000012'),
 ('c1000000-0000-0000-0000-000000000080','c2000000-0000-0000-0000-000000000012'),
 ('c1000000-0000-0000-0000-000000000081','c2000000-0000-0000-0000-000000000012'),

 -- ---- Cross-memberships: a handful of members in a 2nd circle (always as plain member) ----
 ('c1000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000009'),  -- surfer also at Oside
 ('c1000000-0000-0000-0000-000000000053','c2000000-0000-0000-0000-000000000001'),  -- Cardiff plunger also Swami's
 ('c1000000-0000-0000-0000-000000000039','c2000000-0000-0000-0000-000000000007'),  -- breathwork freediver also cold plunge
 ('c1000000-0000-0000-0000-000000000031','c2000000-0000-0000-0000-000000000011'),  -- runner also hikes
 ('c1000000-0000-0000-0000-000000000020','c2000000-0000-0000-0000-000000000008'),  -- Leucadia ceramicist also Cedros
 ('c1000000-0000-0000-0000-000000000028','c2000000-0000-0000-0000-000000000010'),  -- runner also vinyasa
 ('c1000000-0000-0000-0000-000000000073','c2000000-0000-0000-0000-000000000004'),  -- Vista hiker also Carlsbad run club
 ('c1000000-0000-0000-0000-000000000050','c2000000-0000-0000-0000-000000000005'),  -- plunger also breathwork
 ('c1000000-0000-0000-0000-000000000058','c2000000-0000-0000-0000-000000000003'),  -- Cedros illustrator also Leucadia makers
 ('c1000000-0000-0000-0000-000000000080','c2000000-0000-0000-0000-000000000005')   -- CSUSM student also breathwork
) AS mm(profile_id, circle_id)
JOIN profiles p ON p.id = mm.profile_id
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. POSTS — 3–5 per circle, voiced to role + interest. Fixed UUIDs (c4…),
--    scope_id = circle id, visibility 'group', post_type default 'feed'.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, is_demo)
SELECT v.id, v.author_id, v.circle_id, 'group'::post_visibility, v.body, true
FROM (VALUES
 -- Circle 1: Swami's Dawn Patrol
 ('c4000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001',
   'Welcome to the Dawn Patrol! 🌊 Tomorrow looks chest-high and glassy at Swami''s — paddle out is 6am sharp, coffee on the bluff after. New faces, come say hi on the sand first.'),
 ('c4000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000002','c2000000-0000-0000-0000-000000000001',
   'Surf report: tide''s dropping through the morning, light offshore wind. Should stay clean til about 9. I''ll be the one in the teal wetsuit waving like a lunatic.'),
 ('c4000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000003','c2000000-0000-0000-0000-000000000001',
   'First proper session with you all this morning — finally caught a clean one off the point and the cheers from the lineup made my whole week. Thank you for the patience with a kook.'),
 ('c4000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000007','c2000000-0000-0000-0000-000000000001',
   'Little tip for the newer folks: watch where the regulars sit, don''t paddle straight to the peak, and always give a smile. Respect the reef and it gives back. Happy to share a wave anytime.'),

 -- Circle 2: Moonlight Beach Sound Bath
 ('c4000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000010','c2000000-0000-0000-0000-000000000002',
   'Full-moon sound bath this Friday on the sand at Moonlight 🌕 Doors (well, the dunes) at 7. Bring a blanket and water. Arrive a few minutes early so we can settle before the first bowl.'),
 ('c4000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000011','c2000000-0000-0000-0000-000000000002',
   'I''ll have spare blankets and a few extra eye pillows by the fire pit, so don''t stress if you''re coming straight from work. Just find me — I''m the one tuning bowls and looking very serious about it.'),
 ('c4000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000012','c2000000-0000-0000-0000-000000000002',
   'Came for better sleep, left feeling like I''d set down a backpack I''d been carrying for months. Grateful for this little beach and these people. 🙏'),
 ('c4000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000016','c2000000-0000-0000-0000-000000000002',
   'A gentle reminder as we head into a new moon: you don''t have to "do" anything in a sound bath. Let the surf and the bowls do the work. Your only job is to lie down and let go.'),

 -- Circle 3: Leucadia Makers
 ('c4000000-0000-0000-0000-000000000009','c1000000-0000-0000-0000-000000000018','c2000000-0000-0000-0000-000000000003',
   'Maker night is back this Thursday at the 101 studio! 🔨 Bring a work-in-progress, finished or not. We''ll do show-and-tell, the screen-print station will be running, and there''s cold brew on tap.'),
 ('c4000000-0000-0000-0000-000000000010','c1000000-0000-0000-0000-000000000019','c2000000-0000-0000-0000-000000000003',
   'Screen-print sign-up sheet is live for Thursday — four slots, first come. Bring your own shirt or grab a blank from me for a few bucks. Pull a good squeegee and you''re hooked for life.'),
 ('c4000000-0000-0000-0000-000000000011','c1000000-0000-0000-0000-000000000020','c2000000-0000-0000-0000-000000000003',
   'Pulled my first set of mugs out of the kiln that didn''t crack 🎉 Trading a couple for honest critique at the next maker night. Be brutal, I can take it.'),
 ('c4000000-0000-0000-0000-000000000012','c1000000-0000-0000-0000-000000000024','c2000000-0000-0000-0000-000000000003',
   'For anyone stuck on a piece: bring the thing you''re avoiding, not the thing you''re proud of. The work-in-progress is where the good conversations happen. That''s the whole point of the table.'),

 -- Circle 4: Carlsbad Village Run Club
 ('c4000000-0000-0000-0000-000000000013','c1000000-0000-0000-0000-000000000026','c2000000-0000-0000-0000-000000000004',
   'Saturday long run! 🏃 We roll from the Village at 7, out to the seawall and back, every pace welcome. Burrito stop after for anyone who wants it (you''ve earned it). No one runs alone here.'),
 ('c4000000-0000-0000-0000-000000000014','c1000000-0000-0000-0000-000000000027','c2000000-0000-0000-0000-000000000004',
   'I''ll be sweeping the back of the pack again Saturday, so if you''re nervous about pace — don''t be. We literally do not leave anyone behind. Find me, I''m chatty and slow on purpose.'),
 ('c4000000-0000-0000-0000-000000000015','c1000000-0000-0000-0000-000000000028','c2000000-0000-0000-0000-000000000004',
   'Six months ago I couldn''t run to the end of my street. Did the full seawall loop this morning without stopping. Still can''t quite believe it. Thank you, crew. 🥹'),
 ('c4000000-0000-0000-0000-000000000016','c1000000-0000-0000-0000-000000000031','c2000000-0000-0000-0000-000000000004',
   'Moved here three weeks ago knowing nobody. Showed up to a Tuesday run on a whim and now I have brunch plans and a hiking invite. North County, you''re alright.'),

 -- Circle 5: Carlsbad Breathwork Collective
 ('c4000000-0000-0000-0000-000000000017','c1000000-0000-0000-0000-000000000034','c2000000-0000-0000-0000-000000000005',
   'This week''s session is Wednesday at 6:30. We''ll do a longer down-regulating round to close out the week — perfect if you''ve been running hot. Tea and quiet after. Beginners, this is a great one to start on.'),
 ('c4000000-0000-0000-0000-000000000018','c1000000-0000-0000-0000-000000000035','c2000000-0000-0000-0000-000000000005',
   'Mats and bolsters are provided but feel free to bring your own if you''re particular. I''ll have the kettle on by 6:15 so come early, get cozy, and let the week fall off your shoulders.'),
 ('c4000000-0000-0000-0000-000000000019','c1000000-0000-0000-0000-000000000036','c2000000-0000-0000-0000-000000000005',
   'I walked in wound up about a work thing and walked out genuinely not caring about it anymore. Same problem, totally different nervous system. Wild what twenty minutes of breathing can do.'),
 ('c4000000-0000-0000-0000-000000000020','c1000000-0000-0000-0000-000000000040','c2000000-0000-0000-0000-000000000005',
   'Reminder for the new folks: if big emotions come up mid-session, that''s not a problem to fix — that''s the practice working. Slow is fast here. You''re safe to let it move.'),

 -- Circle 6: Carlsbad Founders Table
 ('c4000000-0000-0000-0000-000000000021','c1000000-0000-0000-0000-000000000041','c2000000-0000-0000-0000-000000000006',
   'Next Founders Table is Thursday, 8am, the usual spot in the Village. ☕ Format as always: quick wins, current blocker, one ask. No decks, no pitching each other. Bring the thing you''re actually stuck on.'),
 ('c4000000-0000-0000-0000-000000000022','c1000000-0000-0000-0000-000000000042','c2000000-0000-0000-0000-000000000006',
   'Heads up — I''ve got two warm intros to share from last week''s asks (a fractional CFO and a great contract designer). DM me before Thursday and I''ll make the connections.'),
 ('c4000000-0000-0000-0000-000000000023','c1000000-0000-0000-0000-000000000043','c2000000-0000-0000-0000-000000000006',
   'Shipped the first working prototype out of my garage this week. It''s held together with hope and hot glue but it WORKS. This table talked me off the ledge twice to get here. 🙏'),
 ('c4000000-0000-0000-0000-000000000024','c1000000-0000-0000-0000-000000000046','c2000000-0000-0000-0000-000000000006',
   'Honest question to chew on before Thursday: what would you build if you stopped optimizing for the next raise? Sometimes the most useful thing this table does is ask the uncomfortable one.'),

 -- Circle 7: Cardiff Cold Plunge
 ('c4000000-0000-0000-0000-000000000025','c1000000-0000-0000-0000-000000000048','c2000000-0000-0000-0000-000000000007',
   'Plunge tomorrow at first light by the Cardiff reef 🧊 Water''s sitting around 60. We''ll breathe together on the sand, then in we go. Two minutes is plenty for your first time. You''ll feel like a new human.'),
 ('c4000000-0000-0000-0000-000000000026','c1000000-0000-0000-0000-000000000049','c2000000-0000-0000-0000-000000000007',
   'I''ll have the timer and a thermos of ginger tea going. The trick is the exhale — long and slow as you get in. Don''t fight the gasp, ride it. I''ve got you on the count.'),
 ('c4000000-0000-0000-0000-000000000027','c1000000-0000-0000-0000-000000000050','c2000000-0000-0000-0000-000000000007',
   'Two minutes in the cold this morning and I''ve been buzzing and calm all day. Didn''t touch my afternoon coffee. Whatever this is, I''m keeping it. ❄️'),

 -- Circle 8: Cedros Creatives
 ('c4000000-0000-0000-0000-000000000028','c1000000-0000-0000-0000-000000000054','c2000000-0000-0000-0000-000000000008',
   'Portfolio night at the studio next Tuesday! 🎨 Bring six pieces and a thick skin — kind, useful critique only. Wine''s on me. This block has launched more collabs than any conference I''ve been to.'),
 ('c4000000-0000-0000-0000-000000000029','c1000000-0000-0000-0000-000000000055','c2000000-0000-0000-0000-000000000008',
   'Doing a free portrait round during Tuesday''s walk for anyone who needs fresh headshots — natural light, ten minutes, no pressure. Tag me and I''ll put you on the list.'),
 ('c4000000-0000-0000-0000-000000000030','c1000000-0000-0000-0000-000000000056','c2000000-0000-0000-0000-000000000008',
   'Met a brand designer on the coffee walk last week and we''re now collaborating on a textile line. This happened because we walked thirty feet down the lane. Cedros magic is real.'),
 ('c4000000-0000-0000-0000-000000000031','c1000000-0000-0000-0000-000000000059','c2000000-0000-0000-0000-000000000008',
   'Pricing your creative work is a skill, not a vibe. If you''re undercharging out of fear (most of us are), grab me Tuesday. Fifteen years of mistakes I''m happy to save you from.'),

 -- Circle 9: Oside Sunrise Surf
 ('c4000000-0000-0000-0000-000000000032','c1000000-0000-0000-0000-000000000060','c2000000-0000-0000-0000-000000000009',
   'Dawn patrol off the pier tomorrow! 🌅 North side''s been the call all week — peeling lefts and friendly crowd. Paddle out 6, tacos at the usual spot after. Bring the groms, bring the stoke.'),
 ('c4000000-0000-0000-0000-000000000033','c1000000-0000-0000-0000-000000000061','c2000000-0000-0000-0000-000000000009',
   'Surf report: small but clean, mid-tide filling in, light wind til mid-morning. Longboard kind of day. I''ll post a photo from the pier at 5:45 so you can see before you commit.'),
 ('c4000000-0000-0000-0000-000000000034','c1000000-0000-0000-0000-000000000063','c2000000-0000-0000-0000-000000000009',
   'Midwest kid here — I''ve now stood up on a wave at sunrise three mornings in a row and I still can''t believe this is my life. Thanks for adopting me, pier crew. 🤙'),

 -- Circle 10: Oceanside Vinyasa
 ('c4000000-0000-0000-0000-000000000035','c1000000-0000-0000-0000-000000000066','c2000000-0000-0000-0000-000000000010',
   'Sunrise flow on the bluff tomorrow, 6:30. 🧘 Donation-based, all bodies, all levels. We''ll move with the light coming up over the water. Stay for the community breakfast after — it''s half the magic.'),
 ('c4000000-0000-0000-0000-000000000036','c1000000-0000-0000-0000-000000000067','c2000000-0000-0000-0000-000000000010',
   'Extra mats by the rail for anyone who forgot theirs, and I''ll be at the top of the path to greet first-timers. The first class is genuinely the hardest part — after that you''ll be hooked.'),
 ('c4000000-0000-0000-0000-000000000037','c1000000-0000-0000-0000-000000000070','c2000000-0000-0000-0000-000000000010',
   'Came for the stretch, stayed for the people. Didn''t expect a 6:30am yoga class to turn into my favorite part of the week, but here we are. Grateful. 🙏'),

 -- Circle 11: Vista Hops & Hikes
 ('c4000000-0000-0000-0000-000000000038','c1000000-0000-0000-0000-000000000071','c2000000-0000-0000-0000-000000000011',
   'Saturday hike + taproom! ⛰️🍺 Moderate five-miler with good shade and a great view, then we earn our pints at the brewery. Bring water and decent shoes. Earn the pint, every single time.'),
 ('c4000000-0000-0000-0000-000000000039','c1000000-0000-0000-0000-000000000072','c2000000-0000-0000-0000-000000000011',
   'Scouted Saturday''s route this morning — wildflowers are popping and there''s a shady overlook perfect for a snack stop. Trailhead parking fills early, so carpool from the brewery lot at 8.'),
 ('c4000000-0000-0000-0000-000000000040','c1000000-0000-0000-0000-000000000073','c2000000-0000-0000-0000-000000000011',
   'Three hikes in and I already have a standing Saturday crew and a favorite local IPA. Vista trails are so underrated. So glad I stopped lurking and just showed up.'),

 -- Circle 12: CSUSM Mindfulness
 ('c4000000-0000-0000-0000-000000000041','c1000000-0000-0000-0000-000000000076','c2000000-0000-0000-0000-000000000012',
   'Midday sit this week between classes 🧘 Ten quiet minutes, a short journaling prompt, then back to the chaos a little lighter. No experience needed — just show up and breathe. Cushions provided.'),
 ('c4000000-0000-0000-0000-000000000042','c1000000-0000-0000-0000-000000000077','c2000000-0000-0000-0000-000000000012',
   'I''ll have the cushions set up by the quiet lawn and reminders going out the morning of. If it''s your first time, come a couple minutes early and I''ll walk you through it. No pressure, ever.'),
 ('c4000000-0000-0000-0000-000000000043','c1000000-0000-0000-0000-000000000078','c2000000-0000-0000-0000-000000000012',
   'Thesis season is eating me alive and these midday sits are the only ten minutes I''m not spiraling. Small thing, huge difference. Thanks for keeping this going during finals.'),
 ('c4000000-0000-0000-0000-000000000044','c1000000-0000-0000-0000-000000000081','c2000000-0000-0000-0000-000000000012',
   'A reflection as the term winds down: you don''t need to be good at meditation to benefit from it. Showing up and sitting with the restlessness IS the practice. Proud of this little circle.')
) AS v(id, author_id, circle_id, body)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id);

-- =====================================================================
-- 5. EVENTS — upcoming (next ~2–3 weeks) for 7 of the 12 circles.
--    host_id = that circle's host; scope_type 'circle'; fixed UUIDs (c5…).
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug, starts_at, ends_at, location, is_cancelled, is_demo)
SELECT v.id, v.host_id, v.circle_id, 'circle', v.title, v.slug,
       v.starts_at::timestamptz, v.ends_at::timestamptz, v.location, false, true
FROM (VALUES
 ('c5000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001',
   'Swami''s Dawn Patrol — Saturday Session','swamis-dawn-saturday',
   (now() + interval '5 days')::date + time '06:00', (now() + interval '5 days')::date + time '08:30',
   'Swami''s Beach stairs, Encinitas'),
 ('c5000000-0000-0000-0000-000000000002','c1000000-0000-0000-0000-000000000010','c2000000-0000-0000-0000-000000000002',
   'Full-Moon Sound Bath on the Sand','moonlight-full-moon-soundbath',
   (now() + interval '9 days')::date + time '19:00', (now() + interval '9 days')::date + time '20:30',
   'Moonlight Beach fire pits, Encinitas'),
 ('c5000000-0000-0000-0000-000000000003','c1000000-0000-0000-0000-000000000018','c2000000-0000-0000-0000-000000000003',
   'Leucadia Maker Night + Show-and-Tell','leucadia-maker-night',
   (now() + interval '4 days')::date + time '18:00', (now() + interval '4 days')::date + time '21:00',
   '101 corridor studio, Leucadia'),
 ('c5000000-0000-0000-0000-000000000004','c1000000-0000-0000-0000-000000000026','c2000000-0000-0000-0000-000000000004',
   'Carlsbad Village Saturday Long Run','carlsbad-saturday-long-run',
   (now() + interval '6 days')::date + time '07:00', (now() + interval '6 days')::date + time '09:00',
   'Carlsbad Village train station'),
 ('c5000000-0000-0000-0000-000000000005','c1000000-0000-0000-0000-000000000041','c2000000-0000-0000-0000-000000000006',
   'Founders Table — Coffee & Accountability','carlsbad-founders-table-meet',
   (now() + interval '3 days')::date + time '08:00', (now() + interval '3 days')::date + time '09:30',
   'Coffee shop, Carlsbad Village'),
 ('c5000000-0000-0000-0000-000000000006','c1000000-0000-0000-0000-000000000048','c2000000-0000-0000-0000-000000000007',
   'Cardiff Sunrise Cold Plunge','cardiff-sunrise-plunge',
   (now() + interval '2 days')::date + time '06:30', (now() + interval '2 days')::date + time '07:30',
   'Cardiff reef beach access'),
 ('c5000000-0000-0000-0000-000000000007','c1000000-0000-0000-0000-000000000071','c2000000-0000-0000-0000-000000000011',
   'Vista Hops & Hikes — Trail + Taproom','vista-hops-hikes-saturday',
   (now() + interval '7 days')::date + time '08:30', (now() + interval '7 days')::date + time '12:00',
   'Vista trailhead → local taproom'),
 ('c5000000-0000-0000-0000-000000000008','c1000000-0000-0000-0000-000000000060','c2000000-0000-0000-0000-000000000009',
   'Oside Pier Dawn Patrol + Tacos','oside-pier-dawn-tacos',
   (now() + interval '8 days')::date + time '06:00', (now() + interval '8 days')::date + time '08:30',
   'Oceanside Pier, north side')
) AS v(id, host_id, circle_id, title, slug, starts_at, ends_at, location)
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = v.id);

COMMIT;
