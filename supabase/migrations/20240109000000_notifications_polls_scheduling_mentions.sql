-- ============================================================
-- notifications, poll tables, scheduling, mention tracking
-- Apply via Supabase dashboard → SQL Editor
-- ============================================================

-- ── Notifications ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id      uuid            REFERENCES profiles(id) ON DELETE SET NULL,
  type          text NOT NULL,  -- 'reaction' | 'comment' | 'mention' | 'dispatch'
  reference_type text,          -- 'post' | 'dispatch' | 'comment'
  reference_id  uuid,
  body          text,
  read_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notifications"
  ON notifications FOR SELECT
  USING (recipient_id = (
    SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "service role full access notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

-- ── Poll options ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dispatch_poll_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE dispatch_poll_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read poll options"
  ON dispatch_poll_options FOR SELECT USING (true);

CREATE POLICY "service role full access poll options"
  ON dispatch_poll_options FOR ALL
  USING (auth.role() = 'service_role');

-- ── Poll votes ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dispatch_poll_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id   uuid NOT NULL REFERENCES dispatch_poll_options(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (option_id, profile_id)
);

ALTER TABLE dispatch_poll_votes ENABLE ROW LEVEL SECURITY;

-- Users can read all votes (for counts), write their own
CREATE POLICY "anyone can read poll votes"
  ON dispatch_poll_votes FOR SELECT USING (true);

CREATE POLICY "users insert own vote"
  ON dispatch_poll_votes FOR INSERT
  WITH CHECK (profile_id = (
    SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "users delete own vote"
  ON dispatch_poll_votes FOR DELETE
  USING (profile_id = (
    SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "service role full access poll votes"
  ON dispatch_poll_votes FOR ALL
  USING (auth.role() = 'service_role');

-- ── Scheduling ───────────────────────────────────────────────

ALTER TABLE dispatches ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

CREATE INDEX IF NOT EXISTS idx_dispatches_scheduled
  ON dispatches (scheduled_for)
  WHERE status = 'draft' AND scheduled_for IS NOT NULL;

-- ── Post mentions ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS post_mentions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, profile_id)
);

ALTER TABLE post_mentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read mentions"
  ON post_mentions FOR SELECT USING (true);

CREATE POLICY "service role full access mentions"
  ON post_mentions FOR ALL
  USING (auth.role() = 'service_role');
