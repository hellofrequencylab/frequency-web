-- =====================================================================
-- Migration: Direct Messaging
-- Tables: conversations, conversation_participants, messages
-- =====================================================================

-- ── conversations ─────────────────────────────────────────────────────
-- One row per DM thread (1:1 or group DM)

CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── conversation_participants ─────────────────────────────────────────
-- Who is in each conversation. last_read_at tracks unread state.

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  last_read_at    timestamptz,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

-- ── messages ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid        NOT NULL REFERENCES profiles(id)      ON DELETE CASCADE,
  body            text        NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_conv_participants_profile
  ON conversation_participants(profile_id);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE conversations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages                  ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling auth user a participant in this conversation?
CREATE OR REPLACE FUNCTION am_participant(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM conversation_participants cp
    JOIN profiles pr ON pr.id = cp.profile_id
    WHERE cp.conversation_id = p_conversation_id
      AND pr.auth_user_id    = auth.uid()
  )
$$;

-- conversations: only participants can view
CREATE POLICY "participants_view_conversations"
  ON conversations FOR SELECT
  USING (am_participant(id));

-- conversation_participants: participants can see who is in their threads
CREATE POLICY "participants_view_conv_participants"
  ON conversation_participants FOR SELECT
  USING (am_participant(conversation_id));

-- conversation_participants: users can update their own last_read_at
CREATE POLICY "participants_update_own_last_read"
  ON conversation_participants FOR UPDATE
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- messages: participants can read all messages in their conversations
CREATE POLICY "participants_read_messages"
  ON messages FOR SELECT
  USING (am_participant(conversation_id));

-- messages: participants can insert, but sender_id must be their own profile
CREATE POLICY "participants_send_messages"
  ON messages FOR INSERT
  WITH CHECK (
    am_participant(conversation_id)
    AND sender_id IN (
      SELECT id FROM profiles WHERE auth_user_id = auth.uid()
    )
  );

-- ── Realtime ──────────────────────────────────────────────────────────
-- Run this separately in the Supabase SQL editor to enable realtime on
-- the messages table (required for live thread updates):
--
--   ALTER PUBLICATION supabase_realtime ADD TABLE messages;
--
-- Or enable it in the Supabase dashboard → Database → Replication.
-- Without this step, the thread will still work but won't update live.
