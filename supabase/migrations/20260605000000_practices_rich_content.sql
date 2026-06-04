-- =====================================================================
-- Practices: rich content + gamification rewards
-- =====================================================================
-- The practices library started thin (title + description). This migration
-- evolves it into a presentation-ready, rewardable surface so a practice can
-- carry a header image, a one-line "information" summary, long-form rich
-- content (markdown body), a topical category + icon for grouping, a cadence
-- hint, and a per-practice zap reward override (with a human-readable note).
--
-- Reward model (unchanged North-Star guardrail): rewards attach to the DOING.
-- logPractice() already awards ZAP_AMOUNTS.practice_logged (15) + a streak
-- tick; `reward_zaps` lets a heavier practice (a cold plunge, a dawn surf)
-- override that amount. lib/practices.ts passes it as the override; null =
-- fall back to the default. See docs/DECISIONS.md (ADR for this change).
--
-- Categories mirror the topical_channels taxonomy so the library groups the
-- same way circles do: movement | holistic-health | spirituality | creative |
-- business-support | human-relating.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE-by-title (all 16 existing
-- titles are unique). Safe to re-run.
-- =====================================================================

BEGIN;

-- 1. Schema -----------------------------------------------------------------
ALTER TABLE practices ADD COLUMN IF NOT EXISTS category     text;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS icon         text NOT NULL DEFAULT 'sparkles';
ALTER TABLE practices ADD COLUMN IF NOT EXISTS summary      text;          -- one-line "information"
ALTER TABLE practices ADD COLUMN IF NOT EXISTS header_image text;          -- header image URL
ALTER TABLE practices ADD COLUMN IF NOT EXISTS body         text;          -- long-form rich content (markdown)
ALTER TABLE practices ADD COLUMN IF NOT EXISTS cadence      text;          -- e.g. 'Daily', 'Weekly', 'As needed'
ALTER TABLE practices ADD COLUMN IF NOT EXISTS reward_zaps  integer;       -- per-log zap override (null = default 15)
ALTER TABLE practices ADD COLUMN IF NOT EXISTS reward_note  text;          -- human-readable reward, e.g. '+20 zaps · streak +1'

CREATE INDEX IF NOT EXISTS practices_category_idx ON practices (category, created_at DESC);

COMMENT ON COLUMN practices.reward_zaps IS
  'Per-log zap override passed to logPractice(); null falls back to ZAP_AMOUNTS.practice_logged (15). Rewards the doing, not the reading.';

-- 2. Backfill the 16 existing practices (5 core + 11 demo) -------------------
--    Keyed by title (all unique). header_image is a deterministic placeholder
--    so re-runs are stable; swap for curated art later.
UPDATE practices p SET
  category     = v.category,
  icon         = v.icon,
  cadence      = v.cadence,
  reward_zaps  = v.reward_zaps,
  reward_note  = '+' || v.reward_zaps || ' zaps · streak +1',
  summary      = v.summary,
  body         = v.body,
  header_image = 'https://picsum.photos/seed/practice-'
                 || regexp_replace(lower(p.title), '[^a-z0-9]+', '-', 'g')
                 || '/1200/500'
FROM (VALUES
 -- title, category, icon, cadence, reward_zaps, summary, body(markdown)
 ('Dawn patrol surf', 'movement', 'waves', 'Daily', 20,
  'Paddle out at first light and trade a few waves before the day begins.',
  E'Set an alarm you will actually answer. The reward is the water before the world wakes up.\n\n**How to do it**\n- Check the surf report the night before and lay your gear by the door.\n- Be wet by sunrise. Even a short session counts.\n- Log it when you towel off.\n\n**Why it works**\nCold water, movement, and a horizon line first thing resets your whole nervous system. Do it with the crew and it becomes the best standing appointment of your week.'),
 ('Daily run', 'movement', 'footprints', 'Daily', 15,
  'Lace up and run — any distance, any pace. The only goal is out the door.',
  E'The hardest step is the front door. Make the bar low enough that you never get to say no.\n\n**How to do it**\n- Commit to ten minutes. You can always stop at ten; you rarely will.\n- Same shoes, same spot, same time — let the habit carry you.\n- Log every run, even the slow ones. Especially the slow ones.\n\n**Why it works**\nConsistency beats intensity. A daily easy run builds the aerobic base, the discipline, and the streak that pulls you back tomorrow.'),
 ('Mobility flow', 'movement', 'activity', 'Daily', 15,
  'A few minutes of mobility to keep the body open, easy, and pain-free.',
  E'You do not need a mat or a class. You need five honest minutes of moving the joints you ignore all day.\n\n**How to do it**\n- Hips, spine, shoulders, ankles — slow circles, full range.\n- Breathe into the tight spots instead of forcing them.\n- Log it as part of your morning or your wind-down.\n\n**Why it works**\nSmall daily mobility keeps you off the injury sidelines and makes every other practice — surf, run, lift — feel better.'),
 ('Cold plunge', 'holistic-health', 'snowflake', 'Daily', 25,
  'A short cold immersion to wake up the system and build real resilience.',
  E'Two minutes of discomfort you choose makes the rest of the day''s discomforts smaller.\n\n**How to do it**\n- Tub, ocean, or the cold tap at the end of a shower — all count.\n- Long, slow exhale as you get in. Do not fight the gasp, ride it.\n- Start with one minute. Build to two or three.\n\n**Why it works**\nThe cold trains your nervous system to stay calm under stress. The afterglow — alert, clear, weirdly happy — is the hook.'),
 ('Breathwork reset', 'holistic-health', 'wind', 'Daily', 15,
  'A short, intentional breathing round to settle the nervous system.',
  E'Your breath is the one lever on the nervous system you can pull on demand. Use it.\n\n**How to do it**\n- Down-regulate: inhale four, exhale six to eight, for a few minutes.\n- Sit or lie somewhere you will not be interrupted.\n- Log it whenever you use it — morning, midday slump, or before sleep.\n\n**Why it works**\nA longer exhale tells your body the threat has passed. A few minutes can take you from wound-up to settled without changing a single thing about your day.'),
 ('Sound bath sit', 'holistic-health', 'radio', 'Weekly', 15,
  'Sit and let the tones wash over you. Rest in the resonance.',
  E'Nothing to achieve, nowhere to get to. Your only job is to lie down and let go.\n\n**How to do it**\n- Find a session, or put on a long resonant track at home.\n- Get comfortable, close your eyes, let the sound do the work.\n- Log it after — notice how the week feels lighter.\n\n**Why it works**\nSustained tones drop the mind out of its planning loop and into the body. It is rest that actually restores.'),
 ('Morning sit', 'spirituality', 'sunrise', 'Daily', 15,
  'Sit in stillness and follow the breath for a few quiet minutes.',
  E'Ten quiet minutes before the inputs start changes the whole shape of the day.\n\n**How to do it**\n- Same seat, same time. Set a gentle timer.\n- Follow the breath. When the mind wanders — and it will — come back. That returning is the practice.\n- Log it and move into your morning a little steadier.\n\n**Why it works**\nYou are not trying to empty your mind. You are practising noticing where it goes, which is the skill that makes every hour after calmer.'),
 ('Gratitude journal', 'spirituality', 'notebook-pen', 'Daily', 15,
  'Write down a few things you are grateful for this morning.',
  E'Attention is a muscle, and gratitude is how you point it at what is already good.\n\n**How to do it**\n- Three specific things. Not "my health" — "the way the light hit the water on the walk".\n- Same notebook, same time, thirty seconds is plenty.\n- Log it and notice the lens stay tilted toward the good all day.\n\n**Why it works**\nNaming the good rewires what your brain scans for. Do it daily and the default setting of your attention slowly changes.'),
 ('Daily sketch', 'creative', 'pencil', 'Daily', 15,
  'One quick sketch a day. No judgement — just marks on paper.',
  E'The sketchbook is not for masterpieces. It is for keeping the channel open.\n\n**How to do it**\n- Five minutes, one subject — your coffee, your hand, the view.\n- Done beats good. Fill the page and close the book.\n- Log it. Watch the pages — and your eye — get better over a month.\n\n**Why it works**\nDaily reps lower the stakes of any single drawing, which is exactly what frees you up to actually improve.'),
 ('250 words', 'creative', 'pen-line', 'Daily', 15,
  'Write 250 words. Anything. Build the habit before the polish.',
  E'Two hundred and fifty words is small enough to start and big enough to matter. Do it before you are ready.\n\n**How to do it**\n- No editing, no rereading — just forward motion until you hit the count.\n- Morning pages, a journal, the scene you are stuck on — all count.\n- Log it the moment you cross 250.\n\n**Why it works**\nThe blank page loses its power when you face it daily. Quantity, kept up, quietly becomes quality.'),
 ('Reach out to one person', 'business-support', 'send', 'Daily', 20,
  'Send one genuine message to one person who matters to your work.',
  E'Opportunities live in relationships, and relationships are kept warm one message at a time.\n\n**How to do it**\n- One person, one real message — no mass blast, no ask required.\n- A check-in, a thank-you, a useful link, a genuine question.\n- Log it. One a day is a few hundred warm connections a year.\n\n**Why it works**\nMost good things — clients, collaborators, jobs, advice — arrive through people who remember you. This is how you stay rememberable.'),
 -- ---- the original five core practices ----
 ('Daily meditation', 'spirituality', 'brain', 'Daily', 15,
  'Sit in stillness for a few minutes and follow the breath.',
  E'A short daily sit is the most portable, lowest-cost practice there is. All you need is a chair and a few minutes.\n\n**How to do it**\n- Set a timer for five to ten minutes.\n- Rest attention on the breath; gently return whenever it wanders.\n- Log it and carry the steadiness into your day.\n\n**Why it works**\nThe practice is not the absence of thoughts — it is the gentle, repeated act of beginning again. That is a skill that pays off everywhere.'),
 ('Morning movement', 'movement', 'sunrise', 'Daily', 15,
  'Move your body to start the day: stretch, walk, or flow.',
  E'Motion first thing tells your body it is time to be awake and your mind it is time to begin.\n\n**How to do it**\n- Stretch, a short walk, a few sun salutations — pick what you will actually do.\n- Keep it gentle and undemanding so you never skip it.\n- Log it and let it be the on-ramp to the rest of your day.\n\n**Why it works**\nEarly movement lifts mood and energy and makes the harder practices later feel possible.'),
 ('Breathwork', 'holistic-health', 'wind', 'As needed', 15,
  'A short, intentional breathing practice.',
  E'A handful of conscious breaths is a reset button you carry everywhere.\n\n**How to do it**\n- Slow the breath, lengthen the exhale, drop the shoulders.\n- A few rounds is enough to shift your state.\n- Log it whenever you reach for it.\n\n**Why it works**\nDeliberate breathing is the fastest, cheapest way to change how you feel right now.'),
 ('Gratitude journaling', 'spirituality', 'notebook-pen', 'Daily', 15,
  'Write down a few things you are grateful for.',
  E'A few lines a day, kept up, slowly retrains where your attention lands.\n\n**How to do it**\n- Name a few specific good things from the last day.\n- Be concrete; specifics land deeper than generalities.\n- Log it and let the habit tilt your outlook.\n\n**Why it works**\nWhat you practise noticing is what you start to see more of.'),
 ('Cold exposure', 'holistic-health', 'snowflake', 'Daily', 25,
  'A cold shower or plunge to build resilience.',
  E'Choosing a little discomfort on purpose makes the unchosen kind easier to meet.\n\n**How to do it**\n- End your shower cold, or find a tub or the ocean.\n- Long exhale on the way in; stay calm and breathe.\n- Log it and ride the clear-headed afterglow.\n\n**Why it works**\nThe cold is controllable stress you can practise staying calm inside of — and that calm transfers to everything else.')
) AS v(title, category, icon, cadence, reward_zaps, summary, body)
WHERE p.title = v.title;

COMMIT;
