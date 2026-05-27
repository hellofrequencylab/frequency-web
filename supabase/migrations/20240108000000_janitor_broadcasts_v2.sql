-- 1. Janitor role: the mega-admin above mentor
ALTER TYPE community_role ADD VALUE IF NOT EXISTS 'janitor';

-- 2. Broadcast type on dispatches
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS dispatch_type text NOT NULL DEFAULT 'post'
    CHECK (dispatch_type IN ('post', 'poll', 'challenge', 'article'));

-- 3. Dispatch likes
CREATE TABLE IF NOT EXISTS dispatch_likes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id  uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatch_id, profile_id)
);

ALTER TABLE dispatch_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dispatch likes"
  ON dispatch_likes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage their own likes"
  ON dispatch_likes FOR ALL TO authenticated
  USING (profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

-- 4. Dispatch comments
CREATE TABLE IF NOT EXISTS dispatch_comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id  uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  author_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body         text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatch_comments_dispatch_idx ON dispatch_comments(dispatch_id, created_at);

ALTER TABLE dispatch_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dispatch comments"
  ON dispatch_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own comments"
  ON dispatch_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authors can update their own comments"
  ON dispatch_comments FOR UPDATE TO authenticated
  USING (author_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Authors can delete their own comments"
  ON dispatch_comments FOR DELETE TO authenticated
  USING (author_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid()));
