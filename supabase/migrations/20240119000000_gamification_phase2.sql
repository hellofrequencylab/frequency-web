-- =============================================================================
-- Migration: Gamification Phase 2 — Reply counts, quest chains
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add reply_count to posts for "Conversation Starter" achievement tracking
-- ---------------------------------------------------------------------------

ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION trg_increment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE posts SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION trg_decrement_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.parent_id IS NOT NULL THEN
    UPDATE posts SET reply_count = GREATEST(0, reply_count - 1) WHERE id = OLD.parent_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_posts_reply_insert ON posts;
CREATE TRIGGER trg_posts_reply_insert
  AFTER INSERT ON posts
  FOR EACH ROW
  WHEN (NEW.parent_id IS NOT NULL)
  EXECUTE FUNCTION trg_increment_reply_count();

DROP TRIGGER IF EXISTS trg_posts_reply_delete ON posts;
CREATE TRIGGER trg_posts_reply_delete
  AFTER DELETE ON posts
  FOR EACH ROW
  WHEN (OLD.parent_id IS NOT NULL)
  EXECUTE FUNCTION trg_decrement_reply_count();

-- Backfill existing reply counts
UPDATE posts p
SET reply_count = (SELECT COUNT(*) FROM posts r WHERE r.parent_id = p.id)
WHERE EXISTS (SELECT 1 FROM posts r WHERE r.parent_id = p.id);

-- ---------------------------------------------------------------------------
-- 2. Quest chains — multi-step linked challenges
-- ---------------------------------------------------------------------------

CREATE TABLE quest_chains (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text        UNIQUE NOT NULL,
  name        text        NOT NULL,
  description text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'map',
  season      integer,
  zaps_reward integer     NOT NULL DEFAULT 100,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quest_steps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id    uuid        NOT NULL REFERENCES quest_chains (id) ON DELETE CASCADE,
  step_order  integer     NOT NULL,
  name        text        NOT NULL,
  description text        NOT NULL,
  criteria    jsonb       NOT NULL DEFAULT '{}',
  target      integer     NOT NULL DEFAULT 1,
  zaps_reward integer     NOT NULL DEFAULT 0,
  UNIQUE (chain_id, step_order)
);

CREATE TABLE quest_progress (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  chain_id     uuid        NOT NULL REFERENCES quest_chains (id) ON DELETE CASCADE,
  current_step integer     NOT NULL DEFAULT 1,
  step_progress integer    NOT NULL DEFAULT 0,
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (profile_id, chain_id)
);

CREATE INDEX idx_quest_steps_chain    ON quest_steps (chain_id);
CREATE INDEX idx_quest_progress_profile ON quest_progress (profile_id);
CREATE INDEX idx_quest_progress_chain   ON quest_progress (chain_id);

-- RLS
ALTER TABLE quest_chains   ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_steps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quest_chains: public read"
  ON quest_chains FOR SELECT USING (true);

CREATE POLICY "quest_steps: public read"
  ON quest_steps FOR SELECT USING (true);

CREATE POLICY "quest_progress: read own or host reads all"
  ON quest_progress FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() >= 'host'
  );

-- ---------------------------------------------------------------------------
-- 3. Seed quest chains
-- ---------------------------------------------------------------------------

INSERT INTO quest_chains (slug, name, description, icon, season, zaps_reward, sort_order) VALUES
  ('the-connector',  'The Connector',  'Build bridges in your community — attend, share, and bring someone new.',   'link',     1, 150, 10),
  ('host-in-training','Host in Training','Learn the ropes of community leadership — from attending to hosting.',    'crown',    1, 200, 20),
  ('content-creator', 'Content Creator', 'Find your voice and inspire others to engage.',                            'pen-tool', 1, 150, 30)
ON CONFLICT (slug) DO NOTHING;

-- The Connector: attend > post about it > invite someone
INSERT INTO quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
SELECT qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
FROM quest_chains qc
CROSS JOIN (VALUES
  (1, 'Show Up',           'Attend an event in your circle',          '{"type":"event_attend"}',  1, 25),
  (2, 'Share the Moment',  'Create a post about the experience',      '{"type":"post_create"}',   1, 25),
  (3, 'Bring a Friend',    'Invite someone who joins your circle',     '{"type":"referral"}',      1, 50)
) AS s(step_order, name, description, criteria, target, zaps_reward)
WHERE qc.slug = 'the-connector'
ON CONFLICT (chain_id, step_order) DO NOTHING;

-- Host in Training: attend 5 events > complete 10 tasks > host an event
INSERT INTO quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
SELECT qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
FROM quest_chains qc
CROSS JOIN (VALUES
  (1, 'Dedicated Regular', 'Attend 5 events',                  '{"type":"event_attend"}',  5, 25),
  (2, 'Task Master',       'Complete 10 crew tasks',            '{"type":"task_complete"}', 10, 50),
  (3, 'Take the Mic',      'Host your first event',             '{"type":"event_host"}',    1, 75)
) AS s(step_order, name, description, criteria, target, zaps_reward)
WHERE qc.slug = 'host-in-training'
ON CONFLICT (chain_id, step_order) DO NOTHING;

-- Content Creator: first post > 5 posts > get 10 replies on a single post
INSERT INTO quest_steps (chain_id, step_order, name, description, criteria, target, zaps_reward)
SELECT qc.id, s.step_order, s.name, s.description, s.criteria::jsonb, s.target, s.zaps_reward
FROM quest_chains qc
CROSS JOIN (VALUES
  (1, 'First Words',       'Share your first post',             '{"type":"post_create"}',   1, 10),
  (2, 'Finding Your Voice','Create 5 posts total',              '{"type":"post_create"}',   5, 25),
  (3, 'Spark a Conversation','Get 10 replies on a single post', '{"type":"post_replies"}',  10, 75)
) AS s(step_order, name, description, criteria, target, zaps_reward)
WHERE qc.slug = 'content-creator'
ON CONFLICT (chain_id, step_order) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Add RLS insert/update policies for quest_progress (needed for engine)
-- ---------------------------------------------------------------------------

CREATE POLICY "quest_progress: system insert"
  ON quest_progress FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id() OR get_my_role() >= 'host');

CREATE POLICY "quest_progress: system update"
  ON quest_progress FOR UPDATE
  USING (profile_id = get_my_profile_id() OR get_my_role() >= 'host');

-- Add insert policy for user_achievements (needed for admin awards)
CREATE POLICY "user_achievements: host+ insert"
  ON user_achievements FOR INSERT
  WITH CHECK (get_my_role() >= 'host');

-- Add delete policy for user_achievements (needed for admin revokes)
CREATE POLICY "user_achievements: host+ delete"
  ON user_achievements FOR DELETE
  USING (get_my_role() >= 'host');
