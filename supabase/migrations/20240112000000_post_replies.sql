-- Add self-referencing parent_id to posts so feed posts can have threaded replies.
-- Replies are posts with parent_id set; top-level posts have parent_id NULL.
-- Deleting a parent cascades to all replies.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_posts_parent_id ON posts(parent_id);
