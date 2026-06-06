-- =============================================================================
-- Starter content: bonus micro-journeys + a few library practices (ADR-140)
--
-- ECONOMY-AND-JOURNEYS §5 asks each season for the 4 primary Pillar Journeys
-- (seeded already) PLUS a handful of short "micro-journeys" (point-rackers). And
-- the library wants a spine of system-curated starter practices across the four
-- Pillars. All idempotent.
-- =============================================================================

-- ── Micro-journeys (short, opt-in quest chains) ──────────────────────────────
insert into quest_chains (slug, name, description, icon, season, domain_id, zaps_reward, sort_order)
select v.slug, v.name, v.description, v.icon,
       coalesce((select season_number from seasons where status = 'active' limit 1), 1),
       (select id from domains where slug = v.domain),
       v.zaps_reward, v.sort_order
from (values
  ('first-week',     'First Week',     'Your opening move: say hello, then show up to one thing.',        'sparkles', null,         50, 210),
  ('creative-spark', 'Creative Spark', 'A quick maker''s streak — share something, then make it three.',  'palette',  'expression', 20, 220)
) as v(slug, name, description, icon, domain, zaps_reward, sort_order)
on conflict (slug) do nothing;

-- First Week — post (gems) → attend (zaps)
insert into quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
select qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
from quest_chains qc cross join (values
  (1, 'Say hello',      'Share your first post',            '{"type":"post_create"}',  1, 5),
  (2, 'Show up once',   'Attend a gathering (check in)',    '{"type":"event_attend"}', 1, 25)
) as s(step_order, name, description, criteria, target, zaps_reward)
where qc.slug = 'first-week'
on conflict (chain_id, step_order) do nothing;

-- Creative Spark — post (gems) → post x3 (gems)
insert into quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
select qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
from quest_chains qc cross join (values
  (1, 'Share a spark',  'Post something you made',          '{"type":"post_create"}', 1, 6),
  (2, 'Make it three',  'Share three posts in total',       '{"type":"post_create"}', 3, 10)
) as s(step_order, name, description, criteria, target, zaps_reward)
where qc.slug = 'creative-spark'
on conflict (chain_id, step_order) do nothing;

-- ── Starter library practices (system-owned templates, one+ per Pillar) ──────
insert into public.practices
  (title, summary, description, body, cadence, category, icon, domain_id, is_public, is_template, reward_zaps, reward_note)
select v.title, v.summary, v.description, v.body, v.cadence, v.category, v.icon,
       (select id from public.domains where slug = v.domain),
       true, true, v.reward_zaps, '+' || v.reward_zaps || ' zaps · streak +1'
from (values
  ('Morning Movement', 'Move your body for ten minutes before the day starts.',
   'A short, daily movement practice to wake the body up.',
   'Roll out of bed and move for ten minutes — stretch, walk, flow, or shake out. No equipment, no rules. The point is to meet the day in your body.',
   'Daily', 'movement', 'activity', 'body', 12),
  ('Cold Plunge', 'Two minutes of cold to start the day awake.',
   'A cold shower or plunge to build resilience and presence.',
   'End your shower with two minutes of cold, or find water cold enough to make you breathe. Slow the breath, stay with it, step out clearer than you went in.',
   'Daily', 'movement', 'snowflake', 'body', 20),
  ('Daily Pages', 'Three pages, longhand, first thing.',
   'A free-writing practice to clear the mind.',
   'Before the feeds, write three pages by hand — whatever''s there. No editing, no audience. It empties the noise and surfaces what matters.',
   'Daily', 'reflection', 'pen-tool', 'mind', 10),
  ('Ten-Minute Read', 'Ten pages of something that grows you.',
   'A daily reading habit for curiosity and growth.',
   'Read ten minutes of a book that stretches you — not a feed, not the news. Small and daily compounds into a different mind over a season.',
   'Daily', 'learning', 'book-open', 'mind', 8),
  ('Sit in Stillness', 'Ten minutes of breath and quiet.',
   'A simple seated meditation.',
   'Sit, set a timer for ten minutes, and follow the breath. When the mind wanders — and it will — come back. That returning is the practice.',
   'Daily', 'meditation', 'sparkles', 'spirit', 12),
  ('Gratitude Note', 'Name three things, write one down.',
   'A short evening gratitude practice.',
   'Before sleep, name three things from the day and write one down. It retrains attention toward what''s working, and it''s a quiet way to close the day.',
   'Daily', 'reflection', 'heart', 'spirit', 6),
  ('Make One Thing', 'Make something small, every day.',
   'A daily creative practice — a sketch, a verse, a riff.',
   'Make one small thing and let it be imperfect — a sketch, four lines, a melody, a photo. The streak matters more than the masterpiece.',
   'Daily', 'creative', 'palette', 'expression', 10)
) as v(title, summary, description, body, cadence, category, icon, domain, reward_zaps)
where not exists (
  select 1 from public.practices p where p.title = v.title and p.is_template = true
);
