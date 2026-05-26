-- =============================================================================
-- Frequency Community Platform — Hierarchy v2
-- Replaces monolithic `groups` table with proper 5-tier structure:
-- Region → Outpost → Nexus → Hub → Circle
-- Adds Channels (optional focus groups)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1: Drop old RLS policies and tables
-- ---------------------------------------------------------------------------

-- Drop policies that reference old tables
DROP POLICY IF EXISTS "groups: read active"                        ON groups;
DROP POLICY IF EXISTS "groups: host+ insert"                       ON groups;
DROP POLICY IF EXISTS "groups: host/guide/mentor update in scope"  ON groups;
DROP POLICY IF EXISTS "groups: mentor delete"                      ON groups;

DROP POLICY IF EXISTS "group_memberships: read in joined groups or hosted" ON group_memberships;
DROP POLICY IF EXISTS "group_memberships: crew+ join"                      ON group_memberships;
DROP POLICY IF EXISTS "group_memberships: leave own or host removes"       ON group_memberships;

-- Drop post/event policies — will recreate referencing circles
DROP POLICY IF EXISTS "posts: crew+ read by visibility"                ON posts;
DROP POLICY IF EXISTS "posts: crew+ insert in scope"                   ON posts;
DROP POLICY IF EXISTS "posts: author update or host pins in group"      ON posts;
DROP POLICY IF EXISTS "posts: author delete or host removes in group"   ON posts;

DROP POLICY IF EXISTS "events: crew+ read in scope"                    ON events;
DROP POLICY IF EXISTS "events: host+ insert"                           ON events;
DROP POLICY IF EXISTS "events: host/guide/mentor update in scope"      ON events;
DROP POLICY IF EXISTS "events: mentor delete"                          ON events;

-- Drop old helper that references group_memberships
DROP FUNCTION IF EXISTS get_my_group_ids();

-- Drop old tables (no FK dependents — scope_id on posts/events is polymorphic UUID)
DROP TABLE IF EXISTS group_memberships;
DROP TABLE IF EXISTS groups;


-- ---------------------------------------------------------------------------
-- STEP 2: New ENUMs
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE group_status AS ENUM ('forming','active','inactive','archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE circle_type AS ENUM ('in-person','online');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE channel_scope_type AS ENUM ('hub','nexus','outpost');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE channel_content_type AS ENUM ('group','event','thread');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('active','pending','inactive');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ---------------------------------------------------------------------------
-- STEP 3: New tables
-- ---------------------------------------------------------------------------

-- 3a. outposts — city/neighbourhood layer
CREATE TABLE outposts (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text  NOT NULL,
  slug       text  NOT NULL UNIQUE,
  region_id  uuid  REFERENCES nexus_regions (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 3b. nexuses — core community unit (cap 2500)
CREATE TABLE nexuses (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text         NOT NULL,
  slug       text         NOT NULL UNIQUE,
  outpost_id uuid         NOT NULL REFERENCES outposts (id),
  mentor_id  uuid         REFERENCES profiles (id) ON DELETE SET NULL,
  status     group_status NOT NULL DEFAULT 'forming',
  member_cap integer      NOT NULL DEFAULT 2500,
  created_at timestamptz  DEFAULT now()
);

-- 3c. hubs — groups exactly 5 Circles
CREATE TABLE hubs (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text         NOT NULL,
  slug       text         NOT NULL UNIQUE,
  nexus_id   uuid         NOT NULL REFERENCES nexuses (id),
  guide_id   uuid         REFERENCES profiles (id) ON DELETE SET NULL,
  status     group_status NOT NULL DEFAULT 'forming',
  created_at timestamptz  DEFAULT now()
);

-- 3d. circles — user's home group (50 in-person / 100 online)
CREATE TABLE circles (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text         NOT NULL,
  slug         text         NOT NULL UNIQUE,
  hub_id       uuid         NOT NULL REFERENCES hubs (id),
  host_id      uuid         REFERENCES profiles (id) ON DELETE SET NULL,
  type         circle_type  NOT NULL DEFAULT 'in-person',
  member_cap   integer      NOT NULL DEFAULT 50
    CONSTRAINT circles_cap_check CHECK (
      (type = 'in-person' AND member_cap <= 50) OR
      (type = 'online'    AND member_cap <= 100)
    ),
  member_count integer      NOT NULL DEFAULT 0,
  status       group_status NOT NULL DEFAULT 'forming',
  about        text,
  created_at   timestamptz  DEFAULT now()
);

-- 3e. memberships — replaces group_memberships; always scoped to a Circle
CREATE TABLE memberships (
  id             uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id     uuid              NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  circle_id      uuid              NOT NULL REFERENCES circles  (id) ON DELETE CASCADE,
  volunteer_role community_role,          -- null = regular member
  status         membership_status NOT NULL DEFAULT 'active',
  joined_at      timestamptz       DEFAULT now(),
  UNIQUE (profile_id, circle_id)
);

-- 3f. channels — optional focus groups layered on top of the hierarchy
CREATE TABLE channels (
  id            uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text                 NOT NULL,
  description   text,
  creator_id    uuid                 NOT NULL REFERENCES profiles (id),
  creator_role  community_role       NOT NULL,
  scope         channel_scope_type   NOT NULL,
  scope_id      uuid                 NOT NULL,   -- hub_id | nexus_id | outpost_id
  type          channel_content_type NOT NULL DEFAULT 'group',
  member_cap    integer,
  is_public     boolean              NOT NULL DEFAULT true,
  event_date    timestamptz,
  created_at    timestamptz          DEFAULT now()
);

-- 3g. channel_memberships
CREATE TABLE channel_memberships (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid  NOT NULL REFERENCES channels (id) ON DELETE CASCADE,
  profile_id uuid  NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  status     text  NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','invited','declined')),
  joined_at  timestamptz DEFAULT now(),
  UNIQUE (channel_id, profile_id)
);


-- ---------------------------------------------------------------------------
-- STEP 4: Triggers
-- ---------------------------------------------------------------------------

-- 4a. circles.member_count maintained by memberships insert/delete
CREATE OR REPLACE FUNCTION trg_increment_circle_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE circles SET member_count = member_count + 1 WHERE id = NEW.circle_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memberships_insert
  AFTER INSERT ON memberships
  FOR EACH ROW EXECUTE FUNCTION trg_increment_circle_member_count();

CREATE OR REPLACE FUNCTION trg_decrement_circle_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE circles SET member_count = member_count - 1 WHERE id = OLD.circle_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_memberships_delete
  AFTER DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION trg_decrement_circle_member_count();

-- 4b. Enforce max 5 active Circles per Hub
CREATE OR REPLACE FUNCTION check_hub_circle_limit()
RETURNS TRIGGER AS $$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM   circles
  WHERE  hub_id = NEW.hub_id AND status != 'archived';
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Hub has reached maximum Circle capacity (5)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_circles_hub_limit
  BEFORE INSERT ON circles
  FOR EACH ROW EXECUTE FUNCTION check_hub_circle_limit();

-- 4c. Auto-transition forming → active when a leader is assigned
CREATE OR REPLACE FUNCTION trg_nexus_auto_activate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mentor_id IS NOT NULL AND OLD.mentor_id IS NULL AND NEW.status = 'forming' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_nexus_activate
  BEFORE UPDATE ON nexuses
  FOR EACH ROW EXECUTE FUNCTION trg_nexus_auto_activate();

CREATE OR REPLACE FUNCTION trg_hub_auto_activate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.guide_id IS NOT NULL AND OLD.guide_id IS NULL AND NEW.status = 'forming' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hub_activate
  BEFORE UPDATE ON hubs
  FOR EACH ROW EXECUTE FUNCTION trg_hub_auto_activate();

CREATE OR REPLACE FUNCTION trg_circle_auto_activate()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.host_id IS NOT NULL AND OLD.host_id IS NULL AND NEW.status = 'forming' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_circle_activate
  BEFORE UPDATE ON circles
  FOR EACH ROW EXECUTE FUNCTION trg_circle_auto_activate();


-- ---------------------------------------------------------------------------
-- STEP 5: Security-definer helper functions
-- ---------------------------------------------------------------------------

-- Returns all circle IDs the authenticated user is actively a member of.
CREATE OR REPLACE FUNCTION get_my_circle_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT m.circle_id
      FROM   memberships m
      JOIN   profiles    p ON p.id = m.profile_id
      WHERE  p.auth_user_id = auth.uid()
        AND  m.status = 'active'
    ),
    '{}'::uuid[]
  );
$$;

-- Alias for backward compatibility with posts/events RLS that use get_my_group_ids().
CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT get_my_circle_ids();
$$;

-- Returns the first (oldest) circle the user belongs to (their "home" circle).
CREATE OR REPLACE FUNCTION get_my_circle_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.circle_id
  FROM   memberships m
  JOIN   profiles    p ON p.id = m.profile_id
  WHERE  p.auth_user_id = auth.uid()
    AND  m.status = 'active'
  ORDER BY m.joined_at
  LIMIT 1;
$$;

-- Returns the hub_id derived from the user's home circle.
CREATE OR REPLACE FUNCTION get_my_hub_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.hub_id
  FROM   circles     c
  JOIN   memberships m ON m.circle_id = c.id
  JOIN   profiles    p ON p.id = m.profile_id
  WHERE  p.auth_user_id = auth.uid()
    AND  m.status = 'active'
  ORDER BY m.joined_at
  LIMIT 1;
$$;

-- Returns the nexus_id derived from the user's home circle.
CREATE OR REPLACE FUNCTION get_my_nexus_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.nexus_id
  FROM   hubs        h
  JOIN   circles     c ON c.hub_id  = h.id
  JOIN   memberships m ON m.circle_id = c.id
  JOIN   profiles    p ON p.id = m.profile_id
  WHERE  p.auth_user_id = auth.uid()
    AND  m.status = 'active'
  ORDER BY m.joined_at
  LIMIT 1;
$$;

-- Returns the outpost_id derived from the user's home circle.
CREATE OR REPLACE FUNCTION get_my_outpost_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.outpost_id
  FROM   nexuses     n
  JOIN   hubs        h ON h.nexus_id   = n.id
  JOIN   circles     c ON c.hub_id     = h.id
  JOIN   memberships m ON m.circle_id  = c.id
  JOIN   profiles    p ON p.id = m.profile_id
  WHERE  p.auth_user_id = auth.uid()
    AND  m.status = 'active'
  ORDER BY m.joined_at
  LIMIT 1;
$$;


-- ---------------------------------------------------------------------------
-- STEP 6: Enable RLS and create policies on new tables
-- ---------------------------------------------------------------------------

ALTER TABLE outposts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexuses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE hubs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE circles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships      ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_memberships ENABLE ROW LEVEL SECURITY;

-- ── outposts ──
CREATE POLICY "outposts: public read"
  ON outposts FOR SELECT USING (true);

CREATE POLICY "outposts: mentor insert"
  ON outposts FOR INSERT WITH CHECK (get_my_role() = 'mentor');

CREATE POLICY "outposts: mentor update"
  ON outposts FOR UPDATE USING (get_my_role() = 'mentor');

-- ── nexuses ──
CREATE POLICY "nexuses: public read"
  ON nexuses FOR SELECT USING (true);

CREATE POLICY "nexuses: mentor insert"
  ON nexuses FOR INSERT WITH CHECK (get_my_role() = 'mentor');

CREATE POLICY "nexuses: mentor update"
  ON nexuses FOR UPDATE
  USING (get_my_role() = 'mentor');

-- ── hubs ──
CREATE POLICY "hubs: public read"
  ON hubs FOR SELECT USING (true);

CREATE POLICY "hubs: guide+ insert"
  ON hubs FOR INSERT WITH CHECK (get_my_role() >= 'guide');

CREATE POLICY "hubs: guide/mentor update"
  ON hubs FOR UPDATE
  USING (
    guide_id = get_my_profile_id()
    OR get_my_role() = 'mentor'
  );

-- ── circles ──
CREATE POLICY "circles: authenticated read non-archived"
  ON circles FOR SELECT
  USING (
    status != 'archived'
    OR get_my_role() >= 'host'
  );

CREATE POLICY "circles: guide+ insert"
  ON circles FOR INSERT WITH CHECK (get_my_role() >= 'guide');

CREATE POLICY "circles: host/guide/mentor update"
  ON circles FOR UPDATE
  USING (
    host_id = get_my_profile_id()
    OR get_my_role() >= 'guide'
  );

CREATE POLICY "circles: mentor delete"
  ON circles FOR DELETE USING (get_my_role() = 'mentor');

-- ── memberships ──
CREATE POLICY "memberships: read in same circle or host sees their circle"
  ON memberships FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR (
      get_my_role() >= 'crew'
      AND circle_id = ANY(get_my_circle_ids())
    )
    OR (
      get_my_role() >= 'host'
      AND circle_id IN (
        SELECT id FROM circles WHERE host_id = get_my_profile_id()
      )
    )
  );

CREATE POLICY "memberships: crew+ join own"
  ON memberships FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "memberships: leave own or host removes"
  ON memberships FOR DELETE
  USING (
    profile_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND circle_id IN (
        SELECT id FROM circles WHERE host_id = get_my_profile_id()
      )
    )
  );

-- ── channels ──
CREATE POLICY "channels: crew+ read public"
  ON channels FOR SELECT
  USING (
    get_my_role() >= 'crew'
    AND (is_public = true OR creator_id = get_my_profile_id())
  );

CREATE POLICY "channels: host+ create"
  ON channels FOR INSERT
  WITH CHECK (
    get_my_role() >= 'host'
    AND creator_id = get_my_profile_id()
  );

CREATE POLICY "channels: creator or mentor update"
  ON channels FOR UPDATE
  USING (
    creator_id = get_my_profile_id()
    OR get_my_role() = 'mentor'
  );

CREATE POLICY "channels: creator or mentor delete"
  ON channels FOR DELETE
  USING (
    creator_id = get_my_profile_id()
    OR get_my_role() = 'mentor'
  );

-- ── channel_memberships ──
CREATE POLICY "channel_memberships: read own or creator"
  ON channel_memberships FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR channel_id IN (
      SELECT id FROM channels WHERE creator_id = get_my_profile_id()
    )
  );

CREATE POLICY "channel_memberships: crew+ join own"
  ON channel_memberships FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND profile_id = get_my_profile_id()
  );

CREATE POLICY "channel_memberships: leave own"
  ON channel_memberships FOR DELETE
  USING (profile_id = get_my_profile_id());


-- ---------------------------------------------------------------------------
-- STEP 7: Recreate posts and events RLS referencing circles
-- ---------------------------------------------------------------------------

-- Posts now scope to circle IDs (get_my_group_ids() returns circle IDs via alias)
CREATE POLICY "posts: crew+ read by visibility"
  ON posts FOR SELECT
  USING (
    get_my_role() >= 'crew'
    AND (
      visibility = 'public'
      OR (visibility = 'region'              AND scope_id = get_my_region_id())
      OR (visibility IN ('cluster','group')  AND scope_id = ANY(get_my_circle_ids()))
    )
  );

CREATE POLICY "posts: crew+ insert in scope"
  ON posts FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND author_id = get_my_profile_id()
    AND (
      visibility = 'public'
      OR (visibility = 'region'              AND scope_id = get_my_region_id())
      OR (visibility IN ('cluster','group')  AND scope_id = ANY(get_my_circle_ids()))
    )
  );

CREATE POLICY "posts: author update or host pins in circle"
  ON posts FOR UPDATE
  USING (
    author_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND scope_id IN (SELECT id FROM circles WHERE host_id = get_my_profile_id())
    )
  );

CREATE POLICY "posts: author delete or host removes in circle"
  ON posts FOR DELETE
  USING (
    author_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND scope_id IN (SELECT id FROM circles WHERE host_id = get_my_profile_id())
    )
  );

-- Events scoped to circles (scope_type = 'circle')
CREATE POLICY "events: crew+ read in scope"
  ON events FOR SELECT
  USING (
    get_my_role() >= 'crew'
    AND (
      (scope_type = 'circle' AND scope_id = ANY(get_my_circle_ids()))
      OR (scope_type = 'region' AND scope_id = get_my_region_id())
    )
  );

CREATE POLICY "events: host+ insert"
  ON events FOR INSERT
  WITH CHECK (
    get_my_role() >= 'host'
    AND host_id = get_my_profile_id()
  );

CREATE POLICY "events: host/guide/mentor update in scope"
  ON events FOR UPDATE
  USING (
    host_id = get_my_profile_id()
    OR (
      get_my_role() >= 'guide'
      AND scope_id = ANY(get_my_circle_ids())
    )
  );

CREATE POLICY "events: mentor delete"
  ON events FOR DELETE USING (get_my_role() = 'mentor');


-- ---------------------------------------------------------------------------
-- STEP 8: Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_outposts_region_id       ON outposts (region_id);
CREATE INDEX idx_outposts_slug            ON outposts (slug);
CREATE INDEX idx_nexuses_outpost_id       ON nexuses  (outpost_id);
CREATE INDEX idx_nexuses_slug             ON nexuses  (slug);
CREATE INDEX idx_hubs_nexus_id            ON hubs     (nexus_id);
CREATE INDEX idx_hubs_slug                ON hubs     (slug);
CREATE INDEX idx_circles_hub_id           ON circles  (hub_id);
CREATE INDEX idx_circles_slug             ON circles  (slug);
CREATE INDEX idx_memberships_profile_id   ON memberships (profile_id);
CREATE INDEX idx_memberships_circle_id    ON memberships (circle_id);
CREATE INDEX idx_channels_scope           ON channels (scope, scope_id);
CREATE INDEX idx_channel_memberships_prof ON channel_memberships (profile_id);
CREATE INDEX idx_channel_memberships_chan ON channel_memberships (channel_id);
