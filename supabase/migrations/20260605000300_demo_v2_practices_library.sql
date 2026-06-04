-- =====================================================================
-- Demo v2 — practices library expansion (+18) + member adoptions
-- =====================================================================
-- 18 new practices spanning all channels, fully filled out on the rich schema
-- (header image, summary, markdown body, category/icon/cadence, per-log reward).
-- Marked is_demo = true so they recede + purge with the rest of the demo layer.
-- Then every demo member adopts their circle's active practice, so the practice
-- surfaces ("your practices", logging nudges) have real data.
--
-- New UUID prefix e2… (the original 11 demo practices are e1…). Idempotent.
-- =====================================================================

BEGIN;

INSERT INTO practices
  (id, title, category, icon, cadence, reward_zaps, reward_note, summary, header_image, body, is_public, is_demo)
SELECT v.id::uuid, v.title, v.category, v.icon, v.cadence, v.reward_zaps,
       '+' || v.reward_zaps || ' zaps · streak +1', v.summary,
       'https://picsum.photos/seed/practice-' || regexp_replace(lower(v.title),'[^a-z0-9]+','-','g') || '/1200/500',
       v.body, true, true
FROM (VALUES
 -- ---- Movement ----
 ('e2000000-0000-0000-0000-000000000001','Sunset jog','movement','footprints','Daily',15,
  'A easy jog as the day cools off. Shake out the desk, watch the light go gold.',
  E'The evening jog is the bookend the morning crowd misses. Lower stakes, better light.\n\n**How to do it**\n- Out the door before dinner; twenty easy minutes is plenty.\n- Keep it conversational — this is shake-out pace, not a workout.\n- Log it and let the day fall off behind you.'),
 ('e2000000-0000-0000-0000-000000000002','Ocean swim','movement','waves','Weekly',20,
  'Get in the water and swim. Cold, salty, alive.',
  E'Few things reset a nervous system like open water.\n\n**How to do it**\n- Buddy up, know the conditions, stay inside your limits.\n- Even ten minutes counts. The point is to get in.\n- Log it and ride the salt-water calm all day.'),
 ('e2000000-0000-0000-0000-000000000003','Trail hike','movement','mountain','Weekly',20,
  'Get on a trail and climb something. Earn the view.',
  E'Trading pavement for dirt changes more than the scenery.\n\n**How to do it**\n- Pick a trail, bring water, tell someone your plan.\n- No pace goal — just keep moving uphill.\n- Log it at the top, or back at the car.'),
 -- ---- Holistic Health ----
 ('e2000000-0000-0000-0000-000000000004','Sauna session','holistic-health','flame','Weekly',20,
  'Heat, sweat, stillness. Sit in the warmth and let go.',
  E'Heat is the gentle cousin of the cold plunge — same nervous-system reset, softer doorway.\n\n**How to do it**\n- Hydrate first. Start with ten to fifteen minutes.\n- Breathe slow; let the shoulders drop.\n- Log it and notice how well you sleep after.'),
 ('e2000000-0000-0000-0000-000000000005','Foam roll and stretch','holistic-health','activity','Daily',15,
  'Ten minutes on the floor giving your body some maintenance.',
  E'The boring practice that keeps every other practice possible.\n\n**How to do it**\n- Roll the big muscle groups, breathe into the tight spots.\n- Finish with a few long static stretches.\n- Log it; future-you with the healthy hips says thanks.'),
 ('e2000000-0000-0000-0000-000000000006','Sleep wind-down','holistic-health','moon','Daily',15,
  'A screen-free ramp into sleep. Dim the lights, slow it down.',
  E'Good days are built the night before.\n\n**How to do it**\n- Screens off thirty minutes before bed.\n- Dim lights, read or stretch, let the body get the signal.\n- Log it when you put the phone down for the night.'),
 -- ---- Spirituality ----
 ('e2000000-0000-0000-0000-000000000007','Evening reflection','spirituality','sunset','Daily',15,
  'A few quiet minutes to review the day with kindness.',
  E'A short look back, held gently, turns experience into wisdom.\n\n**How to do it**\n- What went well? What did I learn? What can I let go of?\n- Keep it brief and honest, never harsh.\n- Log it and close the day clean.'),
 ('e2000000-0000-0000-0000-000000000008','Loving-kindness','spirituality','heart','Daily',15,
  'A short metta practice — wishing yourself and others well.',
  E'You cannot pour from an empty cup, and you cannot hate your way to peace.\n\n**How to do it**\n- Silently wish yourself, then others, well: may you be happy, may you be at ease.\n- Start with someone easy; work toward someone hard.\n- Log it and carry the softness with you.'),
 ('e2000000-0000-0000-0000-000000000009','Nature sit','spirituality','trees','Weekly',15,
  'Sit outside and do nothing but notice. Let nature do the rest.',
  E'No app, no agenda — just you and a patch of the living world.\n\n**How to do it**\n- Find a spot outdoors and sit for ten minutes.\n- Watch, listen, smell. Let attention wander and return.\n- Log it and notice how the week slows down.'),
 -- ---- Creative ----
 ('e2000000-0000-0000-0000-00000000000a','Photo a day','creative','camera','Daily',15,
  'One intentional photograph a day. Train the eye.',
  E'The camera is just a reason to look harder at the ordinary.\n\n**How to do it**\n- One photo, made on purpose — light, shape, a small moment.\n- Phone is fine. Composition over gear.\n- Log it and watch your eye sharpen over a month.'),
 ('e2000000-0000-0000-0000-00000000000b','Morning pages','creative','notebook-pen','Daily',15,
  'Three pages of longhand stream-of-consciousness, first thing.',
  E'Clear the mental cache before the day writes over it.\n\n**How to do it**\n- Three pages, by hand, no stopping, no editing, no rereading.\n- It is not for anyone, not even you. Just empty the head.\n- Log it once the pages are full.'),
 ('e2000000-0000-0000-0000-00000000000c','Play an instrument','creative','music','Daily',15,
  'Pick it up and play, even for ten minutes. Keep the callouses.',
  E'The gap between you and the instrument closes one short session at a time.\n\n**How to do it**\n- Ten minutes counts. Scales, a song, noodling — all fine.\n- Done daily beats long-and-rare every time.\n- Log it and keep the streak alive.'),
 -- ---- Human Relating ----
 ('e2000000-0000-0000-0000-00000000000d','Call a friend','human-relating','phone','Weekly',15,
  'A real voice call with someone you care about. No texting.',
  E'Relationships run on attention, and a voice carries what a text cannot.\n\n**How to do it**\n- Call, do not text. Even ten minutes.\n- Ask a real question and actually listen.\n- Log it and notice how much lighter you both feel.'),
 ('e2000000-0000-0000-0000-00000000000e','Phone-free dinner','human-relating','utensils','Daily',15,
  'One meal a day with the phones away and the people present.',
  E'Presence is the most generous thing you can put on the table.\n\n**How to do it**\n- Phones in another room for one meal.\n- Talk, or just eat together in easy quiet.\n- Log it after the plates are cleared.'),
 ('e2000000-0000-0000-0000-00000000000f','Act of kindness','human-relating','hand-heart','Daily',15,
  'One small, deliberate kindness a day. No audience needed.',
  E'Small kindnesses compound, in the world and in you.\n\n**How to do it**\n- One deliberate kind act — a note, a hand, a genuine thank-you.\n- No need for credit. The doing is the point.\n- Log it and let it tilt your whole day warmer.'),
 -- ---- Business Support ----
 ('e2000000-0000-0000-0000-000000000010','Ship one small thing','business-support','rocket','Daily',20,
  'Finish and release one small thing every day. Done over perfect.',
  E'Momentum comes from shipping, not from polishing forever.\n\n**How to do it**\n- Pick the smallest thing you can actually finish today.\n- Ship it before you let yourself improve it.\n- Log it; a year of small ships is a big body of work.'),
 ('e2000000-0000-0000-0000-000000000011','Deep work hour','business-support','brain','Daily',20,
  'One hour of single-tasking on the work that matters. No inputs.',
  E'One real hour beats a whole distracted day.\n\n**How to do it**\n- Phone away, tabs closed, one task, sixty minutes.\n- Protect it like a meeting with the most important person you know.\n- Log it when the hour is done.'),
 ('e2000000-0000-0000-0000-000000000012','Learn 20 minutes','business-support','book-open','Daily',15,
  'Twenty focused minutes learning something for your craft.',
  E'Compounding works on knowledge too. Twenty minutes a day is a degree a decade.\n\n**How to do it**\n- One topic, twenty minutes, notes optional.\n- Same time each day so it sticks.\n- Log it and watch the edge sharpen.')
) AS v(id, title, category, icon, cadence, reward_zaps, summary, body)
ON CONFLICT (id) DO NOTHING;

-- Member adoptions: every demo member adopts their circle's active practice, so
-- the practice surfaces are populated. Idempotent on (profile_id, practice_id).
INSERT INTO member_practices (profile_id, practice_id, active)
SELECT DISTINCT m.profile_id, cp.practice_id, true
FROM memberships m
JOIN circle_practices cp ON cp.circle_id = m.circle_id AND cp.active
JOIN profiles p ON p.id = m.profile_id AND p.is_demo
ON CONFLICT (profile_id, practice_id) DO NOTHING;

COMMIT;
