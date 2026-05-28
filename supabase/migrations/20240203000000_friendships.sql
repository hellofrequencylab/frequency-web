-- =============================================================================
-- Frequency Community Platform — Friend Graph
-- =============================================================================
-- Adds a friendships table that gates 1:1 and group DM creation.
--
--   • Symmetric relationship: one row per pair, canonical ordering
--     (user_a_id < user_b_id) so reverse-direction duplicates are impossible.
--   • requested_by stores who initiated; either user_a or user_b.
--   • status is pending until the addressee accepts (then 'accepted').
--     Decline / cancel / unfriend all delete the row — no 'declined' state
--     so the requester can try again later without history.
--   • are_friends(a, b) helper used by server actions to gate
--     createDirectMessage and createGroupConversation.
--   • Backfill: every prior conversation_participants pair gets an accepted
--     friendship so in-flight DMs/group DMs keep working.
-- =============================================================================


CREATE TABLE IF NOT EXISTS friendships (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id     uuid         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_b_id     uuid         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_by  uuid         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        text         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  requested_at  timestamptz  NOT NULL DEFAULT now(),
  responded_at  timestamptz,

  CONSTRAINT friendships_canonical_order CHECK (user_a_id < user_b_id),
  CONSTRAINT friendships_requested_by_party CHECK (requested_by = user_a_id OR requested_by = user_b_id),
  CONSTRAINT friendships_unique_pair UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON friendships (user_a_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships (user_b_id, status);


-- ---------------------------------------------------------------------------
-- are_friends(a, b) — order-independent accepted-friendship check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION are_friends(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM friendships
    WHERE status = 'accepted'
      AND user_a_id = LEAST(a, b)
      AND user_b_id = GREATEST(a, b)
  );
$$;


-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- See your own friendships (either side)
CREATE POLICY "friendships_select_own"
  ON friendships FOR SELECT
  USING (
    user_a_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR user_b_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Insert: you must be the requester AND a party
CREATE POLICY "friendships_insert_self_request"
  ON friendships FOR INSERT
  WITH CHECK (
    requested_by = (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    AND requested_by IN (user_a_id, user_b_id)
  );

-- Update: only the addressee (the party who didn't request) can flip to accepted
CREATE POLICY "friendships_update_addressee_accept"
  ON friendships FOR UPDATE
  USING (
    (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1) IN (user_a_id, user_b_id)
    AND (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1) <> requested_by
  )
  WITH CHECK (status = 'accepted');

-- Delete: either party (decline, cancel, unfriend)
CREATE POLICY "friendships_delete_own"
  ON friendships FOR DELETE
  USING (
    user_a_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR user_b_id = (SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Service role bypasses RLS for backfill and admin tooling
CREATE POLICY "friendships_service_role_full_access"
  ON friendships FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ---------------------------------------------------------------------------
-- Backfill: prior conversation partners → accepted friendship
-- ---------------------------------------------------------------------------
-- For every distinct pair that has co-existed in any conversation
-- (1:1 DM or group DM), create an accepted friendship. Picks the lesser
-- profile_id as user_a to satisfy the canonical-order constraint.
-- requested_by is set to user_a — arbitrary for grandfathered pairs.

INSERT INTO friendships (user_a_id, user_b_id, requested_by, status, requested_at, responded_at)
SELECT DISTINCT
  LEAST(p1.profile_id, p2.profile_id)    AS user_a_id,
  GREATEST(p1.profile_id, p2.profile_id) AS user_b_id,
  LEAST(p1.profile_id, p2.profile_id)    AS requested_by,
  'accepted'                              AS status,
  now()                                   AS requested_at,
  now()                                   AS responded_at
FROM conversation_participants p1
JOIN conversation_participants p2
  ON p1.conversation_id = p2.conversation_id
  AND p1.profile_id < p2.profile_id
ON CONFLICT (user_a_id, user_b_id) DO NOTHING;
