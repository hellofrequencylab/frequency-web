-- =====================================================================
-- Demo seed v2 — CIRCLE 3: Leucadia Makers (creative)
-- =====================================================================
-- One circle + 20 auth-less demo members + memberships + posts + replies +
-- one circle_practice + one event, all is_demo = true.
--
-- Roster 20 · quota Lum0/Con1/Agt2/Op4/Run7/Ghost6 (matches §3 pyramid slice).
-- Host rank ⚡ Conduit (top-ranked). community_role: 1 host / 2 crew / 1 guide /
-- rest member. No Luminary in this circle (season_challenges_complete=false all).
--
-- UUID blocks (strictly inside, per DEMO-CAST Part B.2):
--   profiles  f1000000-…-0000000000{2c..3f}   (20 people)
--   circle    f2000000-0000-0000-0000-000000000003
--   posts     f4000000-…-00000000{0081..00c0}
--   replies   f4000000-…-00000000{1081..10c0}
--   event     f5000000-0000-0000-0000-000000000002
--   practice  e1000000-0000-0000-0000-000000000009 (Daily sketch)
--
-- member_count is NOT hand-set (membership trigger maintains it).
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING. Safe to re-run.
-- =====================================================================

BEGIN;

-- Resolve shared geography once (region + this circle's channel).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='creative') AS channel_id;

-- =====================================================================
-- 1. CIRCLE — member_count left to the trigger; hub_id NULL.
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000003'::uuid,
       'Leucadia Makers', 'leucadia-makers',
       NULL::uuid, 'in-person', 50, 'active',
       'Woodworkers, ceramicists, and screen-printers swapping skills in the Leucadia 101 corridor. Monthly maker nights, open studios, and a lot of honest show-and-tell. Bring a work-in-progress and a little sawdust.',
       33.0608, -117.3000, 'Leucadia', 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/leucadia-makers/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. MEMBERS (20) — tails 2c..3f.
--    rank quota: 0 Lum / 1 Con / 2 Agt / 4 Op / 7 Run / 6 Ghost.
--    role: 1 host (the Conduit) / 2 crew / 1 guide / rest member.
--    Stats inside §3 bands; season_challenges_complete=false (no Luminary).
-- =====================================================================
INSERT INTO profiles (id, auth_user_id, display_name, handle, community_role,
                      nexus_region_id, bio, avatar_url, current_season_rank,
                      current_season_zaps, lifetime_zaps, lifetime_gems, current_streak,
                      longest_streak, achievement_count, season_challenges_complete,
                      last_seen_at, is_active, is_demo)
SELECT m.id::uuid, NULL, m.display_name, m.handle, m.role::community_role,
       ctx.region_id, m.bio,
       CASE WHEN m.avatar THEN 'https://i.pravatar.cc/240?u=' || m.handle ELSE NULL END,
       m.rank::season_rank_enum,
       m.zaps, m.lifetime, m.gems, m.streak, m.longest, m.achv, false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank, zaps, lifetime, gems, streak, longest, achv, minutes-since-seen
 -- ---- Conduit host (1) ----
 ('f1000000-0000-0000-0000-00000000002c','Wren Halloran','wren.makes.leu','host',
   'Furniture maker on the 101. Open studio means open invitation — pull up a stool, bring the thing you''re stuck on.',
   true,'conduit',1840,5400,1080,24,28,19,18),
 -- ---- Agents (2) ----
 ('f1000000-0000-0000-0000-00000000002d','Tobias Vance','tobias.print.leu','crew',
   'I run the screen-print station and the sign-up sheet. Pull one good squeegee and you''re hooked for life.',
   true,'agent',1180,3100,620,15,18,14,55),
 ('f1000000-0000-0000-0000-00000000002e','Astrid Bergmann','astrid.clay.leu','guide',
   'Two decades at the wheel. Show me your work-in-progress, not your greatest hits — that''s where the good talks live.',
   true,'agent',1320,3600,710,17,21,15,210),
 -- ---- Operatives (4) ----
 ('f1000000-0000-0000-0000-00000000002f','Camille Ortega','camille.mugs.leu','crew',
   'Ceramicist trading mugs for honest critique. Be brutal, the glaze can take it.',
   true,'operative',640,1700,330,11,13,9,38),
 ('f1000000-0000-0000-0000-000000000030','Felix Brun','felix.neon.leu','member',
   'Neon and signage. I light up the maker nights — literally. Ask me about bending glass.',
   true,'operative',520,1400,270,9,12,8,120),
 ('f1000000-0000-0000-0000-000000000031','Greta Solberg','greta.binds.leu','member',
   'Bookbinder hiding in a surf town. Found my people at the long table.',
   true,'operative',470,1250,240,8,11,8,15),
 ('f1000000-0000-0000-0000-000000000032','Hugo Marchetti','hugo.turns.leu','member',
   'Bowl turner, weekend lathe addict. Shavings everywhere, no regrets.',
   false,'operative',380,1050,200,7,10,7,640),
 -- ---- Runners (7) ----
 ('f1000000-0000-0000-0000-000000000033','Lena Vasquez','lena.weaves.leu','member',
   'Weaver learning to slow down. The loom doesn''t care about my deadlines.',
   true,'runner',240,640,120,5,8,6,20),
 ('f1000000-0000-0000-0000-000000000034','Theo Nakamura','theo.solder.leu','member',
   'Tinkerer soldering little brass things. Show-and-tell is the best part of my month.',
   true,'runner',210,560,100,5,7,5,300),
 ('f1000000-0000-0000-0000-000000000035','Mara Linde','mara.dyes.leu','member',
   'Natural dyer. My hands are permanently indigo and I''ve made peace with it.',
   true,'runner',190,500,95,4,6,5,9),
 ('f1000000-0000-0000-0000-000000000036','Dante Rios','dante.carves.leu','member',
   'Spoon carver. One slow cut at a time, usually on the studio steps.',
   false,'runner',160,440,80,4,6,5,1440),
 ('f1000000-0000-0000-0000-000000000037','Saoirse Flynn','saoirse.tiles.leu','member',
   'Mosaic and tile. I pick up everyone''s broken seconds and make them whole.',
   true,'runner',140,400,75,3,5,4,110),
 ('f1000000-0000-0000-0000-000000000038','Niall Brophy','niall.frames.leu','member',
   'Picture framer by trade, hobby joiner after hours. Square corners are my love language.',
   true,'runner',120,360,60,3,5,4,12),
 ('f1000000-0000-0000-0000-000000000039','Esme Larsson','esme.print.leu','member',
   'Linocut and risograph. Trading prints for advice every maker night.',
   true,'runner',105,320,55,2,4,4,200),
 -- ---- Ghosts (6) ----
 ('f1000000-0000-0000-0000-00000000003a','Bruno Costa','bruno.whittle.leu','member',
   'Weekend whittler, weekday spreadsheet wrangler. Mostly making sawdust so far.',
   true,'ghost',80,210,38,2,3,3,30),
 ('f1000000-0000-0000-0000-00000000003b','Ines Moreau','ines.makes.leu','member',
   'Just moved to Leucadia. Heard there''s a maker night and I had to find it.',
   true,'ghost',60,160,28,1,2,2,260),
 ('f1000000-0000-0000-0000-00000000003c','Kofi Mensah','kofi.builds.leu','member',
   'Lapsed woodshop kid getting back into it. Lurked a month, finally signed the sheet.',
   false,'ghost',45,120,20,1,2,2,2880),
 ('f1000000-0000-0000-0000-00000000003d','Yara Demirci','yara.stitch.leu','member',
   'Embroidery and mending. Brought a tote, left with new friends.',
   true,'ghost',35,95,16,1,1,1,360),
 ('f1000000-0000-0000-0000-00000000003e','Owen Pryce','owen.kiln.leu','member',
   'First pot didn''t crack last week. Small win, huge grin.',
   true,'ghost',25,70,12,0,1,1,4320),
 ('f1000000-0000-0000-0000-00000000003f','Talia Roth','talia.draws.leu','member',
   'Sketchbook hoarder finally showing the pages. Terrifying, recommend it.',
   false,'ghost',18,55,9,0,1,1,7200)
) AS m(id,display_name,handle,role,bio,avatar,rank,zaps,lifetime,gems,streak,longest,achv,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role.
--    member_count maintained by the membership trigger. No cross-memberships.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT mm.profile_id::uuid, 'f2000000-0000-0000-0000-000000000003'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM (VALUES
 ('f1000000-0000-0000-0000-00000000002c'),
 ('f1000000-0000-0000-0000-00000000002d'),
 ('f1000000-0000-0000-0000-00000000002e'),
 ('f1000000-0000-0000-0000-00000000002f'),
 ('f1000000-0000-0000-0000-000000000030'),
 ('f1000000-0000-0000-0000-000000000031'),
 ('f1000000-0000-0000-0000-000000000032'),
 ('f1000000-0000-0000-0000-000000000033'),
 ('f1000000-0000-0000-0000-000000000034'),
 ('f1000000-0000-0000-0000-000000000035'),
 ('f1000000-0000-0000-0000-000000000036'),
 ('f1000000-0000-0000-0000-000000000037'),
 ('f1000000-0000-0000-0000-000000000038'),
 ('f1000000-0000-0000-0000-000000000039'),
 ('f1000000-0000-0000-0000-00000000003a'),
 ('f1000000-0000-0000-0000-00000000003b'),
 ('f1000000-0000-0000-0000-00000000003c'),
 ('f1000000-0000-0000-0000-00000000003d'),
 ('f1000000-0000-0000-0000-00000000003e'),
 ('f1000000-0000-0000-0000-00000000003f')
) AS mm(profile_id)
JOIN profiles p ON p.id = mm.profile_id::uuid
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — Daily sketch, set by the host, active.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000003'::uuid,
        'e1000000-0000-0000-0000-000000000009'::uuid,
        'f1000000-0000-0000-0000-00000000002c'::uuid,
        true)
ON CONFLICT (circle_id, practice_id) DO NOTHING;

-- =====================================================================
-- 5. POSTS — top-level, tails 0081..00c0. Voiced to a maker vibe.
--    Per-rank: Con 3 · Agt 2 · Op 1–2 · Run 1 · ~75% Ghosts one short post.
--    ≥1 recaps the Spring Maker Market (past event f5…02); ≥1 about an
--    upcoming maker night. created_at staggered over the last ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000003'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- ---- Conduit host: Wren (3) ----
 ('f4000000-0000-0000-0000-000000000081','f1000000-0000-0000-0000-00000000002c',
   'maker night is BACK this thursday at the 101 studio 🔨 bring a work-in-progress, finished or not. show-and-tell, the screen-print station''s running, cold brew on tap. new faces especially — just walk in, we don''t bite (the lathe might).',
   2880),
 ('f4000000-0000-0000-0000-000000000082','f1000000-0000-0000-0000-00000000002c',
   'what a turnout at the spring maker market 🎉 we packed the corridor, sold out of half the booths by noon, and i watched at least three first-time makers find their people. thank you to everyone who hauled tables, ran the till, and stayed to sweep. this is the good stuff.',
   17280),
 ('f4000000-0000-0000-0000-000000000083','f1000000-0000-0000-0000-00000000002c',
   'reminder for the table: bring the piece you''re avoiding, not the one you''re proud of. the work-in-progress is where the honest conversations happen — that''s the whole point of this room.',
   8640),
 -- ---- Agents: Tobias (2), Astrid (2) ----
 ('f4000000-0000-0000-0000-000000000084','f1000000-0000-0000-0000-00000000002d',
   'screen-print sign-up for thursday is live — four slots, first come. bring your own shirt or grab a blank from me for a few bucks. fair warning: one good pull and you''ll be buying a press by friday.',
   4320),
 ('f4000000-0000-0000-0000-000000000085','f1000000-0000-0000-0000-00000000002d',
   'spring market recap from the print booth: 60-odd shirts pulled, two ruined squeegees, zero regrets. shout out to everyone who jumped behind the station when the line got long. we make a good crew. 🖨️',
   16560),
 ('f4000000-0000-0000-0000-000000000086','f1000000-0000-0000-0000-00000000002e',
   'glaze firing came out of the kiln this morning and the celadon finally behaved 🙌 bringing a few test tiles thursday for anyone curious how reduction changes the color. ask me anything, i''ve broken enough pots to know.',
   5760),
 ('f4000000-0000-0000-0000-000000000087','f1000000-0000-0000-0000-00000000002e',
   'gentle nudge to the newer makers: your first ten pieces are supposed to be rough. mine were a disaster for two years. show up, make the bad thing, learn the next one. the wheel is patient even when we''re not.',
   11520),
 -- ---- Operatives: Camille (2), Felix (1), Greta (1), Hugo (1) ----
 ('f4000000-0000-0000-0000-000000000088','f1000000-0000-0000-0000-00000000002f',
   'pulled my first full set of mugs that didn''t crack 🎉 trading a couple thursday for honest critique. be brutal — i''d rather hear it from this table than from a customer.',
   1440),
 ('f4000000-0000-0000-0000-000000000089','f1000000-0000-0000-0000-00000000002f',
   'sold out my whole shelf at the spring market and immediately panic-threw twenty more bowls that week. nothing motivates the wheel like an empty table. thanks leucadia for the push. 🏺',
   15840),
 ('f4000000-0000-0000-0000-00000000008a','f1000000-0000-0000-0000-000000000030',
   'fixing up an old open sign for the studio window — first time bending letters this small and my fingertips have opinions. should be glowing by thursday''s maker night if the transformer cooperates. ⚡',
   3600),
 ('f4000000-0000-0000-0000-00000000008b','f1000000-0000-0000-0000-000000000031',
   'finished my first coptic-bound sketchbook and i may never go back to glue. brought it to the last meet and three people wanted one made. is this a business now? asking the table.',
   7200),
 ('f4000000-0000-0000-0000-00000000008c','f1000000-0000-0000-0000-000000000032',
   'turned a salad bowl out of a chunk of monterey cypress that came down on the 101 last winter. local wood, local hands. there''s something right about that. shavings up to my knees though. 🪵',
   9360),
 -- ---- Runners (7), one each ----
 ('f4000000-0000-0000-0000-00000000008d','f1000000-0000-0000-0000-000000000033',
   'slow week on the loom but a good one. learning that the maker nights are as much about the company as the craft. bringing the half-done runner thursday for moral support.',
   2160),
 ('f4000000-0000-0000-0000-00000000008e','f1000000-0000-0000-0000-000000000034',
   'soldered a tiny brass lantern that actually holds together this time. show-and-tell is genuinely the highlight of my month, even when the thing barely works.',
   6480),
 ('f4000000-0000-0000-0000-00000000008f','f1000000-0000-0000-0000-000000000035',
   'fresh batch of indigo on the line and my hands are blue to the wrist again 🫐 will have dyed scraps to give away thursday if anyone wants to test stitching on them.',
   3960),
 ('f4000000-0000-0000-0000-000000000090','f1000000-0000-0000-0000-000000000036',
   'carved three spoons on the studio steps last meet and barely said a word — exactly the kind of quiet evening i needed. one slow cut at a time.',
   12960),
 ('f4000000-0000-0000-0000-000000000091','f1000000-0000-0000-0000-000000000037',
   'had a blast running the mosaic corner at the spring market — kids loved smashing the seconds and gluing them back into something new. saving the broken tiles for thursday, come make a mess.',
   16080),
 ('f4000000-0000-0000-0000-000000000092','f1000000-0000-0000-0000-000000000038',
   'first proper through-tenon joint that didn''t need filler this week 🙂 square corners really are my love language. happy to show the jig thursday if anyone''s fighting their miters.',
   4680),
 ('f4000000-0000-0000-0000-000000000093','f1000000-0000-0000-0000-000000000039',
   'cut my first multi-color linocut and the registration only drifted a little 😅 trading prints for advice at the next maker night — bring your worst printing horror story, i''ll trade you mine.',
   8160),
 -- ---- Ghosts: ~75% of 6 = ~4 short newcomer posts (3a,3b,3d,3e); 3c & 3f silent ----
 ('f4000000-0000-0000-0000-000000000094','f1000000-0000-0000-0000-00000000003a',
   'new here — weekend whittler, mostly making sawdust so far. saw the maker night and figured i''d stop lurking. see you thursday?',
   1080),
 ('f4000000-0000-0000-0000-000000000095','f1000000-0000-0000-0000-00000000003b',
   'just moved to leucadia and the first thing i googled was where the makers hang out. found you. excited to bring something embarrassing to show-and-tell.',
   5040),
 ('f4000000-0000-0000-0000-000000000096','f1000000-0000-0000-0000-00000000003d',
   'came to the last meet with a tote bag of mending and left with new friends and a stack of indigo scraps. low key the best night out i''ve had in months. 🪡',
   2520),
 ('f4000000-0000-0000-0000-000000000097','f1000000-0000-0000-0000-00000000003e',
   'first pot out of the kiln didn''t crack. that''s the whole post. enormous grin over here. 🏺',
   600)
) AS v(id, author_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — tails 1081..10c0. ~11 replies clustered on the liveliest
--    posts (maker-night announce 0081, market recap 0082, kiln win 0088).
--    parent_id = a top-level post above; reply UUID block.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000003'::uuid, 'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- on the maker-night announcement (0081)
 ('f4000000-0000-0000-0000-000000001081','f1000000-0000-0000-0000-00000000002f','f4000000-0000-0000-0000-000000000081',
   'in. bringing the mug seconds for the critique gauntlet 🫠',2700),
 ('f4000000-0000-0000-0000-000000001082','f1000000-0000-0000-0000-00000000003a','f4000000-0000-0000-0000-000000000081',
   'first-timer here, do i need to bring anything or just show up and lurk?',2640),
 ('f4000000-0000-0000-0000-000000001083','f1000000-0000-0000-0000-00000000002c','f4000000-0000-0000-0000-000000000081',
   'just show up! a stool and a snack is plenty. the sawdust is provided 😄',2580),
 ('f4000000-0000-0000-0000-000000001084','f1000000-0000-0000-0000-000000000030','f4000000-0000-0000-0000-000000000081',
   'the sign should be glowing by then if i don''t electrocute myself first ⚡',2520),
 -- on the spring market recap (0082)
 ('f4000000-0000-0000-0000-000000001085','f1000000-0000-0000-0000-00000000002d','f4000000-0000-0000-0000-000000000082',
   'the print booth line was unreal. exhausted and already want to do it again 🖨️',17100),
 ('f4000000-0000-0000-0000-000000001086','f1000000-0000-0000-0000-00000000002f','f4000000-0000-0000-0000-000000000082',
   'sold the whole shelf and cried a little in the parking lot. happy tears.',16980),
 ('f4000000-0000-0000-0000-000000001087','f1000000-0000-0000-0000-000000000037','f4000000-0000-0000-0000-000000000082',
   'the kids at the mosaic table made my entire spring. thank you for trusting me with a corner 🫶',16800),
 ('f4000000-0000-0000-0000-000000001088','f1000000-0000-0000-0000-00000000002e','f4000000-0000-0000-0000-000000000082',
   'twenty years of markets and this one had the best feeling of all of them. proud of this crew.',16560),
 -- on Camille's kiln win (0088)
 ('f4000000-0000-0000-0000-000000001089','f1000000-0000-0000-0000-00000000002e','f4000000-0000-0000-0000-000000000088',
   'celadon or matte white? either way, bring them — i''ll be honest but kind, promise.',1380),
 ('f4000000-0000-0000-0000-00000000108a','f1000000-0000-0000-0000-00000000003e','f4000000-0000-0000-0000-000000000088',
   'congrats!! mine cracked but yours surviving gives me hope 🏺',1320),
 ('f4000000-0000-0000-0000-00000000108b','f1000000-0000-0000-0000-000000000035','f4000000-0000-0000-0000-000000000088',
   'dibs on one of the seconds, i''ll trade you a skein of indigo yarn 🫐',1260)
) AS v(id, author_id, parent_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — f5…02 Leucadia Spring Maker Market (past, -92d 10:00).
--    Hosted by this circle's host (Wren). scope_type 'circle'.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug, starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-000000000002'::uuid,
       'f1000000-0000-0000-0000-00000000002c'::uuid,
       'f2000000-0000-0000-0000-000000000003'::uuid,
       'circle',
       'Leucadia Spring Maker Market', 'leucadia-spring-maker-market',
       ((now() - interval '92 days')::date + time '10:00')::timestamptz,
       ((now() - interval '92 days')::date + time '16:00')::timestamptz,
       '101 corridor studio, Leucadia',
       false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-000000000002'::uuid);

COMMIT;
