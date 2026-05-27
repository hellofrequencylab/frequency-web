-- Denormalized engagement counters + time-decayed score on posts.
-- Maintained by triggers on post_reactions (reactions) and posts (replies).

ALTER TABLE posts ADD COLUMN IF NOT EXISTS reaction_count  int   NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS comment_count   int   NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS engagement_score float NOT NULL DEFAULT 0;

-- Backfill counts from existing data
UPDATE posts SET
  reaction_count = (SELECT COUNT(*) FROM post_reactions WHERE post_id = posts.id),
  comment_count  = (SELECT COUNT(*) FROM posts replies   WHERE replies.parent_id = posts.id);

-- Backfill score: (reactions + comments×2) / (age_hours + 2)^1.5
UPDATE posts SET engagement_score = (
  (reaction_count + comment_count * 2)::float /
  POWER(
    GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 0.0) + 2.0,
    1.5
  )
);

CREATE INDEX IF NOT EXISTS idx_posts_engagement_score ON posts (engagement_score DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility        ON posts (visibility);

-- ── Trigger: keep counts + score current on reaction add/remove ──────────────

CREATE OR REPLACE FUNCTION maintain_engagement_on_reaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_post_id   UUID  := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;
  v_reactions INT;
  v_comments  INT;
  v_score     FLOAT;
BEGIN
  SELECT COUNT(*) INTO v_reactions FROM post_reactions WHERE post_id   = v_post_id;
  SELECT COUNT(*) INTO v_comments  FROM posts          WHERE parent_id = v_post_id;
  SELECT (v_reactions + v_comments * 2)::float /
         POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 0.0) + 2.0, 1.5)
  INTO v_score FROM posts WHERE id = v_post_id;
  UPDATE posts
  SET reaction_count   = v_reactions,
      comment_count    = v_comments,
      engagement_score = COALESCE(v_score, 0)
  WHERE id = v_post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reaction_engagement ON post_reactions;
CREATE TRIGGER trg_reaction_engagement
  AFTER INSERT OR DELETE ON post_reactions
  FOR EACH ROW EXECUTE FUNCTION maintain_engagement_on_reaction();

-- ── Trigger: keep parent's comment_count + score current on reply add/remove ─

CREATE OR REPLACE FUNCTION maintain_engagement_on_reply()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_post_id   UUID  := CASE WHEN TG_OP = 'DELETE' THEN OLD.parent_id ELSE NEW.parent_id END;
  v_reactions INT;
  v_comments  INT;
  v_score     FLOAT;
BEGIN
  IF v_post_id IS NULL THEN RETURN NULL; END IF;
  SELECT COUNT(*) INTO v_reactions FROM post_reactions WHERE post_id   = v_post_id;
  SELECT COUNT(*) INTO v_comments  FROM posts          WHERE parent_id = v_post_id;
  SELECT (v_reactions + v_comments * 2)::float /
         POWER(GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 0.0) + 2.0, 1.5)
  INTO v_score FROM posts WHERE id = v_post_id;
  UPDATE posts
  SET reaction_count   = v_reactions,
      comment_count    = v_comments,
      engagement_score = COALESCE(v_score, 0)
  WHERE id = v_post_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_reply_engagement ON posts;
CREATE TRIGGER trg_reply_engagement
  AFTER INSERT OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION maintain_engagement_on_reply();
