-- =====================================================================
-- Demo v2 — base practice library (the 11 e1… practices), self-contained
-- =====================================================================
-- The v2 circle seeds set each circle's active practice to one of the original
-- 11 demo practices (e1… UUIDs, first seeded by 20260603…demo_1). On a fresh DB
-- those already exist (this is a no-op via ON CONFLICT); on any DB where the demo
-- practice library was never seeded or was purged, this recreates them so the
-- circle_practices FKs resolve. Fully on the rich schema (20260605000000).
--
-- Idempotent: explicit e1… UUIDs + ON CONFLICT (id) DO NOTHING.
-- =====================================================================

BEGIN;

INSERT INTO practices
  (id, title, category, icon, cadence, reward_zaps, reward_note, summary, header_image, body, is_public, is_demo)
SELECT v.id::uuid, v.title, v.category, v.icon, v.cadence, v.reward_zaps,
       '+' || v.reward_zaps || ' zaps · streak +1', v.summary,
       'https://picsum.photos/seed/practice-' || regexp_replace(lower(v.title),'[^a-z0-9]+','-','g') || '/1200/500',
       v.body, true, true
FROM (VALUES
 ('e1000000-0000-0000-0000-000000000001','Dawn patrol surf','movement','waves','Daily',20,
  'Paddle out at first light and trade a few waves before the day begins.',
  E'Set an alarm you will actually answer. The reward is the water before the world wakes up.\n\n**How to do it**\n- Check the surf report the night before and lay your gear by the door.\n- Be wet by sunrise. Even a short session counts.\n- Log it when you towel off.'),
 ('e1000000-0000-0000-0000-000000000002','Daily run','movement','footprints','Daily',15,
  'Lace up and run — any distance, any pace. The only goal is out the door.',
  E'The hardest step is the front door. Make the bar low enough that you never get to say no.\n\n**How to do it**\n- Commit to ten minutes. You can always stop at ten; you rarely will.\n- Same shoes, same spot, same time.\n- Log every run, especially the slow ones.'),
 ('e1000000-0000-0000-0000-000000000003','Mobility flow','movement','activity','Daily',15,
  'A few minutes of mobility to keep the body open, easy, and pain-free.',
  E'You do not need a mat or a class. You need five honest minutes of moving the joints you ignore all day.\n\n**How to do it**\n- Hips, spine, shoulders, ankles — slow circles, full range.\n- Breathe into the tight spots instead of forcing them.\n- Log it as part of your morning or wind-down.'),
 ('e1000000-0000-0000-0000-000000000004','Cold plunge','holistic-health','snowflake','Daily',25,
  'A short cold immersion to wake up the system and build real resilience.',
  E'Two minutes of discomfort you choose makes the rest of the day''s discomforts smaller.\n\n**How to do it**\n- Tub, ocean, or the cold tap at the end of a shower — all count.\n- Long, slow exhale as you get in. Ride the gasp.\n- Start with one minute, build to two or three.'),
 ('e1000000-0000-0000-0000-000000000005','Breathwork reset','holistic-health','wind','Daily',15,
  'A short, intentional breathing round to settle the nervous system.',
  E'Your breath is the one lever on the nervous system you can pull on demand. Use it.\n\n**How to do it**\n- Down-regulate: inhale four, exhale six to eight, for a few minutes.\n- Sit or lie somewhere you will not be interrupted.\n- Log it whenever you use it.'),
 ('e1000000-0000-0000-0000-000000000006','Sound bath sit','holistic-health','radio','Weekly',15,
  'Sit and let the tones wash over you. Rest in the resonance.',
  E'Nothing to achieve, nowhere to get to. Your only job is to lie down and let go.\n\n**How to do it**\n- Find a session, or put on a long resonant track at home.\n- Get comfortable, close your eyes, let the sound do the work.\n- Log it after — notice how the week feels lighter.'),
 ('e1000000-0000-0000-0000-000000000007','Morning sit','spirituality','sunrise','Daily',15,
  'Sit in stillness and follow the breath for a few quiet minutes.',
  E'Ten quiet minutes before the inputs start changes the whole shape of the day.\n\n**How to do it**\n- Same seat, same time. Set a gentle timer.\n- Follow the breath; when the mind wanders, come back. That returning is the practice.\n- Log it and move into your morning steadier.'),
 ('e1000000-0000-0000-0000-000000000008','Gratitude journal','spirituality','notebook-pen','Daily',15,
  'Write down a few things you are grateful for this morning.',
  E'Attention is a muscle, and gratitude is how you point it at what is already good.\n\n**How to do it**\n- Three specific things, not vague ones.\n- Same notebook, same time, thirty seconds is plenty.\n- Log it and notice the lens stay tilted toward the good.'),
 ('e1000000-0000-0000-0000-000000000009','Daily sketch','creative','pencil','Daily',15,
  'One quick sketch a day. No judgement — just marks on paper.',
  E'The sketchbook is not for masterpieces. It is for keeping the channel open.\n\n**How to do it**\n- Five minutes, one subject — your coffee, your hand, the view.\n- Done beats good. Fill the page and close the book.\n- Log it; watch your eye sharpen over a month.'),
 ('e1000000-0000-0000-0000-00000000000a','250 words','creative','pen-line','Daily',15,
  'Write 250 words. Anything. Build the habit before the polish.',
  E'Two hundred and fifty words is small enough to start and big enough to matter.\n\n**How to do it**\n- No editing, no rereading — just forward motion until you hit the count.\n- Morning pages, a journal, the scene you are stuck on — all count.\n- Log it the moment you cross 250.'),
 ('e1000000-0000-0000-0000-00000000000b','Reach out to one person','business-support','send','Daily',20,
  'Send one genuine message to one person who matters to your work.',
  E'Opportunities live in relationships, and relationships are kept warm one message at a time.\n\n**How to do it**\n- One person, one real message — no mass blast, no ask required.\n- A check-in, a thank-you, a useful link, a genuine question.\n- Log it. One a day is a few hundred warm connections a year.')
) AS v(id, title, category, icon, cadence, reward_zaps, summary, body)
ON CONFLICT (id) DO NOTHING;

COMMIT;
