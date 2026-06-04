-- =====================================================================
-- Demo seed (v2) — CIRCLE 4: 101 Founders Collective
-- =====================================================================
-- One Encinitas circle (Downtown 101) + 20 auth-less demo members +
-- memberships + circle_practice + posts/replies + 2 events. All is_demo=true.
--
-- Mirrors 20260603000003_demo_2_sandiego.sql (the template) and follows the
-- Part B build spec in docs/DEMO-CAST.md (B.2–B.5, schema rules verbatim).
--
-- Quota (§3 pyramid slice): Lum 1 / Con 1 / Agent 3 / Op 4 / Run 6 / Ghost 5 = 20.
-- community_role: 1 host (the Luminary) / 2 crew / 1 guide / rest member.
-- season_challenges_complete=true ONLY for the Luminary host.
--
-- UUID blocks (strictly inside, per B.2):
--   profiles  f1000000-…-0000000000NN  tails 40–53 (20 people)
--   circle    f2000000-…-000000000004
--   posts     f4000000-…-000000000NNN  tails 00c1–0100
--   replies   f4000000-…-000000001NNN  tails 10c1–1100
--   events    f5000000-…-0000000000NN  tails 03 (Q1 Demo Night, past),
--                                            0d (Summer Demo Night, upcoming)
--   active practice e1000000-…-00000000000b ('Reach out to one person')
--
-- member_count is maintained by trg_increment_circle_member_count — NOT set here.
-- Idempotent: deterministic UUIDs + ON CONFLICT DO NOTHING. Safe to re-run.
-- =====================================================================

BEGIN;

-- Resolve shared geography/channel once (mirror SD template's temp ctx).
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT
  COALESCE(
    (SELECT id FROM nexus_regions WHERE name = 'North County' ORDER BY depth LIMIT 1),
    (SELECT id FROM nexus_regions WHERE name = 'San Diego'    ORDER BY depth LIMIT 1),
    (SELECT id FROM nexus_regions WHERE depth = 0 ORDER BY name LIMIT 1)
  ) AS region_id,
  (SELECT id FROM topical_channels WHERE slug = 'business-support') AS channel_id;

-- =====================================================================
-- 1. CIRCLE — hub_id NULL; member_count left to the trigger.
-- =====================================================================
INSERT INTO circles (id, name, slug, hub_id, type, member_cap, status, about,
                     latitude, longitude, neighborhood, city, topical_channel_id, image_url, is_demo)
SELECT 'f2000000-0000-0000-0000-000000000004'::uuid,
       '101 Founders Collective',
       '101-founders-collective',
       NULL::uuid,
       'in-person', 50, 'active',
       'Founders and operators building in Encinitas. Honest accountability, warm intros, no pitch decks. We meet on the 101 — quick wins, current blocker, one ask, then demo nights when there''s something to show.',
       33.0450, -117.2930, 'Downtown 101', 'Encinitas',
       ctx.channel_id,
       'https://picsum.photos/seed/101-founders-collective/400/400',
       true
FROM _ctx ctx
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. PROFILES (20) — quota Lum1/Con1/Agt3/Op4/Run6/Ghost5.
--    Stats sit inside the §3 band for each rank.
--    avatar ~75%; last_seen recent for leaders, older for ghosts.
--    season_challenges_complete=true ONLY for the Luminary host.
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
       m.rank::season_rank_enum, m.zaps, m.life_zaps, m.gems,
       m.streak, m.longest, m.achv,
       (m.rank = 'luminary'),
       now() - (m.seen_min || ' minutes')::interval,
       true, true
FROM _ctx ctx,
(VALUES
 -- id, display_name, handle, role, bio, avatar?, rank, season_zaps, lifetime_zaps, gems, streak, longest, achv, minutes-since-seen
 -- ---- Luminary host (1) ----
 ('f1000000-0000-0000-0000-000000000040','Reese Calderón','reese.founders','host',
   'Two exits, one humbling failure, still building. I keep the table honest and the demo nights real.',
   true,'luminary',2680,9400,1980,38,44,25,9),
 -- ---- Conduit (1) — pillar / crew ----
 ('f1000000-0000-0000-0000-000000000041','Priya Venkat','priya.builds','crew',
   'I run the intro round and chase the follow-ups. Connector by trade, operator by necessity.',
   true,'conduit',1820,5600,1120,21,26,19,34),
 -- ---- Agents (3) — crew lead + guide + member ----
 ('f1000000-0000-0000-0000-000000000042','Marcus Tran','marcus.ships','crew',
   'Solo founder shipping weekly. I own the demo-night signups and the snack budget.',
   true,'agent',1180,3100,640,16,19,14,52),
 ('f1000000-0000-0000-0000-000000000043','Yael Bergström','yael.advises','guide',
   'Exited once, advising now. Ask me the hard money questions before you ask the easy ones.',
   true,'agent',1340,3600,720,18,22,15,210),
 ('f1000000-0000-0000-0000-000000000044','Desmond Okafor','desmond.b2b','member',
   'B2B SaaS, second time around. Here for the accountability, staying for the people.',
   false,'agent',860,2400,490,12,15,12,300),
 -- ---- Operatives (4) ----
 ('f1000000-0000-0000-0000-000000000045','Lena Hofmann','lena.bootstrap','member',
   'Bootstrapping a hardware startup out of a Leucadia garage. Revenue over raises.',
   true,'operative',620,1500,340,11,14,9,18),
 ('f1000000-0000-0000-0000-000000000046','Ravi Suresh','ravi.fractional','member',
   'Fractional CFO who founds on the side. I bring spreadsheets and calm.',
   true,'operative',480,1200,260,9,12,8,140),
 ('f1000000-0000-0000-0000-000000000047','Camille Roux','camille.agency','member',
   'Agency owner trying to turn services into product. The table keeps me honest about it.',
   false,'operative',360,980,200,7,10,8,720),
 ('f1000000-0000-0000-0000-000000000048','Tomás Iglesias','tomas.devtools','member',
   'Devtools founder, pre-revenue and proud. Shipping in public, failing in private.',
   true,'operative',420,1100,230,8,11,7,26),
 -- ---- Runners (6) ----
 ('f1000000-0000-0000-0000-000000000049','Anneke de Vries','anneke.climate','member',
   'Climate-tech first-timer. Quit the corporate job, building the scary thing.',
   true,'runner',240,620,120,6,8,6,12),
 ('f1000000-0000-0000-0000-00000000004a','Jordan Pike','jordan.solo','member',
   'Solopreneur figuring out which of my five ideas is the real one.',
   true,'runner',190,500,95,5,7,5,200),
 ('f1000000-0000-0000-0000-00000000004b','Mina Park','mina.marketplace','member',
   'Building a local marketplace. Slowly learning that distribution is the product.',
   false,'runner',160,440,80,4,6,5,1080),
 ('f1000000-0000-0000-0000-00000000004c','Felix Aubert','felix.consult','member',
   'Consultant going founder. Trading billable hours for equity and uncertainty.',
   true,'runner',210,540,105,5,7,6,9),
 ('f1000000-0000-0000-0000-00000000004d','Sade Adeyemi','sade.creator','member',
   'Creator-economy tools. First time anyone''s called what I do a "startup".',
   true,'runner',130,360,65,3,5,4,300),
 ('f1000000-0000-0000-0000-00000000004e','Tobias Lund','tobias.hardware','member',
   'Ex-engineer, new founder. The accountability is the whole reason I show up.',
   false,'runner',150,420,75,4,6,5,1440),
 -- ---- Ghosts (5) — newest / lurkers warming up ----
 ('f1000000-0000-0000-0000-00000000004f','Hana Kimura','hana.firstidea','member',
   'Just sketched my first idea on a napkin. Terrified, excited, mostly terrified.',
   true,'ghost',85,260,48,2,3,3,160),
 ('f1000000-0000-0000-0000-000000000050','Marco Bellini','marco.lurks','member',
   'Lurked for a month before posting. Pre-pre-seed, pre-everything, really.',
   false,'ghost',60,200,30,1,2,2,2880),
 ('f1000000-0000-0000-0000-000000000051','Imani Cross','imani.nights','member',
   'Day job by day, building by night. New here, glad the table exists.',
   true,'ghost',45,150,22,1,2,2,15),
 ('f1000000-0000-0000-0000-000000000052','Erik Solberg','erik.maybe','member',
   'Maybe-founder. Came to a demo night, left thinking I could actually do this.',
   true,'ghost',30,110,14,0,1,1,4320),
 ('f1000000-0000-0000-0000-000000000053','Wren Holloway','wren.exploring','member',
   'Exploring whether to leave a stable thing for an unstable one. Listening for now.',
   false,'ghost',22,90,10,0,1,1,7200)
) AS m(id,display_name,handle,role,bio,avatar,rank,zaps,life_zaps,gems,streak,longest,achv,seen_min)
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 3. MEMBERSHIPS — status active; volunteer_role mirrors community_role
--    (members get NULL). member_count maintained by trigger.
--    No cross-memberships here (handled in the weave migration).
-- =====================================================================
INSERT INTO memberships (profile_id, circle_id, status, volunteer_role)
SELECT p.id, 'f2000000-0000-0000-0000-000000000004'::uuid, 'active'::membership_status,
       NULLIF(p.community_role, 'member'::community_role)
FROM profiles p
WHERE p.id IN (
  'f1000000-0000-0000-0000-000000000040','f1000000-0000-0000-0000-000000000041',
  'f1000000-0000-0000-0000-000000000042','f1000000-0000-0000-0000-000000000043',
  'f1000000-0000-0000-0000-000000000044','f1000000-0000-0000-0000-000000000045',
  'f1000000-0000-0000-0000-000000000046','f1000000-0000-0000-0000-000000000047',
  'f1000000-0000-0000-0000-000000000048','f1000000-0000-0000-0000-000000000049',
  'f1000000-0000-0000-0000-00000000004a','f1000000-0000-0000-0000-00000000004b',
  'f1000000-0000-0000-0000-00000000004c','f1000000-0000-0000-0000-00000000004d',
  'f1000000-0000-0000-0000-00000000004e','f1000000-0000-0000-0000-00000000004f',
  'f1000000-0000-0000-0000-000000000050','f1000000-0000-0000-0000-000000000051',
  'f1000000-0000-0000-0000-000000000052','f1000000-0000-0000-0000-000000000053'
)
ON CONFLICT (profile_id, circle_id) DO NOTHING;

-- =====================================================================
-- 4. CIRCLE PRACTICE — active practice set by the host.
-- =====================================================================
INSERT INTO circle_practices (circle_id, practice_id, set_by, active)
VALUES ('f2000000-0000-0000-0000-000000000004'::uuid,
        'e1000000-0000-0000-0000-00000000000b'::uuid,
        'f1000000-0000-0000-0000-000000000040'::uuid,
        true)
ON CONFLICT (circle_id, practice_id) DO NOTHING;

-- =====================================================================
-- 5. POSTS (top-level) — per-rank volume (Lum 4 · Con 3 · Agt 2 · Op 1–2 ·
--    Run 1 · ~75% Ghosts one short post + ~25% silent). Voiced to
--    founders/operators: honest accountability, warm intros, no pitch decks.
--    ≥1 recaps Q1 Demo Night (f5…03), ≥1 announces Summer Demo Night (f5…0d).
--    Block tails 00c1–0100. created_at staggered over the last ~45 days.
-- =====================================================================
INSERT INTO posts (id, author_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, 'f2000000-0000-0000-0000-000000000004'::uuid,
       'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- ---- Luminary host: 4 posts (incl. Q1 recap + Summer Demo announcement) ----
 ('f4000000-0000-0000-0000-0000000000c1','f1000000-0000-0000-0000-000000000040',
   'Welcome to the 101 Founders Collective. 👋 The deal here is simple: no pitch decks, no performing. We meet on the 101, you bring the thing you''re actually stuck on, and we go around — quick win, current blocker, one ask. That''s it. New folks, drop a line below and tell us what you''re building.',
   (45*1440)::text),
 ('f4000000-0000-0000-0000-0000000000c2','f1000000-0000-0000-0000-000000000040',
   'Q1 Demo Night recap 🎤 Eleven of you got up and showed real work — not slideware, the actual product. Lena''s hardware prototype turning on for the first time got the loudest room of the night. Marcus shipped live in front of us (it worked, mostly). Proudest I''ve been of this table. Thank you for being brave with your unfinished stuff.',
   (68*1440)::text),
 ('f4000000-0000-0000-0000-0000000000c3','f1000000-0000-0000-0000-000000000040',
   '📣 Summer Demo Night is locked — 9 days out, 6pm, the Downtown 101 workspace. Same format: five minutes, live demo only, slides are banned. Two slots already taken, four left. If you''ve got something that limps to life on a good day, that counts. Reply to grab a spot.',
   (3*1440)::text),
 ('f4000000-0000-0000-0000-0000000000c4','f1000000-0000-0000-0000-000000000040',
   'Reminder on this season''s practice: reach out to one person who matters to your work. One real message, not a blast. Half the warm intros that have happened at this table started with someone doing exactly that on a Tuesday. Who are you sending it to this week?',
   (11*1440)::text),

 -- ---- Conduit: 3 posts ----
 ('f4000000-0000-0000-0000-0000000000c5','f1000000-0000-0000-0000-000000000041',
   'Intro round is my favorite ten minutes of the week. 🤝 If you asked for something last meeting and I said I''d connect you — check your DMs, I''ve got two intros queued: a fractional CFO and a contract designer who actually ships. Tell me what you need before Summer Demo and I''ll work the rolodex.',
   (8*1440)::text),
 ('f4000000-0000-0000-0000-0000000000c6','f1000000-0000-0000-0000-000000000041',
   'Gentle accountability nudge before the weekend: what did you say you''d do last meeting, and did you do it? No judgment — I''m two days behind on my own ask. But say it out loud here. Naming it is half the work.',
   (20*1440)::text),
 ('f4000000-0000-0000-0000-0000000000c7','f1000000-0000-0000-0000-000000000041',
   'A thing I keep relearning: distribution is the product. Built three beautiful things nobody could find. If you''re heads-down building and avoiding the "how will anyone hear about this" question — that''s your blocker for Thursday. Bring it.',
   (33*1440)::text),

 -- ---- Agents: 2 posts each ----
 ('f4000000-0000-0000-0000-0000000000c8','f1000000-0000-0000-0000-000000000042',
   'Demo Night signups are open — I keep the list, so reply or grab me on the 101. 🗓️ Snack budget is handled (don''t ask what the budget is). If you''re on the fence about demoing, do it. Worst case you learn your thing breaks in front of friendly people instead of customers.',
   (4*1440)::text),
 ('f4000000-0000-0000-0000-0000000000c9','f1000000-0000-0000-0000-000000000042',
   'Shipped my weekly release this morning and only broke prod for nine minutes. 🚀 Growth. Solo-founder life is a lot of small wins you''d never tell anyone except a room of people who get it. Glad this is that room.',
   (16*1440)::text),
 ('f4000000-0000-0000-0000-0000000000ca','f1000000-0000-0000-0000-000000000043',
   'Hard-money question to chew on before Thursday: do you actually know your burn and your runway to the month? Not roughly — to the month. If that made you flinch, that''s the conversation to have. I''ll bring the boring spreadsheet that makes it less scary.',
   (12*1440)::text),
 ('f4000000-0000-0000-0000-0000000000cb','f1000000-0000-0000-0000-000000000043',
   'For the newer founders nervous to ask me stuff: there are no dumb questions about money, only expensive silences. I''ve made every mistake at least once. Ask the hard one early, while it''s cheap to fix.',
   (28*1440)::text),
 ('f4000000-0000-0000-0000-0000000000cc','f1000000-0000-0000-0000-000000000044',
   'Second time building B2B and I''d forgotten how lonely the middle is. Not the launch, not the exit — the long flat part. This table is the thing that makes the flat part bearable. Showed up skeptical, staying for the people.',
   (24*1440)::text),
 ('f4000000-0000-0000-0000-0000000000cd','f1000000-0000-0000-0000-000000000044',
   'My ask for Thursday: anyone here sold into mid-market ops teams? Trying to figure out who actually signs the check vs who I''ve been charming. Coffee on me for fifteen minutes of your scar tissue.',
   (6*1440)::text),

 -- ---- Operatives: 1–2 posts (45 & 48 get 2; 46 & 47 get 1) ----
 ('f4000000-0000-0000-0000-0000000000ce','f1000000-0000-0000-0000-000000000045',
   'The hardware prototype turned ON at Q1 Demo Night and I genuinely teared up in front of all of you. 😅 Eight months in a Leucadia garage for a green LED and a room cheering. Worth it. Revenue over raises, but moments over both.',
   (66*1440)::text),
 ('f4000000-0000-0000-0000-0000000000cf','f1000000-0000-0000-0000-000000000045',
   'Bootstrapper question: at what point did you let yourself hire the first person? I''m drowning but allergic to spending money I don''t have yet. Bring your war stories Thursday.',
   (10*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d0','f1000000-0000-0000-0000-000000000046',
   'Fractional-CFO-who-also-founds here, happy to look at anyone''s model before Summer Demo. 📊 Bring the messy one, not the investor-deck one. The messy one is where the truth is. I''ll trade you calm for chaos.',
   (14*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d1','f1000000-0000-0000-0000-000000000047',
   'Trying to turn an agency into a product and it is HARD to stop trading hours for money when the hours pay the rent. Anyone made this jump? This is my real blocker, not a hypothetical. Be honest with me Thursday.',
   (22*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d2','f1000000-0000-0000-0000-000000000048',
   'Building in public update: devtool is live, pre-revenue, and I demoed it last quarter held together with hope. 🛠️ Going to demo the slightly-less-broken version at Summer Demo Night. Progress is just being less embarrassed than last time.',
   (5*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d3','f1000000-0000-0000-0000-000000000048',
   'Failing in private, shipping in public — but this week I want to flip it. My ask: someone hold me accountable to actually talk to five users by Friday instead of refactoring for the tenth time. Volunteers?',
   (26*1440)::text),

 -- ---- Runners: 1 post each ----
 ('f4000000-0000-0000-0000-0000000000d4','f1000000-0000-0000-0000-000000000049',
   'Quit the stable corporate job last month to build the scary climate thing full-time. Some days I''m sure, some days I''m terrified. Mostly I''m grateful there''s a room where "I don''t know if this works" is a normal Tuesday sentence. 🌍',
   (12*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d5','f1000000-0000-0000-0000-00000000004a',
   'Five ideas, one brain, zero clarity. 😅 My ask for the table: help me kill four of them. I think I''m keeping them all alive because killing one feels like failing. Talk me out of it.',
   (200*60)::text),
 ('f4000000-0000-0000-0000-0000000000d6','f1000000-0000-0000-0000-00000000004b',
   'Slowly learning that nobody finds your marketplace by accident. Building the supply side was fun; finding demand is the actual job. Wish someone had told me sooner — so I''m telling the next person now.',
   (30*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d7','f1000000-0000-0000-0000-00000000004c',
   'Left consulting to go founder and the hardest part isn''t the work, it''s trading guaranteed billable hours for maybe-equity. The accountability here is the only thing keeping me from crawling back to safety. Showing up is the practice.',
   (9*1440)::text),
 ('f4000000-0000-0000-0000-0000000000d8','f1000000-0000-0000-0000-00000000004d',
   'First time anyone called what I make a "startup" and not a "side thing" was at this table. Small reframe, big shift. Creator tools, building slow, here for the long flat middle. 🙏',
   (300*60)::text),
 ('f4000000-0000-0000-0000-0000000000d9','f1000000-0000-0000-0000-00000000004e',
   'Ex-engineer, new founder, and honestly the accountability is the entire reason I show up. Left to my own devices I''d refactor forever and ship nothing. Thursday keeps me honest. See you on the 101.',
   (35*1440)::text),

 -- ---- Ghosts: 4 short newcomer posts (1 stays silent — 0x50 Marco) ----
 ('f4000000-0000-0000-0000-0000000000da','f1000000-0000-0000-0000-00000000004f',
   'New here 👋 just sketched my first real idea on a napkin last week. Mostly terrified, a little excited. Lurked a while, finally saying hi.',
   (160*60)::text),
 ('f4000000-0000-0000-0000-0000000000db','f1000000-0000-0000-0000-000000000051',
   'Day job by day, building by night. New to the table — glad a no-pitch-deck room exists. Hoping to work up to a demo night eventually.',
   (15*60)::text),
 ('f4000000-0000-0000-0000-0000000000dc','f1000000-0000-0000-0000-000000000052',
   'Came to Q1 Demo Night as a guest and left thinking maybe I could actually do this. So here I am. Hi. 👋',
   (67*1440)::text),
 ('f4000000-0000-0000-0000-0000000000dd','f1000000-0000-0000-0000-000000000053',
   'Still deciding whether to leave a stable thing for an unstable one. Not ready to build out loud yet — just listening and learning from you all for now. Thanks for letting me lurk.',
   (40*1440)::text)
) AS v(id, author_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 6. REPLIES — ~8–14, clustered on the liveliest posts (host welcome,
--    Q1 recap, Summer Demo announcement, Lena's prototype). Reply block
--    tails 10c1–1100, parent_id set to a top-level post above.
-- =====================================================================
INSERT INTO posts (id, author_id, parent_id, scope_id, visibility, body, created_at, is_demo)
SELECT v.id::uuid, v.author_id::uuid, v.parent_id::uuid,
       'f2000000-0000-0000-0000-000000000004'::uuid, 'group'::post_visibility, v.body,
       now() - (v.age_min || ' minutes')::interval, true
FROM (VALUES
 -- on the host welcome (…00c1) — newcomers introducing themselves
 ('f4000000-0000-0000-0000-0000000010c1','f1000000-0000-0000-0000-00000000004f','f4000000-0000-0000-0000-0000000000c1',
   'Hi! Building... well, a napkin right now. But a real napkin. Excited to be here.', (44*1440)::text),
 ('f4000000-0000-0000-0000-0000000010c2','f1000000-0000-0000-0000-000000000051','f4000000-0000-0000-0000-0000000000c1',
   'No-deck rule sold me. Day-job founder, building nights. Glad to be in the room.', (14*60)::text),
 ('f4000000-0000-0000-0000-0000000010c3','f1000000-0000-0000-0000-000000000044','f4000000-0000-0000-0000-0000000000c1',
   'Second-timer here. The "one ask" format is criminally underrated. It''s the whole reason I came back.', (43*1440)::text),

 -- on the Q1 recap (…00c2) — attendees + the prototype moment
 ('f4000000-0000-0000-0000-0000000010c4','f1000000-0000-0000-0000-000000000045','f4000000-0000-0000-0000-0000000000c2',
   'Still not over the room cheering for a green LED. Carried me through three rough weeks since. 🥹', (67*1440)::text),
 ('f4000000-0000-0000-0000-0000000010c5','f1000000-0000-0000-0000-000000000042','f4000000-0000-0000-0000-0000000000c2',
   'Demoing live and watching it half-break in front of friendly faces was the most useful five minutes of my quarter.', (67*1440)::text),
 ('f4000000-0000-0000-0000-0000000010c6','f1000000-0000-0000-0000-000000000052','f4000000-0000-0000-0000-0000000000c2',
   'I was the nervous guest in the back that night. It''s why I finally joined. Thanks for letting outsiders watch.', (66*1440)::text),

 -- on the Summer Demo announcement (…00c3) — grabbing slots
 ('f4000000-0000-0000-0000-0000000010c7','f1000000-0000-0000-0000-000000000048','f4000000-0000-0000-0000-0000000000c3',
   'Slot please! Demoing the slightly-less-broken devtool. Lowering the bar for everyone, you''re welcome.', (3*1440)::text),
 ('f4000000-0000-0000-0000-0000000010c8','f1000000-0000-0000-0000-000000000045','f4000000-0000-0000-0000-0000000000c3',
   'In. The prototype actually does two things now instead of one. Wild.', (2*1440)::text),
 ('f4000000-0000-0000-0000-0000000010c9','f1000000-0000-0000-0000-000000000049','f4000000-0000-0000-0000-0000000000c3',
   'Terrifying, but yes — put me down. First time demoing anything ever. 🌍', (2*1440)::text),
 ('f4000000-0000-0000-0000-0000000010ca','f1000000-0000-0000-0000-000000000042','f4000000-0000-0000-0000-0000000000c3',
   'Got you all on the list. Two slots left, founders. Don''t make me chase you on the 101.', (1*1440)::text),

 -- on the connector/intro post (…00c5)
 ('f4000000-0000-0000-0000-0000000010cb','f1000000-0000-0000-0000-000000000047','f4000000-0000-0000-0000-0000000000c5',
   'I''ll take the fractional CFO intro — drowning in the agency-to-product math. Thank you. 🙏', (7*1440)::text),
 ('f4000000-0000-0000-0000-0000000010cc','f1000000-0000-0000-0000-000000000046','f4000000-0000-0000-0000-0000000000c5',
   'Camille, that''s me — happy to look at it. The messy spreadsheet, remember. 😄', (7*1440)::text),

 -- on the burn/runway hard question (…00ca)
 ('f4000000-0000-0000-0000-0000000010cd','f1000000-0000-0000-0000-000000000045','f4000000-0000-0000-0000-0000000000ca',
   'Flinched. Hard. Okay, bringing the real numbers Thursday. Be gentle (don''t be gentle).', (11*1440)::text),
 ('f4000000-0000-0000-0000-0000000010ce','f1000000-0000-0000-0000-00000000004c','f4000000-0000-0000-0000-0000000000ca',
   'This is exactly the spreadsheet I''ve been avoiding for a month. See you Thursday, I guess.', (11*1440)::text)
) AS v(id, author_id, parent_id, body, age_min)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.id = v.id::uuid);

-- =====================================================================
-- 7. EVENTS (2) — both hosted by the Luminary host. Q1 Demo Night (past,
--    -70d) anchors history; Summer Demo Night (upcoming, +9d) anticipation.
-- =====================================================================
INSERT INTO events (id, host_id, scope_id, scope_type, title, slug,
                    starts_at, ends_at, location, is_cancelled, is_demo)
SELECT v.id::uuid, 'f1000000-0000-0000-0000-000000000040'::uuid,
       'f2000000-0000-0000-0000-000000000004'::uuid, 'circle', v.title, v.slug,
       v.starts_at::timestamptz, v.ends_at::timestamptz, v.location, false, true
FROM (VALUES
 ('f5000000-0000-0000-0000-000000000003',
   'Founders Q1 Demo Night','founders-q1-demo-night',
   (now() - interval '70 days')::date + time '18:00',
   (now() - interval '70 days')::date + time '21:00',
   'Downtown 101 workspace, Encinitas'),
 ('f5000000-0000-0000-0000-00000000000d',
   'Summer Demo Night','founders-summer-demo-night',
   (now() + interval '9 days')::date + time '18:00',
   (now() + interval '9 days')::date + time '21:00',
   'Downtown 101 workspace, Encinitas')
) AS v(id, title, slug, starts_at, ends_at, location)
WHERE NOT EXISTS (SELECT 1 FROM events e WHERE e.id = v.id::uuid);

COMMIT;
