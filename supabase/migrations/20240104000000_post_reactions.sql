-- =============================================================================
-- post_reactions
-- Hearts and +1s on feed posts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS post_reactions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       uuid        NOT NULL REFERENCES posts    (id) ON DELETE CASCADE,
  profile_id    uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  reaction_type text        NOT NULL CHECK (reaction_type IN ('heart', 'plus_one')),
  created_at    timestamptz DEFAULT now(),
  -- One reaction of each type per person per post
  UNIQUE (post_id, profile_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id    ON post_reactions (post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_profile_id ON post_reactions (profile_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE post_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone who can see the post can see its reactions.
-- Crew+ may toggle their own reaction row.

CREATE POLICY "post_reactions: crew+ read"
  ON post_reactions FOR SELECT
  USING (get_my_role() >= 'crew');

CREATE POLICY "post_reactions: crew+ insert own"
  ON post_reactions FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "post_reactions: delete own"
  ON post_reactions FOR DELETE
  USING (
    profile_id IN (SELECT id FROM profiles WHERE auth_user_id = auth.uid())
  );
