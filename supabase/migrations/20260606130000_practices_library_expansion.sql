-- =====================================================================
-- Practices: library expansion — balance the four Pillars
-- =====================================================================
-- The starter library shipped 5 core practices (20240228000000_practices.sql),
-- enriched in 20260605000000_practices_rich_content.sql. But those 5 only cover
-- two of the four Pillars (Body ×2, Spirit ×3) and three of the six categories —
-- Mind and Expression had NO core practice, and the human-relating category was
-- empty. This migration adds 16 system-owned, public, rich-content practices so
-- every Pillar and category is represented, and links each to its Pillar.
--
-- Same shape as the existing library: system-owned (created_by null), is_public
-- true, with category / icon / cadence / summary / body and a per-log zap reward.
-- Reward model unchanged (ADR-104): rewards attach to the DOING. reward_zaps is a
-- per-log override on logPractice() (null would fall back to the default); heavier
-- asks (deep work, strength, real outreach) get a touch more, like surf/cold do.
--
-- Idempotent: INSERT ... SELECT guarded by NOT EXISTS on title (there is no unique
-- constraint on practices.title, so this is the safe re-run guard). header_image is
-- a deterministic placeholder (matches the rich-content migration) — swap for
-- curated art later. See docs/DECISIONS.md (ADR-105).
-- =====================================================================

BEGIN;

-- 1. Insert the new library practices --------------------------------------
INSERT INTO practices
  (title, description, is_public, created_by, category, icon, cadence,
   reward_zaps, reward_note, summary, body, header_image)
SELECT
  v.title, v.description, true, NULL, v.category, v.icon, v.cadence,
  v.reward_zaps,
  '+' || v.reward_zaps || ' zaps · streak +1',
  v.summary, v.body,
  'https://picsum.photos/seed/practice-'
    || regexp_replace(lower(v.title), '[^a-z0-9]+', '-', 'g')
    || '/1200/500'
FROM (VALUES
 -- title, description, category, icon, cadence, reward_zaps, summary, body(markdown)

 -- ---- Mind ----
 ('Deep work block',
  'One undistracted, single-task focus session on what matters most.',
  'business-support', 'brain', 'Daily', 20,
  'Protect one block of deep, single-task focus before the day fragments it.',
  E'The work that moves your life forward rarely happens in the gaps between notifications. Carve out one block and defend it.\n\n**How to do it**\n- Pick one task and one block. Even twenty-five minutes counts.\n- Phone in another room, tabs closed, one thing on the screen.\n- Log it when the block is done.\n\n**Why it works**\nFocus is a muscle and a habit. One protected block a day compounds into the projects you keep meaning to start, and trains your attention to go deep on demand.'),

 ('Read ten pages',
  'Read ten pages of a real book. Small enough to never skip.',
  'creative', 'book-open', 'Daily', 15,
  'Ten pages a day is dozens of books a year without it ever feeling like work.',
  E'Ten pages is small enough to start when you are tired and big enough to add up to dozens of books a year.\n\n**How to do it**\n- Keep the book where you already sit. Bedside, kitchen, bag.\n- Paper or screen, fiction or not. Ten pages is the only rule.\n- Log it when you close the book.\n\n**Why it works**\nReading is the cheapest way to borrow another mind for an hour. Keep the daily habit small and the volume takes care of itself.'),

 ('Digital sunset',
  'Screens off an hour before bed to let the mind wind down.',
  'holistic-health', 'moon', 'Daily', 15,
  'Put the screens to bed an hour before you do, and sleep better for it.',
  E'The hour before sleep sets the quality of the night. Give your nervous system a runway.\n\n**How to do it**\n- Pick a cut-off time and put the phone on charge in another room.\n- Swap the scroll for a book, a stretch, a conversation, or nothing at all.\n- Log it once the screens are down for the night.\n\n**Why it works**\nLate-night light and endless input keep the mind switched on. An hour of analogue tells your body the day is over, so you fall asleep faster and wake clearer.'),

 ('Plan tomorrow tonight',
  'Write your top three for tomorrow before you sleep.',
  'business-support', 'clipboard-list', 'Daily', 15,
  'Name your top three for tomorrow tonight, and wake up already pointed.',
  E'Deciding what matters is real work. Do it the night before, so the morning starts with momentum instead of a blank page.\n\n**How to do it**\n- Three things, no more. The ones that would make tomorrow a win.\n- Write them where you will see them first thing.\n- Log it and let your sleeping mind do the planning.\n\n**Why it works**\nA short list set the night before beats a long list made in the morning fog. You wake up aimed, and the day stops drifting.'),

 -- ---- Expression ----
 ('Make music',
  'Play, sing, or hum for a few minutes. No audience required.',
  'creative', 'music', 'Daily', 15,
  'A few minutes of making sound keeps the most joyful channel open.',
  E'You do not need talent or a stage. You need a few minutes of making sound for its own sake.\n\n**How to do it**\n- Pick up the instrument, open the singing app, or just hum in the shower.\n- No performance, no recording. Play for the play of it.\n- Log it when you stop.\n\n**Why it works**\nMaking music drops you straight into the present and lights up reward circuits that words cannot reach. Daily reps keep the channel open and slowly make you better, too.'),

 ('One photo a day',
  'Take a single intentional photograph each day.',
  'creative', 'camera', 'Daily', 15,
  'One deliberate photo a day trains your eye to actually see.',
  E'The goal is not a great photo. It is the habit of looking. One frame, chosen on purpose.\n\n**How to do it**\n- One photo, taken because you decided to, not by reflex.\n- Notice the light, a shape, a moment, then frame it and shoot.\n- Log it once you have your one frame for the day.\n\n**Why it works**\nLooking for one good frame makes you present to the ordinary. Over weeks your eye sharpens and the everyday starts to look worth keeping.'),

 ('Voice journal',
  'Speak your thoughts into a voice memo for a few minutes.',
  'creative', 'mic', 'Daily', 15,
  'Talk it out into a voice memo. Thinking out loud, on the record.',
  E'Some things are easier said than written. Talk to yourself for a few minutes and let the thoughts untangle.\n\n**How to do it**\n- Hit record and just talk. Whatever is on your mind, no script.\n- Do not re-listen or edit. The point is getting it out.\n- Log it when you stop the recording.\n\n**Why it works**\nSpeaking freely surfaces what writing tidies away. A daily voice memo is a low-friction way to hear yourself think and notice patterns over time.'),

 ('Dance one song',
  'Move freely to one full song, however you want.',
  'creative', 'disc-3', 'Daily', 15,
  'One song, moving however you like. Joy and movement in a single hit.',
  E'Three minutes of moving like nobody is watching is a mood-shift you cannot argue with.\n\n**How to do it**\n- Pick one song you love and turn it up.\n- Move however the body wants. No steps, no mirror, no rules.\n- Log it when the song ends.\n\n**Why it works**\nDance is movement and expression in one. It floods you with feel-good chemistry and shakes loose whatever you have been sitting in. One song is all it takes to reset.'),

 -- ---- Human-relating ----
 ('Appreciate someone',
  'Tell one person, specifically, what you value about them.',
  'human-relating', 'heart', 'Daily', 20,
  'Tell one person what you value about them, out loud and specific.',
  E'Most appreciation stays in our heads. Today, say it out loud to one person who has earned it.\n\n**How to do it**\n- Pick one person and be specific. Not a vague compliment, the actual thing they did or are.\n- Say it, text it, or call. Just make sure it lands.\n- Log it once you have sent it.\n\n**Why it works**\nNaming what you value strengthens the bond and lifts you both. Done daily, it tilts your attention toward the good in the people around you, and makes you someone others feel good around.'),

 ('Phone-free meal',
  'Eat one meal fully present. No screens, just the food and the table.',
  'human-relating', 'utensils', 'Daily', 15,
  'One meal a day with no screens, present to the food and the people.',
  E'A meal is an easy daily anchor for presence, if you keep the phone off the table.\n\n**How to do it**\n- Pick one meal. Phone away, screens off, notifications silenced.\n- Taste the food, talk to whoever is there, or just eat slowly.\n- Log it when the plate is clear.\n\n**Why it works**\nEating without a screen turns refuelling into a real break and makes shared meals feel like connection again. It is the simplest mindfulness practice hiding in plain sight.'),

 ('Call a loved one',
  'A real voice call to someone you love, not a text.',
  'human-relating', 'phone', 'A few times a week', 20,
  'Actually call someone you love. Voice beats another text thread.',
  E'Texts keep people in the loop. Voices keep people close. Make the call.\n\n**How to do it**\n- Pick someone you have been meaning to catch up with.\n- Call. Even ten minutes. No agenda needed.\n- Log it when you hang up.\n\n**Why it works**\nHearing a familiar voice does something a thread of messages never will. A few real calls a week keep your closest relationships warm instead of slowly drifting.'),

 ('Listen fully',
  'Have one conversation where you only listen.',
  'human-relating', 'ear', 'Daily', 15,
  'One conversation today where you only listen. No fixing, no waiting to talk.',
  E'Most of us listen in order to reply. Today, in one conversation, listen only to understand.\n\n**How to do it**\n- Pick one exchange and decide: I am here to listen.\n- No fixing, no one-upping, no rehearsing your answer. Ask, then let them finish.\n- Log it afterwards.\n\n**Why it works**\nReal listening is rare enough that people feel it instantly. It deepens trust, teaches you things you would have talked over, and is a skill that quietly improves every relationship you have.'),

 -- ---- Body ----
 ('Daily walk',
  'Get your steps in, ideally outside.',
  'movement', 'footprints', 'Daily', 15,
  'A daily walk. The most underrated practice there is.',
  E'No gear, no skill, no warm-up. Just the most reliable health habit there is.\n\n**How to do it**\n- Aim for a stretch of walking you will actually repeat. Ten minutes, a loop of the block, the long way home.\n- Outside beats a treadmill, and daylight is a bonus.\n- Log it when you are back.\n\n**Why it works**\nWalking moves the body, clears the head, and digests the day all at once. It is gentle enough to never skip and powerful enough to matter, which is exactly why it sticks.'),

 ('Strength session',
  'Train your body against resistance.',
  'movement', 'dumbbell', 'A few times a week', 20,
  'Lift, push, or carry something heavy. Build the body that carries you.',
  E'Strength is the practice that protects every other one as the years add up. Train it on purpose.\n\n**How to do it**\n- Bodyweight, bands, or weights. Push, pull, squat, carry.\n- A few focused sets beat an exhausting hour. Add a little over time.\n- Log it after the last set.\n\n**Why it works**\nResistance training builds muscle, bone, and resilience you will be glad of for decades. A few sessions a week is the highest-leverage investment you can make in a body that keeps up with you.'),

 ('Time in nature',
  'Twenty minutes outside, no agenda.',
  'holistic-health', 'trees', 'Daily', 15,
  'Twenty unhurried minutes outside. Let the natural world do the work.',
  E'You do not need a mountain. A park, a garden, a tree-lined street. Twenty minutes outside resets more than you would expect.\n\n**How to do it**\n- Get to the greenest, quietest spot within reach.\n- Phone away. Walk slowly or just sit and notice the light, the leaves, the sound.\n- Log it when you head back in.\n\n**Why it works**\nTime among living things lowers stress, lifts mood, and softens the mental chatter, measurably. It is rest that asks nothing of you and gives back a steadier nervous system.'),

 -- ---- Spirit ----
 ('Evening reflection',
  'Review the day: one win, one lesson.',
  'spirituality', 'moon', 'Daily', 15,
  'Close the day on purpose: one win, one lesson, then let it go.',
  E'A day reviewed is a day you actually learn from. Take two minutes before sleep to look back.\n\n**How to do it**\n- Name one thing that went well and one thing to learn from.\n- Keep it short and honest. No spiralling, no scorekeeping.\n- Log it and let the day close.\n\n**Why it works**\nA brief nightly review turns experience into wisdom and ends the day on a note of gratitude and growth rather than leftover stress. Small reflection, compounded, is how you steer.')

) AS v(title, description, category, icon, cadence, reward_zaps, summary, body)
WHERE NOT EXISTS (SELECT 1 FROM practices p WHERE p.title = v.title);

-- 2. Link each new practice to its Pillar (domains) -------------------------
--    Assigned by meaning (category and Pillar need not align — cf. Breathwork,
--    a holistic-health practice on the Spirit Pillar). Authors can recategorize.
UPDATE practices p SET domain_id = d.id
FROM public.domains d
WHERE p.domain_id IS NULL AND d.slug = (CASE
  WHEN p.title IN ('Daily walk','Strength session','Time in nature') THEN 'body'
  WHEN p.title IN ('Phone-free meal','Evening reflection') THEN 'spirit'
  WHEN p.title IN ('Make music','One photo a day','Voice journal','Dance one song') THEN 'expression'
  WHEN p.title IN (
    'Deep work block','Read ten pages','Digital sunset','Plan tomorrow tonight',
    'Appreciate someone','Call a loved one','Listen fully'
  ) THEN 'mind'
END);

COMMIT;
