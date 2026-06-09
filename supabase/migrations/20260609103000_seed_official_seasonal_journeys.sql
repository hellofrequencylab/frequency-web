-- =============================================================================
-- Seed the 4 OFFICIAL seasonal Journeys — Summer · "The Signal" (JOURNEYS.md §2/§4/§13)
--
-- This is the canonical Season-1 official content drop (JOURNEYS.md Build Phase P4).
-- It inserts ONE official journey_plans row per Domain (Mind · Body · Spirit ·
-- Expression), nested under the active Seasonal Quest (quests, status='active'),
-- each with 4 journey_plan_items referencing existing library practices on a sensible
-- cadence mix (2× Daily · 1× 3x/week · 1× Weekly), default_tier='current', and the
-- three intensity tiers (spark/current/deep) authored on each referenced practice
-- (practice_tiers, JOURNEYS.md §5).
--
-- Completion model (JOURNEYS.md §4): season_locked=true, target_weeks=8,
-- min_practices_per_day=1, completion_gems=30 → finish at 8 qualifying weeks of 13.
--
-- These SUPERSEDE the thin auto-curated placeholders seeded by
-- 20260608010000_quests_container.sql (slug `quest-<suffix>-<domain>`): those stay
-- in place (harmless, no practices wired) but this drop is the real, themed content
-- under stable slugs `official-<suffix>-<domain>`.
--
-- IDEMPOTENT: stable slugs + ON CONFLICT / WHERE NOT EXISTS everywhere. Safe to
-- re-run. SELF-DEFENDING: the completion columns + practice_tiers table land in
-- migrations 20260609100000–102000; this re-asserts them with IF NOT EXISTS so the
-- seed never fails on apply order. All additive.
-- =============================================================================

BEGIN;

-- 0. Self-defend: ensure the columns + table this seed writes exist (no-ops if the
--    P0 schema migrations already created them). Additive + idempotent. ----------
ALTER TABLE public.journey_plans
  ADD COLUMN IF NOT EXISTS status                text    NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS season_locked         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_weeks          integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS min_practices_per_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completion_gems       integer NOT NULL DEFAULT 30;

ALTER TABLE public.journey_plan_items
  ADD COLUMN IF NOT EXISTS default_tier text NOT NULL DEFAULT 'current';

CREATE TABLE IF NOT EXISTS public.practice_tiers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  tier        text NOT NULL CHECK (tier IN ('spark','current','deep')),
  title       text NOT NULL,
  body        text,
  est_minutes integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (practice_id, tier)
);
ALTER TABLE public.practice_tiers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "practice_tiers: public read" ON public.practice_tiers FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 1. Intensity tiers (Spark / Current / Deep) for every practice these Journeys
--    reference. Authored once on the practice; reused everywhere (JOURNEYS.md §5).
--    Keyed by practice TITLE (system practices have unique titles). ON CONFLICT on
--    (practice_id, tier) makes re-runs idempotent.
-- =============================================================================
INSERT INTO public.practice_tiers (practice_id, tier, title, body, est_minutes)
SELECT p.id, v.tier, v.title, v.body, v.est_minutes
FROM (VALUES
  -- ---- Mind · Clear Channel ----
  ('Deep work block', 'spark',   'One clear sprint',        'Twenty-five minutes, one task, phone in another room. The worst-day version still beats a fragmented hour.', 25),
  ('Deep work block', 'current', 'A protected block',       'Forty-five focused minutes on the thing that moves your life forward. Tabs closed, notifications off, one screen.', 45),
  ('Deep work block', 'deep',    'Deep work session',       'Ninety minutes of uninterrupted single-tasking, plus a five-minute review of what you shipped. Plan the block the night before.', 90),

  ('Digital sunset', 'spark',   'Phone on charge',          'Thirty minutes before bed, the phone goes on charge in another room. One small wall against the late-night scroll.', 5),
  ('Digital sunset', 'current', 'Screens down for the night','One hour before sleep, all screens off. Swap the scroll for a book, a stretch, or nothing at all.', 15),
  ('Digital sunset', 'deep',    'Full evening runway',      'Ninety screen-free minutes: dim the lights, wind down analogue, and let the nervous system find the off-ramp.', 30),

  ('Read ten pages', 'spark',   'Open the book',            'Three pages of anything real. The point is opening the cover, not finishing the chapter.', 5),
  ('Read ten pages', 'current', 'Ten pages',                'Ten pages of a real book — paper or screen, fiction or not. Small enough to never skip.', 15),
  ('Read ten pages', 'deep',    'A reading hour',           'A full undistracted hour with one book, ending with a sentence on what stayed with you.', 60),

  ('Plan tomorrow tonight', 'spark',   'Name the one thing',  'Before you sleep, write the single most important thing for tomorrow where you will see it first.', 3),
  ('Plan tomorrow tonight', 'current', 'Top three for tomorrow','Three things that would make tomorrow a win, written tonight so you wake up already aimed.', 10),
  ('Plan tomorrow tonight', 'deep',    'Weekly intention map','Map the top three across the week ahead and block the time for them, so the week stops drifting.', 25),

  -- ---- Body · Strong Signal ----
  ('Daily walk', 'spark',   'A ten-minute loop',     'Ten minutes of walking, ideally outside. The most reliable health habit there is, at its lowest bar.', 10),
  ('Daily walk', 'current', 'Get the steps in',      'A real walk — twenty to thirty minutes outside, daylight on your face, head clearing as you go.', 25),
  ('Daily walk', 'deep',    'The long walk',         'An hour or more on foot with no phone: a moving meditation that digests the whole day.', 60),

  ('Mobility flow', 'spark',   'Five honest minutes',  'Hips, spine, shoulders, ankles — slow circles, full range, five minutes you will actually repeat.', 5),
  ('Mobility flow', 'current', 'Mobility flow',        'Fifteen minutes moving the joints you ignore all day, breathing into the tight spots instead of forcing them.', 15),
  ('Mobility flow', 'deep',    'Full mobility practice','Thirty minutes of guided mobility and stretch, working every major joint through its end range.', 30),

  ('Strength session', 'spark',   'A few quick sets',   'Ten minutes of bodyweight: push, pull, squat, carry. Move against resistance, however small.', 10),
  ('Strength session', 'current', 'Strength session',   'A focused half hour of resistance — bands, weights, or bodyweight. Add a little over time.', 30),
  ('Strength session', 'deep',    'Full training block', 'A complete progressive session: warm-up, main lifts, accessory work. Build the body that carries you for decades.', 60),

  ('Time in nature', 'spark',   'Step outside',         'Five minutes outside under the sky, phone away. A park bench, a garden, a tree-lined street.', 5),
  ('Time in nature', 'current', 'Twenty minutes outside','Twenty unhurried minutes among living things — walk slowly or just sit and notice the light.', 20),
  ('Time in nature', 'deep',    'A nature immersion',   'An hour-plus in the greenest, quietest place within reach. No agenda, no screen, just the natural world.', 60),

  -- ---- Spirit · Tune In ----
  ('Morning sit', 'spark',   'Five before screens',   'Five minutes of stillness, eyes closed, before the inputs start. No agenda, just the breath.', 5),
  ('Morning sit', 'current', 'Morning sit',           'Fifteen minutes following the breath, same seat, same time. Returning when the mind wanders is the practice.', 15),
  ('Morning sit', 'deep',    'Extended sit',          'Thirty minutes of sitting practice, breath work into the silence, before any device is touched.', 30),

  ('Gratitude journal', 'spark',   'One good thing',     'Name one specific good thing from the last day. Thirty seconds is plenty.', 2),
  ('Gratitude journal', 'current', 'Three specifics',    'Three concrete things you are grateful for — the actual moments, not the categories. Same notebook, same time.', 10),
  ('Gratitude journal', 'deep',    'A gratitude letter', 'Write at length to someone or something you appreciate, tracing exactly why it matters. Send it if you can.', 20),

  ('Breathwork reset', 'spark',   'A few rounds',       'Inhale four, exhale six, for two minutes. The fastest lever you have on a wound-up system.', 3),
  ('Breathwork reset', 'current', 'Breathwork reset',   'Ten minutes of down-regulating breath — long, slow exhales — somewhere you will not be interrupted.', 12),
  ('Breathwork reset', 'deep',    'A full breath journey','Twenty-plus minutes of structured breathwork, ideally guided. Set time and space; it goes deep.', 25),

  ('Sound bath sit', 'spark',   'One resonant track',  'Lie down and let one long resonant track wash over you. Nothing to achieve, nowhere to get to.', 10),
  ('Sound bath sit', 'current', 'Sound bath sit',      'Twenty-five minutes resting in sustained tones — a session or a long track at home. Let the sound do the work.', 25),
  ('Sound bath sit', 'deep',    'A full sound bath',   'A facilitated sound bath or a long deliberate session: drop the mind fully out of its planning loop and into the body.', 60),

  -- ---- Expression · Broadcast ----
  ('Daily sketch', 'spark',   'One quick mark',        'Five minutes, one subject — your coffee, your hand, the view. Done beats good.', 5),
  ('Daily sketch', 'current', 'Daily sketch',          'Fifteen minutes on one subject, filling the page. Keep the channel open; the eye improves on its own.', 15),
  ('Daily sketch', 'deep',    'A finished study',      'A deliberate forty-five-minute study — composition, value, detail. Push one drawing as far as it will go.', 45),

  ('Voice journal', 'spark',   'Two minutes out loud',  'Hit record and talk for two minutes. Whatever is on your mind, no script, no re-listening.', 3),
  ('Voice journal', 'current', 'Voice journal',         'Ten minutes thinking out loud on the record. Speaking surfaces what writing tidies away.', 10),
  ('Voice journal', 'deep',    'A spoken reflection',   'A longer recorded reflection on a real question, then a listen-back to hear the patterns in how you think.', 25),

  ('Make music', 'spark',   'Hum a tune',             'A couple of minutes of making sound — hum, sing in the shower, tap out a rhythm. For the play of it.', 3),
  ('Make music', 'current', 'Make music',             'Fifteen minutes with an instrument or your voice, no audience, no recording. Play for the play of it.', 15),
  ('Make music', 'deep',    'A music session',        'A real practice or writing session: work a piece, build a loop, or jam until you lose track of time.', 45),

  ('Dance one song', 'spark',   'Move for one song',   'One song you love, turned up, moving however the body wants. No steps, no mirror.', 4),
  ('Dance one song', 'current', 'Dance one song',      'A full song of free movement — joy and movement in a single hit. Let it shake loose whatever you have been sitting in.', 4),
  ('Dance one song', 'deep',    'A dance set',         'Three or four songs back to back: a proper sweat, moving like nobody is watching, until the head is fully clear.', 20)
) AS v(p_title, tier, title, body, est_minutes)
JOIN public.practices p ON p.title = v.p_title AND p.created_by IS NULL
ON CONFLICT (practice_id, tier) DO NOTHING;

-- =============================================================================
-- 2. The 4 official Journeys + their 4 items each. Resolves the active season +
--    active Seasonal Quest at apply time, so the seed binds to whatever season is
--    live. Stable slugs `official-<suffix>-<domain>` make it idempotent.
-- =============================================================================
DO $$
DECLARE
  v_season     int;
  v_suffix     text;
  v_quest_id   uuid;
  v_domain_id  uuid;
  v_plan_id    uuid;
  j            record;
  it           record;
BEGIN
  -- Active season number (fallback: highest, then 1) → suffix for slugs.
  SELECT season_number INTO v_season FROM public.seasons WHERE status = 'active' LIMIT 1;
  IF v_season IS NULL THEN
    SELECT max(season_number) INTO v_season FROM public.seasons;
  END IF;
  v_suffix := coalesce(v_season::text, 'evergreen');

  -- Active Seasonal Quest. Prefer the season-scoped one seeded by quests_container;
  -- fall back to any active quest. If none exists, this seed is a no-op (degrades
  -- gracefully rather than orphaning journeys).
  SELECT id INTO v_quest_id FROM public.quests
   WHERE status = 'active' AND (season = v_season OR season IS NULL)
   ORDER BY (season = v_season) DESC, sort_order ASC LIMIT 1;
  IF v_quest_id IS NULL THEN
    SELECT id INTO v_quest_id FROM public.quests WHERE status = 'active' ORDER BY sort_order ASC LIMIT 1;
  END IF;
  IF v_quest_id IS NULL THEN
    RAISE NOTICE 'No active Seasonal Quest — skipping official Journey seed.';
    RETURN;
  END IF;

  -- One pass per Domain Journey. Each row: domain slug, slug-suffix-free identity,
  -- emoji, accent token, intro (markdown), summary, and its 4 (practice_title,
  -- cadence, sort) items in a sensible mix: 2× Daily · 1× A few times a week · 1× Weekly.
  FOR j IN
    SELECT * FROM (VALUES
      ('mind', 'Clear Channel', '🧠', 'indigo',
       E'Summer''s signal is everywhere — and so is the noise. **Clear Channel** is about reclaiming your attention: the rarest, most contested resource you own. Each practice cuts interference and tunes the mind back to what actually matters.\n\nFour weeks in, you will notice the difference not in the app, but in the room you are actually standing in.',
       'Reclaim your attention. Four practices that cut the noise and tune the mind back to what matters this season.'),
      ('body', 'Strong Signal', '🔋', 'jade',
       E'Your body is the transmitter — every clear thought rides on it. **Strong Signal** keeps the carrier wave strong: move daily, build resilience, and get outside under the summer sky.\n\nNothing heroic, nothing you can''t sustain. Just the handful of physical practices that keep every other signal in your life coming through clean.',
       'Keep the carrier wave strong. Move, build, and get outside — the body that carries every other practice.'),
      ('spirit', 'Tune In', '🧘', 'plum',
       E'Underneath the noise there is a frequency that is just yours. **Tune In** is the season''s stillness practice: sit, breathe, give thanks, and let the inner signal come back into focus.\n\nThis is the quiet centre of The Signal — the one Journey that asks you to do less, more deliberately, until you can hear yourself again.',
       'Find the frequency that''s just yours. Stillness, breath, and gratitude to bring the inner signal back into focus.'),
      ('expression', 'Broadcast', '🎨', 'gold',
       E'A signal received is only half of it — the other half is the one you send. **Broadcast** is about putting your frequency into the world: a mark, a voice, a sound, a movement, every day.\n\nNo audience required, no polish demanded. Just the daily reps that keep your creative channel open and, over a season, unmistakably yours.',
       'Send your signal into the world. Daily creative reps — mark, voice, sound, movement — that keep the channel open.')
    ) AS t(domain_slug, title, emoji, accent, intro, summary)
  LOOP
    SELECT id INTO v_domain_id FROM public.domains WHERE slug = j.domain_slug;
    CONTINUE WHEN v_domain_id IS NULL;

    INSERT INTO public.journey_plans
      (slug, title, summary, intro, emoji, accent, visibility, official, quest_id,
       status, season_locked, target_weeks, min_practices_per_day, completion_gems, published_at)
    VALUES
      ('official-' || v_suffix || '-' || j.domain_slug, j.title, j.summary, j.intro, j.emoji, j.accent,
       'public', true, v_quest_id,
       'approved', true, 8, 1, 30, now())
    ON CONFLICT (slug) DO NOTHING;

    SELECT id INTO v_plan_id FROM public.journey_plans
     WHERE slug = 'official-' || v_suffix || '-' || j.domain_slug;
    CONTINUE WHEN v_plan_id IS NULL;

    -- Always keep official metadata authoritative even if the row pre-existed (e.g.
    -- a prior partial run before the columns landed). Pure metadata, no content loss.
    UPDATE public.journey_plans SET
      official = true, quest_id = v_quest_id, status = 'approved',
      visibility = 'public', season_locked = true, target_weeks = 8,
      min_practices_per_day = 1, completion_gems = 30,
      published_at = coalesce(published_at, now())
    WHERE id = v_plan_id;

    -- The 4 items for this Journey, mixed cadence (2× Daily · 1× A few times a week ·
    -- 1× Weekly). Reuse existing system practices. One static items table, filtered
    -- to this Domain. Pick the single matching system practice (created_by IS NULL).
    FOR it IN
      SELECT i.p_title, i.cadence, i.sort_order
      FROM (VALUES
        ('mind',       'Deep work block',       'Daily',               1),
        ('mind',       'Digital sunset',        'Daily',               2),
        ('mind',       'Read ten pages',        'A few times a week',  3),
        ('mind',       'Plan tomorrow tonight', 'Weekly',              4),
        ('body',       'Daily walk',            'Daily',               1),
        ('body',       'Mobility flow',         'Daily',               2),
        ('body',       'Strength session',      'A few times a week',  3),
        ('body',       'Time in nature',        'Weekly',              4),
        ('spirit',     'Morning sit',           'Daily',               1),
        ('spirit',     'Gratitude journal',     'Daily',               2),
        ('spirit',     'Breathwork reset',      'A few times a week',  3),
        ('spirit',     'Sound bath sit',        'Weekly',              4),
        ('expression', 'Daily sketch',          'Daily',               1),
        ('expression', 'Voice journal',         'Daily',               2),
        ('expression', 'Make music',            'A few times a week',  3),
        ('expression', 'Dance one song',        'Weekly',              4)
      ) AS i(domain_slug, p_title, cadence, sort_order)
      WHERE i.domain_slug = j.domain_slug
      ORDER BY i.sort_order
    LOOP
      INSERT INTO public.journey_plan_items
        (plan_id, practice_id, domain_id, cadence, default_tier, sort_order, note)
      SELECT v_plan_id, p.id, v_domain_id, it.cadence, 'current', it.sort_order, NULL
      FROM public.practices p
      WHERE p.title = it.p_title AND p.created_by IS NULL
      ORDER BY p.created_at
      LIMIT 1
      ON CONFLICT (plan_id, practice_id) DO UPDATE
        SET cadence = excluded.cadence, sort_order = excluded.sort_order,
            default_tier = excluded.default_tier, domain_id = excluded.domain_id;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
