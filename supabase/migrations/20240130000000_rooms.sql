-- =====================================================================
-- Migration: Chat Rooms (Discord-style)
-- Tables: rooms, room_members, room_messages
-- Separate from DMs (conversations / messages tables) — rooms are
-- realtime chat spaces that anyone can spin up and invite others to.
-- =====================================================================

-- ── rooms ─────────────────────────────────────────────────────────────
-- Each room is a long-running chat space with a focused purpose.

CREATE TABLE IF NOT EXISTS rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL CHECK (char_length(trim(name)) > 0),
  description   text,
  visibility    text NOT NULL DEFAULT 'public'
                  CHECK (visibility IN ('public', 'private', 'circle', 'hub', 'nexus', 'outpost')),
  scope_id      uuid,  -- nullable for fully public/private rooms; set for circle/hub/nexus/outpost scope
  creator_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  member_count  integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rooms_visibility ON rooms(visibility);
CREATE INDEX IF NOT EXISTS idx_rooms_scope ON rooms(scope_id) WHERE scope_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_last_message ON rooms(last_message_at DESC NULLS LAST);

-- ── room_members ──────────────────────────────────────────────────────
-- Who is in each room. last_read_at tracks unread state.
-- is_admin grants room-level admin (kick, archive, etc.) to the creator
-- and anyone they promote.

CREATE TABLE IF NOT EXISTS room_members (
  room_id      uuid        NOT NULL REFERENCES rooms(id)    ON DELETE CASCADE,
  profile_id   uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_admin     boolean     NOT NULL DEFAULT false,
  last_read_at timestamptz,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_room_members_profile ON room_members(profile_id);

-- ── room_messages ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    uuid        NOT NULL REFERENCES rooms(id)    ON DELETE CASCADE,
  author_id  uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(trim(body)) > 0),
  media_url  text,
  parent_id  uuid        REFERENCES room_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_created
  ON room_messages(room_id, created_at);

-- ── Triggers ──────────────────────────────────────────────────────────

-- Maintain member_count on the room when members join/leave
CREATE OR REPLACE FUNCTION rooms_maintain_member_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE rooms SET member_count = member_count + 1 WHERE id = NEW.room_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE rooms SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.room_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_members_count ON room_members;
CREATE TRIGGER trg_room_members_count
  AFTER INSERT OR DELETE ON room_members
  FOR EACH ROW EXECUTE FUNCTION rooms_maintain_member_count();

-- Update rooms.last_message_at when a new message is posted
CREATE OR REPLACE FUNCTION rooms_touch_last_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE rooms SET last_message_at = NEW.created_at WHERE id = NEW.room_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rooms_last_message ON room_messages;
CREATE TRIGGER trg_rooms_last_message
  AFTER INSERT ON room_messages
  FOR EACH ROW EXECUTE FUNCTION rooms_touch_last_message();

-- ── RLS ───────────────────────────────────────────────────────────────

ALTER TABLE rooms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;

-- Helper: is the calling auth user a member of this room?
CREATE OR REPLACE FUNCTION am_room_member(p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM room_members rm
    JOIN profiles pr ON pr.id = rm.profile_id
    WHERE rm.room_id = p_room_id
      AND pr.auth_user_id = auth.uid()
  );
$$;

-- ── rooms policies ───────────────────────────────────────────────────
-- Read: anyone can see public rooms; members can see their private rooms
CREATE POLICY "rooms_read_public_or_member"
  ON rooms FOR SELECT
  USING (
    visibility = 'public'
    OR visibility IN ('circle', 'hub', 'nexus', 'outpost')
    OR am_room_member(id)
  );

-- Write: handled via service-role server actions
CREATE POLICY "rooms_service_write"
  ON rooms FOR ALL
  USING (auth.role() = 'service_role');

-- ── room_members policies ────────────────────────────────────────────
-- Read: members of the room can see who's in it; public room membership is visible to all
CREATE POLICY "room_members_read"
  ON room_members FOR SELECT
  USING (
    am_room_member(room_id)
    OR EXISTS (SELECT 1 FROM rooms r WHERE r.id = room_id AND r.visibility = 'public')
  );

CREATE POLICY "room_members_service_write"
  ON room_members FOR ALL
  USING (auth.role() = 'service_role');

-- ── room_messages policies ───────────────────────────────────────────
-- Read: room members only
CREATE POLICY "room_messages_read_members"
  ON room_messages FOR SELECT
  USING (am_room_member(room_id));

CREATE POLICY "room_messages_service_write"
  ON room_messages FOR ALL
  USING (auth.role() = 'service_role');

-- ── Realtime ──────────────────────────────────────────────────────────
-- Enable Supabase Realtime broadcasts on room_messages so the client
-- can subscribe to new messages in their active room.
ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
