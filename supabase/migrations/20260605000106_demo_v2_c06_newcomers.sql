-- =====================================================================
-- Demo seed (v2) — CIRCLE 6: Encinitas Newcomers & Neighbors
-- =====================================================================
-- channel human-relating · slug encinitas-newcomers
-- circle id f2000000-…-0000000000006 · Encinitas (33.0400,-117.2870)
-- host rank ⚡ Conduit. The community's "front door" — people new to
-- town finding their people. Several members live on the far border
-- (Poway, La Mesa, San Diego, Valley Center, Del Mar) and commute in.
--
-- Roster 22 · quota Lum0/Con1/Agt3/Op5/Run7/Ghost6.
-- Profile UUID tails 68–7d · post block 0141–0180 · reply block 1141–1180.
-- Event f5…0e Newcomers Welcome BBQ (+11d 16:00, Orpheus Park).
-- Active practice e1…0008 (Gratitude journal), set_by host.
--
-- Mirrors the v1 SD template + Part B.5 schema rules (DEMO-CAST.md):
--   * circles INSERT — hub_id NULL, type 'in-person', member_cap 50,
--     status 'active', is_demo true. member_count left to the trigger.
--   * profiles — auth_user_id NULL, is_active/is_demo true. Stats inside
--     each rank's §3 band; season_challenges_complete only for Luminaries
--     (none here). avatar_url for ~75%, else NULL.
--   * memberships — volunteer_role = NULLIF(community_role,'member').
--   * posts/replies — visibility 'group', created_at = now() - random.
--   * events / circle_practices per B.4 / B.5.
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
(SELECT id FROM topical_channels WHERE slug='human-relating') AS channel_id;

-- =====================================================================
-- 1. CIRCLE
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000006', 'Encinitas Newcomers & Neighbors',
       'encinitas-newcomers', NULL::uuid, 'in-person', 50, 'active',
       'New to town? Start here. Welcome dinners, casual meetups, and the warmest "come as you are" crew in North County. We help you go from knowing nobody to having a standing Friday plan. The front door to the whole community.',
       33.0400, -117.2870, NULL, 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/encinitas-newcomers/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (22) — tails 68–7d.
--    Roles: 1 host (68), 2 crew (69,6a), 1 guide (6b), rest member.
--    Ranks: Con×1 (68), Agt×3 (69,6a,6b), Op×5, Run×7, Ghost×6.
--    Home cities spread across the far border (Poway, La Mesa, San Diego,
--    Valley Center, Del Mar) plus the coastal core.
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
       m.rank::season_rank_enum, m.szaps, m.lzaps, m.gems, m.cstreak, m.lstreak,
       m.achiev, false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, name, handle, role, rank, season_zaps, lifetime_zaps, gems, cur_streak, longest_streak, achiev, avatar?, minutes-since-seen
 -- ---- HOST (Conduit) ----
 ('f1000000-0000-0000-0000-000000000068','Delphine Carraway','delphine.welcomes','host','conduit',
   1740,5200,1080,21,24,18,true,9,
   'Moved here three years ago knowing exactly nobody. Now I host the welcome dinners so no one else has to do it alone.'),
 -- ---- CREW (Agent ×2) ----
 ('f1000000-0000-0000-0000-000000000069','Marcus Okonjo','marcus.newneighbor','crew','agent',
   1120,2900,560,14,16,13,true,35,
   'Name-tag guy and chief introducer. Tell me one true thing about you and I''ll find you three people who get it.'),
 ('f1000000-0000-0000-0000-00000000006a','Priya Venkat','priya.frontdoor','crew','agent',
   980,2600,520,12,15,12,true,60,
   'I run the RSVP list and the "you should meet so-and-so" thread. Commute in from Poway, worth every mile.'),
 -- ---- GUIDE (Agent) ----
 ('f1000000-0000-0000-0000-00000000006b','Roland Eskildsen','roland.guides','guide','agent',
   860,2300,480,11,14,11,true,180,
   'Lived in six towns in ten years — I know exactly how lonely a new zip code feels. Happy to walk you in.'),
 -- ---- MEMBERS · Operative ×5 ----
 ('f1000000-0000-0000-0000-00000000006c','Saoirse Mbeki','saoirse.settles','member','operative',
   680,1700,360,12,13,10,true,25,
   'Came for one welcome dinner, accidentally found my whole friend group. Now I just keep showing up.'),
 ('f1000000-0000-0000-0000-00000000006d','Ezra Lindqvist','ezra.fromdelmar','member','operative',
   520,1300,300,9,11,9,false,140,
   'Del Mar transplant via Chicago. Still adjusting to people being this friendly. It''s growing on me.'),
 ('f1000000-0000-0000-0000-00000000006e','Tamsin Boateng','tamsin.lamesa','member','operative',
   470,1150,260,8,10,8,true,310,
   'Drive up from La Mesa for these dinners. Worth the 405 every time. The hummus alone, honestly.'),
 ('f1000000-0000-0000-0000-00000000006f','Hugo Verbeek','hugo.justlanded','member','operative',
   410,1020,230,7,9,8,true,18,
   'Six weeks in town and already over-committed to three standing plans. No notes, would move again.'),
 ('f1000000-0000-0000-0000-000000000070','Aaliyah Rios','aaliyah.connects','member','operative',
   350,900,200,6,8,7,false,420,
   'San Diego proper, but the warmth up here pulled me north on weekends. Found my people in this room.'),
 -- ---- MEMBERS · Runner ×7 ----
 ('f1000000-0000-0000-0000-000000000071','Bram Sólkjær','bram.newintown','member','runner',
   270,720,140,7,8,6,true,30,
   'Three weeks ago I knew the barista and nobody else. Now I have a hiking invite and a board-game night. Wild.'),
 ('f1000000-0000-0000-0000-000000000072','Noor Hashmi','noor.sayshi','member','runner',
   220,600,120,5,7,5,true,90,
   'Carlsbad newcomer, professional introvert, slowly becoming a regular. Small wins count here.'),
 ('f1000000-0000-0000-0000-000000000073','Caspian Ferreira','caspian.poway','member','runner',
   190,520,100,4,6,5,false,260,
   'Commute in from Poway. The drive home after a good dinner is my favorite quiet of the week.'),
 ('f1000000-0000-0000-0000-000000000074','Imani Wexler','imani.warmsup','member','runner',
   160,440,90,4,6,4,true,15,
   'Moved for a job, stayed for this crew. Encinitas, you sneaky wonderful town.'),
 ('f1000000-0000-0000-0000-000000000075','Lior Abramsen','lior.valleycenter','member','runner',
   130,360,75,3,5,4,true,75,
   'Valley Center is a haul but I plan my whole month around the welcome dinners. Friends are worth the gas.'),
 ('f1000000-0000-0000-0000-000000000076','Maren Sørbø','maren.findshome','member','runner',
   115,310,65,3,4,4,false,520,
   'Solana Beach, fresh off the boat from Oslo. The sunshine is a personality adjustment but I''m thriving.'),
 ('f1000000-0000-0000-0000-000000000077','Desmond Achebe','desmond.brandnew','member','runner',
   100,280,55,2,4,4,true,40,
   'Leucadia, one month in. Showed up sweaty and nervous to my first meetup and left with a group chat.'),
 -- ---- MEMBERS · Ghost ×6 (≈75% post one short intro, ~25% silent) ----
 ('f1000000-0000-0000-0000-000000000078','Wren Calloway','wren.justarrived','member','ghost',
   80,260,48,2,3,3,true,55,
   'Just landed from Portland. Hi, I''m Wren, I make terrible small talk but I''m trying.'),
 ('f1000000-0000-0000-0000-000000000079','Tariq Solberg','tariq.newhere','member','ghost',
   60,200,36,1,2,2,true,210,
   'San Marcos newcomer lurking up the energy to actually attend. This is my warm-up.'),
 ('f1000000-0000-0000-0000-00000000007a','Esme Drăgan','esme.firstweek','member','ghost',
   45,150,28,1,2,2,false,640,
   'Week one in Cardiff. Everything is beautiful and I know zero humans. Working on it.'),
 ('f1000000-0000-0000-0000-00000000007b','Felix Oyelaran','felix.shy','member','ghost',
   30,110,20,0,1,2,true,1880,
   'Oceanside, brand new, deeply shy. Saying hi here so future-me has to follow through.'),
 -- silent ghosts (membership + reactions only, no posts)
 ('f1000000-0000-0000-0000-00000000007c','Ingrid Halloran','ingrid.lurks','member','ghost',
   22,80,14,0,1,1,false,4320,
   'Rancho Bernardo. Reading every thread, building up the nerve. One day I''ll RSVP for real.'),
 ('f1000000-0000-0000-0000-00000000007d','Dmitri Falk','dmitri.maybe','member','ghost',
   12,45,8,0,0,1,false,7200,
   'Vista, just moved, mostly watching. Promise I''ll come to a dinner eventually.')
) AS m(id,display_name,handle,role,rank,szaps,lzaps,gems,cstreak,lstreak,achiev,avatar,bio,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — one row per member → this circle.
--    volunteer_role mirrors community_role (members get NULL).
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-000000000006'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id BETWEEN 'f1000000-0000-0000-0000-000000000068'::uuid
              AND 'f1000000-0000-0000-0000-00000000007d'::uuid
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — host sets Gratitude journal (e1…0008).
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000006',
        'e1000000-0000-0000-0000-000000000008',
        'f1000000-0000-0000-0000-000000000068', true)
ON CONFLICT (circle_id) WHERE active DO NOTHING;

-- =====================================================================
-- 5. POSTS (top-level) — block 0141–0180.
--    Con 3 · Agt 2 each · Op 1–2 · Run 1 · ~75% ghosts one short intro.
--    Warm, welcoming, lower-case-casual voice. ≥1 announces the BBQ.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000006'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_days || ' days')::interval - (v.age_hrs || ' hours')::interval,
       true
FROM (VALUES
 -- ---- HOST · Delphine (Conduit) ×3, incl. the BBQ announcement ----
 ('f4000000-0000-0000-0000-000000000141','f1000000-0000-0000-0000-000000000068',
   'big one for the calendar: our Newcomers Welcome BBQ is happening at Orpheus Park in two weeks — Saturday at 4pm 🍔 if you''ve been lurking, THIS is the dinner to come to. burgers, name tags, zero pressure. just show up and i''ll personally make sure you don''t stand alone. bring a friend or come solo, both are perfect.',
   13,4),
 ('f4000000-0000-0000-0000-000000000142','f1000000-0000-0000-0000-000000000068',
   'a thing i tell every new person: you are not behind. everyone in this circle was the nervous new face once, including me. you don''t have to be interesting or have your life together — you just have to come say hi. that''s the whole bar. 🤍',
   9,6),
 ('f4000000-0000-0000-0000-000000000143','f1000000-0000-0000-0000-000000000068',
   'the gratitude journal we''re running this month is doing something to this group, i swear. so many of you wrote "found my people" this week and i am not crying, you''re crying. keep going, even one line counts.',
   3,2),
 -- ---- CREW · Marcus (Agent) ×2 ----
 ('f4000000-0000-0000-0000-000000000144','f1000000-0000-0000-0000-000000000069',
   'name-tag duty is my favorite job in this whole community. if you''re coming to the BBQ, find me first — i''ll get you a tag and walk you over to at least three people you''ll actually click with. that''s the promise. 🙌',
   8,3),
 ('f4000000-0000-0000-0000-000000000145','f1000000-0000-0000-0000-000000000069',
   'reminder for anyone hovering over the rsvp button: nobody is checking if you''re "cool enough" to be here. we are genuinely just happy you found the door. press the button.',
   5,7),
 -- ---- CREW · Priya (Agent) ×2 ----
 ('f4000000-0000-0000-0000-00000000014a','f1000000-0000-0000-0000-00000000006a',
   'rsvp list for the welcome BBQ is open and already filling 🎉 i drive in from poway for these so trust me, distance is not an excuse. drop your name and one thing you''re into and i''ll start matchmaking the intros now.',
   7,1),
 ('f4000000-0000-0000-0000-00000000014b','f1000000-0000-0000-0000-00000000006a',
   'shoutout to everyone who came to the last dinner — watched four total strangers turn into a hiking group by dessert. this is the entire point. you bring the nerves, we bring the people.',
   11,5),
 -- ---- GUIDE · Roland (Agent) ×2 ----
 ('f4000000-0000-0000-0000-00000000014c','f1000000-0000-0000-0000-00000000006b',
   'six towns in ten years taught me one thing: the loneliness of a new place ends the day you let one person know you exist. if showing up feels like too much, dm me and i''ll meet you at the gate so you''re not walking in cold. 🚪',
   10,3),
 ('f4000000-0000-0000-0000-00000000014d','f1000000-0000-0000-0000-00000000006b',
   'little tip for newcomers: you don''t need a great opener. "hi, i just moved here and i know nobody" is a magic phrase in this circle. people will adopt you on the spot. tested it many times.',
   6,8),
 -- ---- MEMBERS · Operative (1–2 each) ----
 ('f4000000-0000-0000-0000-000000000150','f1000000-0000-0000-0000-00000000006c',
   'came to exactly ONE welcome dinner six months ago and somehow it rewired my whole social life. saoirse, party of one, now has a standing friday crew. if i can do it from a dead-cold start, anyone can.',
   12,2),
 ('f4000000-0000-0000-0000-000000000151','f1000000-0000-0000-0000-00000000006c',
   'already on the BBQ list and bringing a peach cobbler that will change your standards. fair warning. 🍑',
   4,9),
 ('f4000000-0000-0000-0000-000000000152','f1000000-0000-0000-0000-00000000006d',
   'del mar transplant, ex-chicagoan, still mildly suspicious of how nice everyone is here. three months in and i think it''s just... real? anyway, see you all at the BBQ.',
   9,1),
 ('f4000000-0000-0000-0000-000000000153','f1000000-0000-0000-0000-00000000006e',
   'driving up from la mesa again this weekend. people ask why i bother with the commute and the answer is: i tried making friends as an adult the normal way and it was bleak. this circle just works. 🫶',
   8,5),
 ('f4000000-0000-0000-0000-000000000154','f1000000-0000-0000-0000-00000000006f',
   'six weeks in encinitas and i have officially over-booked my calendar with you delightful people. RSVP''d for the BBQ before i even finished reading the post. no regrets.',
   5,3),
 ('f4000000-0000-0000-0000-000000000155','f1000000-0000-0000-0000-000000000070',
   'technically a san diego person but you all keep pulling me north on weekends. found more genuine connection in this room than five years of city happy hours. that says something.',
   10,6),
 -- ---- MEMBERS · Runner (1 each) ----
 ('f4000000-0000-0000-0000-000000000158','f1000000-0000-0000-0000-000000000071',
   'three weeks ago i knew my barista and literally no one else. today i have a hiking invite AND a board-game night on the calendar. i don''t fully understand how but i''m not asking questions. 🥾',
   7,4),
 ('f4000000-0000-0000-0000-000000000159','f1000000-0000-0000-0000-000000000072',
   'professional introvert checking in. attended my first meetup and survived. baby steps but they count, right? will attempt the BBQ next. probably. maybe. yes.',
   6,2),
 ('f4000000-0000-0000-0000-00000000015a','f1000000-0000-0000-0000-000000000073',
   'poway commuter here. the quiet drive home after a good dinner has somehow become my favorite part of the week. weird flex but it''s mine.',
   9,7),
 ('f4000000-0000-0000-0000-00000000015b','f1000000-0000-0000-0000-000000000074',
   'moved for a job, fully expected to be lonely for a year, and instead i found this crew in month one. encinitas, you sneaky wonderful place. signed up for the BBQ obviously.',
   4,5),
 ('f4000000-0000-0000-0000-00000000015c','f1000000-0000-0000-0000-000000000075',
   'valley center is a real haul but i build my whole month around the welcome dinners now. friends > gas money, every time. see you at orpheus park. 🚗',
   8,1),
 ('f4000000-0000-0000-0000-00000000015d','f1000000-0000-0000-0000-000000000076',
   'fresh off the plane from oslo to solana beach. the relentless sunshine is genuinely an adjustment but this group has made the soft landing i didn''t know to hope for. takk. 🌞',
   11,3),
 ('f4000000-0000-0000-0000-00000000015e','f1000000-0000-0000-0000-000000000077',
   'leucadia, one month in. showed up to my first meetup sweaty and nervous and left in a group chat that''s already too active. exactly the problem i wanted. 💬',
   5,8),
 -- ---- MEMBERS · Ghost (≈75% one short newcomer intro; 7c & 7d stay silent) ----
 ('f4000000-0000-0000-0000-000000000160','f1000000-0000-0000-0000-000000000078',
   'hi, i''m wren, just landed from portland. i make genuinely terrible small talk but i''m here and i''m trying. that counts for something? 👋',
   6,4),
 ('f4000000-0000-0000-0000-000000000161','f1000000-0000-0000-0000-000000000079',
   'san marcos newcomer, lurking up the courage to actually show up to something. consider this my official warm-up post. hi everyone.',
   10,2),
 ('f4000000-0000-0000-0000-000000000162','f1000000-0000-0000-0000-00000000007a',
   'week one in cardiff. everything is gorgeous and i know exactly zero people. posting this so it''s real now. esme, reporting in. 🌊',
   3,6),
 ('f4000000-0000-0000-0000-000000000163','f1000000-0000-0000-0000-00000000007b',
   'oceanside, brand new, painfully shy. saying hi here mostly so future-me is on the hook to follow through. okay. done. that was hard.',
   8,5)
) AS v(id, author_id, body, age_days, age_hrs)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — block 1141–1180. ~12 replies, clustered on the BBQ
--    announcement (…0141), the "you are not behind" post (…0142), and the
--    warm intro posts. Lots of "welcome!" energy.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000006'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_days || ' days')::interval - (v.age_hrs || ' hours')::interval,
       true
FROM (VALUES
 -- on the BBQ announcement (…0141)
 ('f4000000-0000-0000-0000-000000001141','f1000000-0000-0000-0000-000000000069','f4000000-0000-0000-0000-000000000141',
   'name tags are stocked and ready. consider yourself personally invited, lurkers. 🍔',13,2),
 ('f4000000-0000-0000-0000-000000001142','f1000000-0000-0000-0000-00000000006c','f4000000-0000-0000-0000-000000000141',
   'cobbler is already on the meal plan. see you at orpheus park!',12,8),
 ('f4000000-0000-0000-0000-000000001143','f1000000-0000-0000-0000-00000000006f','f4000000-0000-0000-0000-000000000141',
   'RSVP''d in 0.2 seconds. first BBQ as a local, let''s gooo.',11,5),
 ('f4000000-0000-0000-0000-000000001144','f1000000-0000-0000-0000-000000000078','f4000000-0000-0000-0000-000000000141',
   'okay this is the nudge i needed. wren is coming. terrified but coming. 👋',10,1),
 -- on "you are not behind" (…0142)
 ('f4000000-0000-0000-0000-000000001145','f1000000-0000-0000-0000-000000000072','f4000000-0000-0000-0000-000000000142',
   'needed to read this today. thank you, delphine. 🥹',9,3),
 ('f4000000-0000-0000-0000-000000001146','f1000000-0000-0000-0000-00000000007a','f4000000-0000-0000-0000-000000000142',
   'saving this. week one me really needed it.',8,7),
 ('f4000000-0000-0000-0000-000000001147','f1000000-0000-0000-0000-00000000006b','f4000000-0000-0000-0000-000000000142',
   'this is the whole circle in one post. exactly the bar, no higher.',9,1),
 -- on Roland's "meet you at the gate" (…014c)
 ('f4000000-0000-0000-0000-000000001148','f1000000-0000-0000-0000-000000000079','f4000000-0000-0000-0000-00000000014c',
   'might take you up on the gate offer, not gonna lie. this is the kind of thing that gets a shy person through the door.',10,2),
 ('f4000000-0000-0000-0000-000000001149','f1000000-0000-0000-0000-00000000006a','f4000000-0000-0000-0000-00000000014c',
   'roland does this and it WORKS. watched him walk in three nervous people last month.',9,6),
 -- welcomes on the ghost intros
 ('f4000000-0000-0000-0000-00000000114a','f1000000-0000-0000-0000-000000000068','f4000000-0000-0000-0000-000000000160',
   'welcome wren!! terrible small talk is the official house specialty, you''ll fit right in. 🤍',6,1),
 ('f4000000-0000-0000-0000-00000000114b','f1000000-0000-0000-0000-000000000074','f4000000-0000-0000-0000-000000000162',
   'welcome to cardiff esme! the zero-people thing is extremely temporary around here. come to the BBQ.',3,2),
 ('f4000000-0000-0000-0000-00000000114c','f1000000-0000-0000-0000-000000000069','f4000000-0000-0000-0000-000000000163',
   'felix you just did the hard part. proud of you. name tag with your name on it, ready and waiting.',8,3),
 ('f4000000-0000-0000-0000-00000000114d','f1000000-0000-0000-0000-00000000006a','f4000000-0000-0000-0000-000000000161',
   'warm-up accepted, tariq. san marcos crew is bigger than you think — i''ll intro you at the BBQ. 🙌',10,1)
) AS v(id, author_id, parent_id, body, age_days, age_hrs)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENT — f5…0e Newcomers Welcome BBQ (+11d 16:00, Orpheus Park).
--    Hosted by the circle host (Delphine, …068).
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT 'f5000000-0000-0000-0000-00000000000e',
       'f1000000-0000-0000-0000-000000000068',
       'f2000000-0000-0000-0000-000000000006', 'circle',
       'Newcomers Welcome BBQ', 'newcomers-welcome-bbq',
       ((now() + interval '11 days')::date + time '16:00')::timestamptz,
       ((now() + interval '11 days')::date + time '19:00')::timestamptz,
       'Orpheus Park, Encinitas', false, true
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = 'f5000000-0000-0000-0000-00000000000e'::uuid);

COMMIT;
