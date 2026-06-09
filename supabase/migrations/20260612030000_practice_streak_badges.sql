-- =============================================================================
-- Daily practice-streak achievement badges (BUILD-LIST P5 — "daily-streak
-- achievement badges").
--
-- The DAILY practice streak (profiles.current_streak, owned by
-- lib/practice-streak.ts per ADR-145) is the headline streak members feel, but
-- the achievement catalog only badged the WEEKLY `streaks`-table types
-- (attendance / posting). These three badge the daily habit itself. New
-- `practice_streak` criteria type: evaluated on every practice log
-- (processGamificationEvent 'practice_log' in lib/practices.ts) against
-- profiles.current_streak; pays ZAPS (real-world consistency — ADR-139,
-- ZAP_CRITERIA_TYPES in lib/engagement/currency.ts).
--
-- Idempotent (ON CONFLICT slug DO NOTHING). sort_order continues the existing
-- streak-category band (10–50 used).
-- =============================================================================

INSERT INTO achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, sort_order) VALUES
  ('practice-streak-7',   'Week of Devotion',   'Log a practice 7 days in a row',           'flame',    'streak', 'bronze',   '{"type":"practice_streak","count":7}',   25,  60),
  ('practice-streak-30',  'Moon Cycle',         'Log a practice 30 days in a row',          'moon',     'streak', 'gold',     '{"type":"practice_streak","count":30}',  100, 70),
  ('practice-streak-100', 'Hundred Days Deep',  'Log a practice 100 days in a row',         'mountain', 'streak', 'platinum', '{"type":"practice_streak","count":100}', 250, 80)
ON CONFLICT (slug) DO NOTHING;
