-- =============================================================================
-- Migration: reply_count excludes self-replies (anti-farming)
-- =============================================================================
--
-- The "Conversation Starter" / "Spark a Conversation" achievement reads
-- posts.reply_count ("Get 10 replies on a single post"). The original increment
-- trigger (20240119000000_gamification_phase2.sql) bumped reply_count on ANY
-- reply, including the post author replying to their own post — so a user could
-- self-comment 10x and earn the badge.
--
-- This redefines the increment/decrement trigger functions so reply_count only
-- counts replies where the replier is NOT the parent post's author, then
-- backfills posts.reply_count to the corrected (self-excluded) value.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Redefine the trigger functions to exclude self-replies
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_increment_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE posts
       SET reply_count = reply_count + 1
     WHERE id = NEW.parent_id
       -- Don't count the post author replying to their own post.
       AND author_id IS DISTINCT FROM NEW.author_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION trg_decrement_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.parent_id IS NOT NULL THEN
    UPDATE posts
       SET reply_count = GREATEST(0, reply_count - 1)
     WHERE id = OLD.parent_id
       -- Symmetric with the increment: only self-excluded replies were counted.
       AND author_id IS DISTINCT FROM OLD.author_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- (Triggers themselves are unchanged — they still fire on insert/delete of any
-- reply; the functions now decide whether to count it.)

-- ---------------------------------------------------------------------------
-- 2. Backfill reply_count to the corrected, self-excluded value
-- ---------------------------------------------------------------------------

UPDATE posts p
SET reply_count = (
  SELECT COUNT(*)
  FROM posts r
  WHERE r.parent_id = p.id
    AND r.author_id IS DISTINCT FROM p.author_id
)
WHERE p.reply_count <> (
  SELECT COUNT(*)
  FROM posts r
  WHERE r.parent_id = p.id
    AND r.author_id IS DISTINCT FROM p.author_id
);
