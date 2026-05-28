-- =============================================================================
-- Migration: Gamification System — Achievements, Streaks, Season Challenges
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

CREATE TYPE achievement_tier AS ENUM ('bronze', 'silver', 'gold', 'platinum');
CREATE TYPE achievement_category AS ENUM (
  'social', 'events', 'content', 'leadership', 'streak', 'seasonal', 'special'
);
CREATE TYPE streak_type AS ENUM ('attendance', 'posting', 'hosting', 'login');
CREATE TYPE challenge_difficulty AS ENUM ('easy', 'normal', 'hard', 'legendary');

-- ---------------------------------------------------------------------------
-- 2. achievements — catalogue of all earnable badges/achievements
-- ---------------------------------------------------------------------------

CREATE TABLE achievements (
  id          uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text               UNIQUE NOT NULL,
  name        text               NOT NULL,
  description text               NOT NULL,
  icon        text               NOT NULL DEFAULT 'award',
  category    achievement_category NOT NULL,
  tier        achievement_tier   NOT NULL DEFAULT 'bronze',
  criteria    jsonb              NOT NULL DEFAULT '{}',
  zaps_reward integer            NOT NULL DEFAULT 0,
  is_secret   boolean            NOT NULL DEFAULT false,
  sort_order  integer            NOT NULL DEFAULT 0,
  created_at  timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX idx_achievements_category ON achievements (category);
CREATE INDEX idx_achievements_tier     ON achievements (tier);
CREATE INDEX idx_achievements_slug     ON achievements (slug);

-- ---------------------------------------------------------------------------
-- 3. user_achievements — join table tracking which profiles earned which
-- ---------------------------------------------------------------------------

CREATE TABLE user_achievements (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  achievement_id uuid        NOT NULL REFERENCES achievements (id) ON DELETE CASCADE,
  unlocked_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, achievement_id)
);

CREATE INDEX idx_user_achievements_profile     ON user_achievements (profile_id);
CREATE INDEX idx_user_achievements_achievement ON user_achievements (achievement_id);
CREATE INDEX idx_user_achievements_unlocked    ON user_achievements (unlocked_at);

-- ---------------------------------------------------------------------------
-- 4. streaks — per-user, per-type streak tracking
-- ---------------------------------------------------------------------------

CREATE TABLE streaks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  streak_type      streak_type NOT NULL,
  current_count    integer     NOT NULL DEFAULT 0,
  longest_count    integer     NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  freeze_tokens    integer     NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, streak_type)
);

CREATE INDEX idx_streaks_profile ON streaks (profile_id);
CREATE INDEX idx_streaks_type    ON streaks (streak_type);

-- ---------------------------------------------------------------------------
-- 5. season_challenges — challenges defined per 13-week season
-- ---------------------------------------------------------------------------

CREATE TABLE season_challenges (
  id          uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  season      integer              NOT NULL DEFAULT 1,
  slug        text                 NOT NULL,
  name        text                 NOT NULL,
  description text                 NOT NULL,
  category    achievement_category NOT NULL,
  difficulty  challenge_difficulty NOT NULL DEFAULT 'normal',
  criteria    jsonb                NOT NULL DEFAULT '{}',
  target      integer              NOT NULL DEFAULT 1,
  zaps_reward integer              NOT NULL DEFAULT 50,
  sort_order  integer              NOT NULL DEFAULT 0,
  created_at  timestamptz          NOT NULL DEFAULT now(),
  UNIQUE (season, slug)
);

CREATE INDEX idx_season_challenges_season ON season_challenges (season);

-- ---------------------------------------------------------------------------
-- 6. challenge_progress — per-user progress on each challenge
-- ---------------------------------------------------------------------------

CREATE TABLE challenge_progress (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  challenge_id uuid        NOT NULL REFERENCES season_challenges (id) ON DELETE CASCADE,
  current      integer     NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, challenge_id)
);

CREATE INDEX idx_challenge_progress_profile   ON challenge_progress (profile_id);
CREATE INDEX idx_challenge_progress_challenge ON challenge_progress (challenge_id);

-- ---------------------------------------------------------------------------
-- 7. Add gamification fields to profiles
-- ---------------------------------------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS lifetime_zaps     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS achievement_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak    integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 8. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE achievements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_challenges  ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;

-- achievements: public read, admin write
CREATE POLICY "achievements: public read"
  ON achievements FOR SELECT USING (true);

CREATE POLICY "achievements: mentor insert"
  ON achievements FOR INSERT
  WITH CHECK (get_my_role() = 'mentor');

CREATE POLICY "achievements: mentor update"
  ON achievements FOR UPDATE
  USING (get_my_role() = 'mentor');

-- user_achievements: read own + mentor reads all; system inserts via trigger/admin
CREATE POLICY "user_achievements: read own or mentor reads all"
  ON user_achievements FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'host'
  );

CREATE POLICY "user_achievements: crew+ read others"
  ON user_achievements FOR SELECT
  USING (get_my_role() >= 'crew');

-- streaks: read own + mentor reads all
CREATE POLICY "streaks: read own or crew+ reads all"
  ON streaks FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'crew'
  );

CREATE POLICY "streaks: self insert"
  ON streaks FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id());

CREATE POLICY "streaks: self update"
  ON streaks FOR UPDATE
  USING (profile_id = get_my_profile_id());

-- season_challenges: public read
CREATE POLICY "season_challenges: public read"
  ON season_challenges FOR SELECT USING (true);

CREATE POLICY "season_challenges: mentor write"
  ON season_challenges FOR INSERT
  WITH CHECK (get_my_role() = 'mentor');

CREATE POLICY "season_challenges: mentor update"
  ON season_challenges FOR UPDATE
  USING (get_my_role() = 'mentor');

-- challenge_progress: read own + host reads all
CREATE POLICY "challenge_progress: read own or host reads all"
  ON challenge_progress FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'host'
  );

-- ---------------------------------------------------------------------------
-- 9. Update after_crew_completion trigger to also track lifetime_zaps
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS after_crew_completion() CASCADE;

CREATE OR REPLACE FUNCTION after_crew_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_zaps     integer;
  new_lifetime integer;
BEGIN
  UPDATE profiles
  SET current_season_zaps = current_season_zaps + NEW.zaps_earned,
      lifetime_zaps       = lifetime_zaps + NEW.zaps_earned
  WHERE id = NEW.profile_id
  RETURNING current_season_zaps, lifetime_zaps INTO new_zaps, new_lifetime;

  -- Auto-advance rank up to conduit; luminary is manually assigned
  UPDATE profiles
  SET current_season_rank = CASE
    WHEN new_zaps >= 1500
         AND current_season_rank NOT IN ('conduit', 'luminary')
         THEN 'conduit'::season_rank_enum
    WHEN new_zaps >= 750
         AND current_season_rank NOT IN ('agent', 'conduit', 'luminary')
         THEN 'agent'::season_rank_enum
    WHEN new_zaps >= 300
         AND current_season_rank NOT IN ('operative', 'agent', 'conduit', 'luminary')
         THEN 'operative'::season_rank_enum
    WHEN new_zaps >= 100
         AND current_season_rank NOT IN ('runner', 'operative', 'agent', 'conduit', 'luminary')
         THEN 'runner'::season_rank_enum
    ELSE current_season_rank
  END
  WHERE id = NEW.profile_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_crew_completion
  AFTER INSERT ON crew_completions
  FOR EACH ROW
  EXECUTE FUNCTION after_crew_completion();

-- ---------------------------------------------------------------------------
-- 10. Trigger: auto-increment achievement_count on user_achievements insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION after_achievement_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reward integer;
BEGIN
  -- Increment the profile's achievement counter
  UPDATE profiles
  SET achievement_count = achievement_count + 1
  WHERE id = NEW.profile_id;

  -- Award bonus zaps if the achievement has a reward
  SELECT zaps_reward INTO reward
  FROM achievements
  WHERE id = NEW.achievement_id;

  IF reward > 0 THEN
    UPDATE profiles
    SET current_season_zaps = current_season_zaps + reward,
        lifetime_zaps       = lifetime_zaps + reward
    WHERE id = NEW.profile_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_achievement_unlocked
  AFTER INSERT ON user_achievements
  FOR EACH ROW
  EXECUTE FUNCTION after_achievement_unlocked();

-- ---------------------------------------------------------------------------
-- 11. Update reset_season to preserve lifetime stats
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reset_season()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET current_season_zaps        = 0,
      current_season_rank        = 'ghost'::season_rank_enum,
      season_challenges_complete = false
  WHERE TRUE;

  -- Reset streaks (they're seasonal)
  UPDATE streaks
  SET current_count    = 0,
      last_activity_at = NULL,
      updated_at       = now()
  WHERE TRUE;

  -- Clear challenge progress
  DELETE FROM challenge_progress;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. Seed achievements
-- ---------------------------------------------------------------------------

INSERT INTO achievements (slug, name, description, icon, category, tier, criteria, zaps_reward, sort_order) VALUES
  -- Social: Joining & Connecting
  ('first-circle',        'First Circle',        'Join your first circle',                     'users',       'social',     'bronze',   '{"type":"circle_join","count":1}',       10,  10),
  ('social-butterfly',    'Social Butterfly',     'Join 3 different circles',                   'users',       'social',     'silver',   '{"type":"circle_join","count":3}',       25,  20),
  ('welcomer',            'The Welcomer',         'Be the first to welcome 5 new members',      'hand-metal',  'social',     'silver',   '{"type":"welcome_member","count":5}',    25,  30),
  ('connector',           'Connector',            'Refer 3 people who join a circle',            'link',        'social',     'gold',     '{"type":"referral","count":3}',          50,  40),
  ('bridge-builder',      'Bridge Builder',       'Refer 10 people who join a circle',           'link',        'social',     'platinum', '{"type":"referral","count":10}',         100, 50),

  -- Events: Attendance & Hosting
  ('first-gathering',     'First Gathering',      'Attend your first event',                    'calendar',    'events',     'bronze',   '{"type":"event_attend","count":1}',      10,  10),
  ('regular',             'Regular',              'Attend 10 events',                            'calendar',    'events',     'silver',   '{"type":"event_attend","count":10}',     25,  20),
  ('devoted',             'Devoted',              'Attend 25 events',                            'calendar',    'events',     'gold',     '{"type":"event_attend","count":25}',     50,  30),
  ('centurion',           'Centurion',            'Attend 100 events',                           'calendar',    'events',     'platinum', '{"type":"event_attend","count":100}',    100, 40),
  ('first-host',          'First Host',           'Host your first event',                      'mic',         'events',     'silver',   '{"type":"event_host","count":1}',        25,  50),
  ('event-machine',       'Event Machine',        'Host 10 events',                              'mic',         'events',     'gold',     '{"type":"event_host","count":10}',       50,  60),

  -- Content: Posts & Engagement
  ('first-post',          'First Post',           'Share your first post in the feed',           'edit',        'content',    'bronze',   '{"type":"post_create","count":1}',       10,  10),
  ('storyteller',         'Storyteller',          'Create 10 posts',                              'book-open',   'content',    'silver',   '{"type":"post_create","count":10}',      25,  20),
  ('voice-of-the-people', 'Voice of the People',  'Create 50 posts',                              'volume-2',    'content',    'gold',     '{"type":"post_create","count":50}',      50,  30),
  ('conversation-starter','Conversation Starter', 'Get 10 replies on a single post',              'message-circle','content',  'silver',   '{"type":"post_replies","count":10}',     25,  40),

  -- Leadership: Roles & Responsibilities
  ('crew-up',             'Crew Up',              'Earn the Crew role',                          'zap',         'leadership', 'bronze',   '{"type":"role_earned","role":"crew"}',    10,  10),
  ('host-mode',           'Host Mode',            'Become a Host',                               'crown',       'leadership', 'silver',   '{"type":"role_earned","role":"host"}',    25,  20),
  ('guide-light',         'Guide Light',          'Become a Guide',                              'compass',     'leadership', 'gold',     '{"type":"role_earned","role":"guide"}',   50,  30),
  ('mentor-ascended',     'Mentor Ascended',      'Become a Mentor',                             'shield',      'leadership', 'platinum', '{"type":"role_earned","role":"mentor"}',  100, 40),

  -- Streaks: Consistency
  ('on-fire-3',           'Warming Up',           'Maintain a 3-week attendance streak',          'flame',       'streak',     'bronze',   '{"type":"streak","streak_type":"attendance","count":3}',   15,  10),
  ('on-fire-8',           'On Fire',              'Maintain an 8-week attendance streak',          'flame',       'streak',     'silver',   '{"type":"streak","streak_type":"attendance","count":8}',   30,  20),
  ('on-fire-13',          'Unstoppable',          'Maintain a 13-week attendance streak (full season)', 'flame',  'streak',     'gold',     '{"type":"streak","streak_type":"attendance","count":13}',  75,  30),
  ('posting-streak-4',    'Consistent Creator',   'Post every week for 4 weeks straight',        'pen-tool',    'streak',     'silver',   '{"type":"streak","streak_type":"posting","count":4}',      25,  40),
  ('posting-streak-13',   'Prolific',             'Post every week for a full season',             'pen-tool',    'streak',     'gold',     '{"type":"streak","streak_type":"posting","count":13}',     75,  50),

  -- Seasonal: Rank & Zaps Milestones
  ('first-100-zaps',      'Sparked',              'Earn your first 100 zaps in a season',         'zap',         'seasonal',   'bronze',   '{"type":"season_zaps","count":100}',     0,   10),
  ('zap-500',             'Charged',              'Earn 500 zaps in a season',                    'zap',         'seasonal',   'silver',   '{"type":"season_zaps","count":500}',     0,   20),
  ('zap-1500',            'Supercharged',         'Earn 1500 zaps in a season',                   'zap',         'seasonal',   'gold',     '{"type":"season_zaps","count":1500}',    0,   30),
  ('zap-3000',            'Overclocked',          'Earn 3000 zaps in a season',                   'zap',         'seasonal',   'platinum', '{"type":"season_zaps","count":3000}',    0,   40),
  ('rank-runner',         'Runner Unlocked',      'Reach Runner rank',                            'trending-up', 'seasonal',   'bronze',   '{"type":"rank_reached","rank":"runner"}', 0,   50),
  ('rank-operative',      'Operative Unlocked',   'Reach Operative rank',                         'trending-up', 'seasonal',   'silver',   '{"type":"rank_reached","rank":"operative"}', 0, 60),
  ('rank-agent',          'Agent Unlocked',       'Reach Agent rank',                             'trending-up', 'seasonal',   'gold',     '{"type":"rank_reached","rank":"agent"}',  0,   70),
  ('rank-conduit',        'Conduit Unlocked',     'Reach Conduit rank',                           'trending-up', 'seasonal',   'gold',     '{"type":"rank_reached","rank":"conduit"}', 0,  80),
  ('rank-luminary',       'Luminary Ascended',    'Reach the legendary Luminary rank',             'sun',         'seasonal',   'platinum', '{"type":"rank_reached","rank":"luminary"}', 0,  90),

  -- Special: Rare & Limited
  ('founding-member',     'Founding Member',      'One of the first members of the platform',     'star',        'special',    'platinum', '{"type":"manual"}',                      0,   10),
  ('season-one',          'Season One',           'Completed the very first season',               'trophy',      'special',    'gold',     '{"type":"manual"}',                      0,   20),
  ('luminary-club',       'Luminary Club',        'Reached Luminary rank in any season',            'gem',         'special',    'platinum', '{"type":"manual"}',                      0,   30)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 13. Seed season 1 challenges
-- ---------------------------------------------------------------------------

INSERT INTO season_challenges (season, slug, name, description, category, difficulty, criteria, target, zaps_reward, sort_order) VALUES
  -- Easy
  (1, 'attend-3-events',       'Show Up',               'Attend 3 events this season',                        'events',     'easy',      '{"type":"event_attend"}',    3,   25,  10),
  (1, 'make-5-posts',          'Find Your Voice',       'Share 5 posts in the feed',                          'content',    'easy',      '{"type":"post_create"}',     5,   25,  20),
  (1, 'complete-5-tasks',      'Task Runner',           'Complete 5 crew tasks',                              'social',     'easy',      '{"type":"task_complete"}',   5,   25,  30),

  -- Normal
  (1, 'attend-8-events',       'Committed',             'Attend 8 events this season',                        'events',     'normal',    '{"type":"event_attend"}',    8,   50,  40),
  (1, 'earn-500-zaps',         'Zap Collector',         'Earn 500 zaps this season',                          'seasonal',   'normal',    '{"type":"season_zaps"}',     500, 50,  50),
  (1, 'refer-1-member',        'Bring a Friend',        'Invite someone who joins your circle',               'social',     'normal',    '{"type":"referral"}',        1,   50,  60),
  (1, '4-week-streak',         'Momentum',              'Maintain a 4-week attendance streak',                'streak',     'normal',    '{"type":"streak","streak_type":"attendance"}', 4, 50, 70),

  -- Hard
  (1, 'host-3-events',         'Event Captain',         'Host 3 events this season',                          'events',     'hard',      '{"type":"event_host"}',      3,   100, 80),
  (1, 'earn-1500-zaps',        'Power Up',              'Earn 1500 zaps this season',                         'seasonal',   'hard',      '{"type":"season_zaps"}',     1500,100, 90),
  (1, '8-week-streak',         'Iron Will',             'Maintain an 8-week attendance streak',               'streak',     'hard',      '{"type":"streak","streak_type":"attendance"}', 8, 100, 100),

  -- Legendary
  (1, 'complete-all-challenges','The Completionist',    'Complete every other challenge this season',          'seasonal',   'legendary', '{"type":"all_challenges"}',  11,  250, 110),
  (1, 'reach-conduit',         'Conduit Ascension',     'Reach Conduit rank this season',                     'seasonal',   'legendary', '{"type":"rank_reached","rank":"conduit"}', 1, 250, 120)
ON CONFLICT (season, slug) DO NOTHING;
