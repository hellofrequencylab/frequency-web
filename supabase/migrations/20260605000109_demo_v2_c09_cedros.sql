-- =====================================================================
-- Demo seed (v2) — CIRCLE 9: Cedros Creatives
-- =====================================================================
-- Solana Beach · Cedros Design District (creative channel). 20 primary
-- members, host = ⚡ Conduit. Designers, photographers, shop owners.
-- All rows is_demo = true; deterministic UUIDs + ON CONFLICT DO NOTHING.
--
-- Allocation (Part B.2): roster 20 = Lum 0 / Con 1 / Agt 2 / Op 4 / Run 7 / Ghost 6.
-- community_role (separate from rank): 1 host (the Conduit), 2 crew, 1 guide,
-- rest member. Profile tails a7–ba; posts 0201–0240; replies 1201–1240.
-- Event f5…07 (Cedros First-Friday Art Walk, past, -21d). Active practice
-- e1000000-…-00000000000a, set_by host.
--
-- Schema column lists copied verbatim from the SD template + Part B.5.
-- member_count is left to the membership trigger (NOT hand-set).
-- =====================================================================

BEGIN;

-- Resolve shared geography once (mirror SD template).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT COALESCE(
  (SELECT id FROM nexus_regions WHERE name='North County' ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE name='San Diego'    ORDER BY depth LIMIT 1),
  (SELECT id FROM nexus_regions WHERE depth=0 ORDER BY name LIMIT 1)
) AS region_id,
(SELECT id FROM topical_channels WHERE slug='creative') AS channel_id;

-- =====================================================================
-- 1. CIRCLE
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000009'::uuid,
       'Cedros Creatives', 'cedros-creatives',
       NULL::uuid, 'in-person', 50, 'active',
       'Designers, photographers, and shop owners in the Cedros Design District. Coffee walks, portfolio nights, and collabs across the lane.',
       32.9912, -117.2713, 'Cedros Design District', 'Solana Beach',
       ctx.channel_id,
       'https://picsum.photos/seed/cedros-creatives/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (20)  — tails a7–ba.
--    Quota: Con 1 (host) / Agt 2 / Op 4 / Run 7 / Ghost 6. No Luminary.
--    Roles: host (the Conduit), 2 crew, 1 guide, rest member.
--    Stats sit inside the §3 band for the rank; zaps<=lifetime; longest>=current.
--    season_challenges_complete = false for all (no Luminary here).
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
       m.zaps, m.lifetime, m.gems, m.streak, m.longest, m.achiev,
       false,
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank, zaps, lifetime, gems, streak, longest, achiev, mins-since-seen
 -- ---- Conduit / host ----
 ('f1000000-0000-0000-0000-0000000000a7','Vera Solana','vera.cedros','host','Studio owner on Cedros. I host portfolio nights and pour the wine. The lane is my favorite collaborator.',true,'conduit',1820,5400,1080,24,29,19,11),
 -- ---- Agents / crew ----
 ('f1000000-0000-0000-0000-0000000000a8','Idris Calder','idris.cedros','crew','Photographer documenting the design district. Tag me, I''ll shoot it — golden hour on the lane is unbeatable.',true,'agent',1180,3100,610,15,18,13,28),
 ('f1000000-0000-0000-0000-0000000000a9','Juno Marsh','juno.cedros','crew','Illustrator. I run the sign-up sheet for portfolio nights and the coffee-walk text thread.',true,'agent',920,2400,520,12,16,12,46),
 -- ---- Operatives ----
 ('f1000000-0000-0000-0000-0000000000aa','Cleo Bautista','cleo.cedros','guide','Textile designer, twenty years in. Bring me your half-finished thing and I''ll help you find the next stitch.',true,'operative',690,1700,360,11,14,9,90),
 ('f1000000-0000-0000-0000-0000000000ab','Hassan Reyes','hassan.cedros','member','Brand designer between clients. Here for the critique nights and the people who get the work.',true,'operative',520,1300,280,8,12,8,150),
 ('f1000000-0000-0000-0000-0000000000ac','Margot Lindqvist','margot.cedros','member','Ceramicist with a shop on the corner. I trade mugs for honest feedback every single time.',true,'operative',440,1100,220,7,10,8,210),
 ('f1000000-0000-0000-0000-0000000000ad','Desmond Okoro','desmond.cedros','member','Furniture maker. Most of what I know I learned on this block, so I try to pass it back.',false,'operative',360,940,180,6,9,7,1200),
 -- ---- Runners ----
 ('f1000000-0000-0000-0000-0000000000ae','Pilar Vance','pilar.cedros','member','Stationery and small-batch print. The coffee walks unblock me faster than any deadline.',true,'runner',260,720,130,6,8,6,18),
 ('f1000000-0000-0000-0000-0000000000af','Theo Ng','theo.cedros','member','Motion designer hiding in a design district. Found my critique crew on Cedros.',true,'runner',230,640,110,5,7,5,95),
 ('f1000000-0000-0000-0000-0000000000b0','Saffron Hale','saffron.cedros','member','Surface pattern designer. I show up for the wine, stay for the brutal honest feedback.',true,'runner',200,560,100,4,6,5,260),
 ('f1000000-0000-0000-0000-0000000000b1','Bruno Adeyemi','bruno.cedros','member','Sign painter keeping a dying craft alive on the lane. Hand-lettering is meditation.',false,'runner',170,480,85,4,6,5,640),
 ('f1000000-0000-0000-0000-0000000000b2','Anneke Voss','anneke.cedros','member','Jewelry maker with a torch and too many ideas. Portfolio nights keep me honest.',true,'runner',150,420,75,3,5,4,12),
 ('f1000000-0000-0000-0000-0000000000b3','Rashida Kemp','rashida.cedros','member','Wedding photographer. The lane sent me my last three clients. Community over algorithms.',true,'runner',130,360,65,3,5,4,300),
 ('f1000000-0000-0000-0000-0000000000b4','Wendel Pruitt','wendel.cedros','member','Woodblock printmaker, slow and stubborn. I like a critique that makes me re-cut a plate.',false,'runner',110,320,55,2,4,4,1440),
 -- ---- Ghosts ----
 ('f1000000-0000-0000-0000-0000000000b5','Iris Bellweather','iris.cedros','member','Just opened a tiny studio off the lane. Still figuring out where everyone gets coffee.',true,'ghost',85,260,48,2,3,3,30),
 ('f1000000-0000-0000-0000-0000000000b6','Caspian Vue','caspian.cedros','member','Freelance UX designer who needed humans, not Slack. Lurked a month, finally showed up.',true,'ghost',65,200,36,1,3,2,180),
 ('f1000000-0000-0000-0000-0000000000b7','Lena Fairmont','lena.cedros','member','New to Solana Beach. Letterpress nerd hoping to find a press to borrow.',false,'ghost',50,150,28,1,2,2,2880),
 ('f1000000-0000-0000-0000-0000000000b8','Otto Brandeis','otto.cedros','member','Graphic designer, day-one curious. The portfolio-night energy talked me into joining.',true,'ghost',38,110,20,1,2,2,9),
 ('f1000000-0000-0000-0000-0000000000b9','Sable Quintero','sable.cedros','member','Muralist between commissions. Want to paint something for the district someday.',true,'ghost',28,80,15,0,1,1,4320),
 ('f1000000-0000-0000-0000-0000000000ba','Niall Forsythe','niall.cedros','member','Bookbinder who heard the maker crowd here is the real deal. Here to listen first.',false,'ghost',20,60,12,0,1,1,5760)
) AS m(id,display_name,handle,role,bio,avatar,rank,zaps,lifetime,gems,streak,longest,achiev,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role
--    (members -> NULL). One row per member into this circle. member_count
--    maintained by the trigger.
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT mm.profile_id::uuid, 'f2000000-0000-0000-0000-000000000009'::uuid,
       'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM (VALUES
 ('f1000000-0000-0000-0000-0000000000a7'),
 ('f1000000-0000-0000-0000-0000000000a8'),
 ('f1000000-0000-0000-0000-0000000000a9'),
 ('f1000000-0000-0000-0000-0000000000aa'),
 ('f1000000-0000-0000-0000-0000000000ab'),
 ('f1000000-0000-0000-0000-0000000000ac'),
 ('f1000000-0000-0000-0000-0000000000ad'),
 ('f1000000-0000-0000-0000-0000000000ae'),
 ('f1000000-0000-0000-0000-0000000000af'),
 ('f1000000-0000-0000-0000-0000000000b0'),
 ('f1000000-0000-0000-0000-0000000000b1'),
 ('f1000000-0000-0000-0000-0000000000b2'),
 ('f1000000-0000-0000-0000-0000000000b3'),
 ('f1000000-0000-0000-0000-0000000000b4'),
 ('f1000000-0000-0000-0000-0000000000b5'),
 ('f1000000-0000-0000-0000-0000000000b6'),
 ('f1000000-0000-0000-0000-0000000000b7'),
 ('f1000000-0000-0000-0000-0000000000b8'),
 ('f1000000-0000-0000-0000-0000000000b9'),
 ('f1000000-0000-0000-0000-0000000000ba')
) AS mm(profile_id)
JOIN profiles p ON p.id = mm.profile_id::uuid
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active practice e1…000a, set_by host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000009'::uuid,
        'e1000000-0000-0000-0000-00000000000a'::uuid,
        'f1000000-0000-0000-0000-0000000000a7'::uuid,
        true)
ON CONFLICT (circle_id, practice_id) DO NOTHING;

-- =====================================================================
-- 5. POSTS — per-rank cadence (Con 3, Agt 2, Op 1–2, Run 1, ~75% Ghosts
--    one short newcomer post, ~25% silent). Block 0201–0240.
--    >=1 recap of the Cedros First-Friday Art Walk (past); >=1 about an
--    upcoming portfolio night.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000009'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.days_ago || ' days')::interval, true
FROM (VALUES
 -- ---- Host (Conduit) ×3 — incl. upcoming portfolio night + Art Walk recap ----
 ('f4000000-0000-0000-0000-000000000201','f1000000-0000-0000-0000-0000000000a7',
   'Portfolio night at the studio next Tuesday! 🎨 Bring six pieces and a thick skin — kind, useful critique only, wine''s on me. This block has launched more collabs than any conference I''ve been to. New folks especially welcome.','5'),
 ('f4000000-0000-0000-0000-000000000202','f1000000-0000-0000-0000-0000000000a7',
   'What a First-Friday Art Walk. 🥹 The lane was packed, every studio door was open, and I watched three different collabs spark over a single table of prints. Thank you to everyone who showed up and made Cedros feel like Cedros. Recap photos coming this week.','19'),
 ('f4000000-0000-0000-0000-000000000203','f1000000-0000-0000-0000-0000000000a7',
   'Reminder for new members: the coffee walk is the secret handshake. Tuesday mornings, we loop the design district, pop into a couple shops, and somehow everyone leaves with a new collaborator. No agenda, just the lane.','11'),
 -- ---- Agents (crew) ×2 each ----
 ('f4000000-0000-0000-0000-000000000204','f1000000-0000-0000-0000-0000000000a8',
   'First-Friday photos are up! 📷 I shot the whole walk — open studios, the print table, that impromptu street portrait line. Tag yourself, grab anything you want for your portfolio, no charge for the crew.','17'),
 ('f4000000-0000-0000-0000-000000000205','f1000000-0000-0000-0000-0000000000a8',
   'Doing a free headshot round during Tuesday''s portfolio night — natural light by the roll-up door, ten minutes each, no pressure. Reply here and I''ll put you on the list.','4'),
 ('f4000000-0000-0000-0000-000000000206','f1000000-0000-0000-0000-0000000000a9',
   'Sign-up sheet for Tuesday''s portfolio night is live — six slots for full critiques, drop-ins welcome for the rest. Bring the work you''re nervous about, not the safe stuff. That''s where the good notes happen.','6'),
 ('f4000000-0000-0000-0000-000000000207','f1000000-0000-0000-0000-0000000000a9',
   'Started an illustration after the Art Walk that I''d been putting off for a year. Something about seeing everyone''s work in one room un-stuck me completely. The lane does that.','16'),
 -- ---- Operatives (guide + members) ×1–2 ----
 ('f4000000-0000-0000-0000-000000000208','f1000000-0000-0000-0000-0000000000aa',
   'For anyone bringing work Tuesday: bring the piece you''re avoiding, not the one you''re proud of. Twenty years in and the work-in-progress is still where the real conversation lives. Happy to dig in with you.','7'),
 ('f4000000-0000-0000-0000-000000000209','f1000000-0000-0000-0000-0000000000aa',
   'Pulled a new run of woven samples off the loom and they actually behaved this time. Trading a couple for honest critique at portfolio night. Be brutal, that''s how they get better.','13'),
 ('f4000000-0000-0000-0000-000000000210','f1000000-0000-0000-0000-0000000000ab',
   'Met a textile designer at the Art Walk and we''re already roughing out a brand-meets-pattern collab. This happened because we both walked thirty feet down the same lane. Cedros magic is real.','18'),
 ('f4000000-0000-0000-0000-000000000211','f1000000-0000-0000-0000-0000000000ac',
   'Bringing a fresh batch of glazed mugs to portfolio night — first dibs to whoever gives me the most useful note. Honest feedback is worth more than the clay.','9'),
 ('f4000000-0000-0000-0000-000000000212','f1000000-0000-0000-0000-0000000000ad',
   'Finished a walnut bench that''s been on my workbench since spring. The makers on this lane kept me from quitting it twice. Will have it at the shop if anyone wants to sit and judge the joinery.','22'),
 -- ---- Runners ×1 each (7) ----
 ('f4000000-0000-0000-0000-000000000213','f1000000-0000-0000-0000-0000000000ae',
   'The Tuesday coffee walk unblocked a whole stationery line for me last week. I came in stuck and left with three ideas and a new printer contact. Still buzzing.','3'),
 ('f4000000-0000-0000-0000-000000000214','f1000000-0000-0000-0000-0000000000af',
   'First-Friday was my first proper event with you all and I left with two collaborators and zero regrets. Looping in for Tuesday''s portfolio night for sure.','19'),
 ('f4000000-0000-0000-0000-000000000215','f1000000-0000-0000-0000-0000000000b0',
   'Bringing surface patterns Tuesday that I''m genuinely unsure about — exactly why I''m bringing them. Wine helps, but the honest feedback is the real reason I keep showing up.','4'),
 ('f4000000-0000-0000-0000-000000000216','f1000000-0000-0000-0000-0000000000b1',
   'Hand-lettered a new sign for one of the shops on the lane this week. There''s nothing like watching paint go down slow. If anyone wants to learn the basics, grab me at the next walk.','8'),
 ('f4000000-0000-0000-0000-000000000217','f1000000-0000-0000-0000-0000000000b2',
   'Set up my torch station at the last Art Walk and three people stopped to watch me solder. Made two new friends and sold a pair of earrings. Portfolio night, I''m coming for the critique next.','20'),
 ('f4000000-0000-0000-0000-000000000218','f1000000-0000-0000-0000-0000000000b3',
   'The lane sent me two booking inquiries after First-Friday. Community over algorithms, every time. Bringing prints to portfolio night to get some honest eyes on my edit.','17'),
 ('f4000000-0000-0000-0000-000000000219','f1000000-0000-0000-0000-0000000000b4',
   'Re-cut a woodblock three times after the last critique and the final pull was worth every chip. This is the only crew that makes me redo things and I''m grateful for it.','10'),
 -- ---- Ghosts: ~75% (5 of 6) one short newcomer post; 1 silent (Niall, …ba) ----
 ('f4000000-0000-0000-0000-000000000220','f1000000-0000-0000-0000-0000000000b5',
   'New here — just opened a tiny studio off the lane. Still figuring out where everyone gets coffee, but the welcome has been lovely. 👋','6'),
 ('f4000000-0000-0000-0000-000000000221','f1000000-0000-0000-0000-0000000000b6',
   'Lurked for a month, finally introducing myself. Freelance UX, badly in need of humans instead of Slack. See you Tuesday.','5'),
 ('f4000000-0000-0000-0000-000000000222','f1000000-0000-0000-0000-0000000000b7',
   'Hi all — new to Solana Beach, letterpress nerd hoping to find a press to borrow somewhere on the lane. Point me in a direction?','2'),
 ('f4000000-0000-0000-0000-000000000223','f1000000-0000-0000-0000-0000000000b8',
   'The portfolio-night energy on this thread talked me into joining. Graphic designer, day-one nervous, but I''ll bring something Tuesday. 🙂','1'),
 ('f4000000-0000-0000-0000-000000000224','f1000000-0000-0000-0000-0000000000b9',
   'Muralist here, between commissions. Would love to paint something for the district one day — until then, just happy to be in the room.','4')
) AS v(id, author_id, body, days_ago)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 6. REPLIES — 8–14, clustered on the liveliest posts (Art Walk recap 0202,
--    portfolio night 0201, photos 0204, sign-up 0206). Block 1201–1240.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000009'::uuid, 'group'::post_visibility, v.body,
       now() - (v.days_ago || ' days')::interval, true
FROM (VALUES
 -- on the Art Walk recap (0202)
 ('f4000000-0000-0000-0000-000000001201','f1000000-0000-0000-0000-0000000000a9','f4000000-0000-0000-0000-000000000202',
   'Best one yet. The print table at the corner was a non-stop crowd all night.','18'),
 ('f4000000-0000-0000-0000-000000001202','f1000000-0000-0000-0000-0000000000ab','f4000000-0000-0000-0000-000000000202',
   'Can confirm — I left with a collaborator I''d never have met online. Thank you for hosting.','18'),
 ('f4000000-0000-0000-0000-000000001203','f1000000-0000-0000-0000-0000000000b3','f4000000-0000-0000-0000-000000000202',
   'Two booking inquiries from one night. The lane delivers. 🙏','17'),
 ('f4000000-0000-0000-0000-000000001204','f1000000-0000-0000-0000-0000000000b8','f4000000-0000-0000-0000-000000000202',
   'Came as a stranger, left feeling like a regular. This is exactly why I joined.','17'),
 -- on the portfolio night announcement (0201)
 ('f4000000-0000-0000-0000-000000001205','f1000000-0000-0000-0000-0000000000aa','f4000000-0000-0000-0000-000000000201',
   'In. Bringing the woven samples I''m unsure about — perfect crowd to be unsure in front of.','5'),
 ('f4000000-0000-0000-0000-000000001206','f1000000-0000-0000-0000-0000000000af','f4000000-0000-0000-0000-000000000201',
   'First portfolio night for me. Nervous but bringing six pieces as instructed. 😅','4'),
 ('f4000000-0000-0000-0000-000000001207','f1000000-0000-0000-0000-0000000000b0','f4000000-0000-0000-0000-000000000201',
   'Wine plus brutal honesty is the only feedback format that works on me. Count me in.','4'),
 -- on the photos post (0204)
 ('f4000000-0000-0000-0000-000000001208','f1000000-0000-0000-0000-0000000000b2','f4000000-0000-0000-0000-000000000204',
   'You got an incredible shot of my torch station — already updated my whole portfolio with it. Thank you!','17'),
 ('f4000000-0000-0000-0000-000000001209','f1000000-0000-0000-0000-0000000000ac','f4000000-0000-0000-0000-000000000204',
   'These are gorgeous. Grabbing the one of the mug shelf for my shop page if that''s okay.','16'),
 -- on the free-headshot offer (0205)
 ('f4000000-0000-0000-0000-000000001210','f1000000-0000-0000-0000-0000000000b6','f4000000-0000-0000-0000-000000000205',
   'Yes please — overdue for a real headshot. Put me on the list!','4'),
 -- on the sign-up sheet (0206)
 ('f4000000-0000-0000-0000-000000001211','f1000000-0000-0000-0000-0000000000b5','f4000000-0000-0000-0000-000000000206',
   'New here but I''ll grab a drop-in slot to watch first. Easing in.','5'),
 ('f4000000-0000-0000-0000-000000001212','f1000000-0000-0000-0000-0000000000ad','f4000000-0000-0000-0000-000000000206',
   'Took a full slot. Bringing the bench joinery I keep second-guessing.','5'),
 -- on the coffee-walk post (0203)
 ('f4000000-0000-0000-0000-000000001213','f1000000-0000-0000-0000-0000000000ae','f4000000-0000-0000-0000-000000000203',
   'The coffee walk is genuinely the best part of my week. Can confirm the secret handshake. ☕','3')
) AS v(id, author_id, parent_id, body, days_ago)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 7. EVENT — Cedros First-Friday Art Walk (past, -21d 17:00). Host = a7.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
VALUES ('f5000000-0000-0000-0000-000000000007'::uuid,
        'f1000000-0000-0000-0000-0000000000a7'::uuid,
        'f2000000-0000-0000-0000-000000000009'::uuid,
        'circle',
        'Cedros First-Friday Art Walk', 'cedros-first-friday',
        (now() - interval '21 days')::date + time '17:00',
        (now() - interval '21 days')::date + time '21:00',
        'Cedros Design District, Solana Beach',
        false, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
