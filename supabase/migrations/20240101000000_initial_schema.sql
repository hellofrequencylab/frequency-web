-- =============================================================================
-- Frequency Community Platform — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE community_role AS ENUM ('member', 'crew', 'host', 'guide', 'mentor');
CREATE TYPE post_type      AS ENUM ('feed', 'blog', 'announcement', 'recap');
CREATE TYPE post_visibility AS ENUM ('public', 'region', 'cluster', 'group');


-- ---------------------------------------------------------------------------
-- Helper: updated_at trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- 1. nexus_regions
--    Hierarchical geography tree (regions, clusters, sub-regions, etc.)
-- ---------------------------------------------------------------------------

CREATE TABLE nexus_regions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL,
  -- Materialised path for efficient subtree queries (e.g. '/us/west/sf')
  full_path  text,
  parent_id  uuid        REFERENCES nexus_regions (id),
  depth      integer     DEFAULT 0,
  -- Resolved after profiles table exists (FK added at bottom of file)
  mentor_id  uuid,
  meta       jsonb       DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 2. profiles
--    One row per community member; linked 1-to-1 with auth.users.
-- ---------------------------------------------------------------------------

CREATE TABLE profiles (
  id               uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id     uuid           REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name     text           NOT NULL,
  handle           text           UNIQUE NOT NULL,
  -- Freeform tags describing what kind of entity this profile represents
  entity_types     text[]         DEFAULT '{}',
  community_role   community_role DEFAULT 'member',
  is_crew_lead     boolean        DEFAULT false,
  nexus_region_id  uuid           REFERENCES nexus_regions (id),
  bio              text,
  avatar_url       text,
  website          text,
  meta             jsonb          DEFAULT '{}',
  is_active        boolean        DEFAULT true,
  -- Semantic embedding for similarity search (all-MiniLM-L6-v2 produces 384d)
  embedding        vector(384),
  created_at       timestamptz    DEFAULT now(),
  updated_at       timestamptz    DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. groups
--    Local community groups nested under a nexus_region.
-- ---------------------------------------------------------------------------

CREATE TABLE groups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  slug            text        NOT NULL,
  region_id       uuid        REFERENCES nexus_regions (id),
  host_id         uuid        REFERENCES profiles (id),
  guide_id        uuid        REFERENCES profiles (id),
  -- Marks the canonical "home" group for a guide
  is_guide_home   boolean     DEFAULT false,
  parent_group_id uuid        REFERENCES groups (id),
  capacity        integer     DEFAULT 50,
  -- Maintained by triggers on group_memberships
  member_count    integer     DEFAULT 0,
  is_active       boolean     DEFAULT true,
  about           text,
  embedding       vector(384),
  created_at      timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 4. group_memberships
--    Join table tracking which profiles belong to which groups.
-- ---------------------------------------------------------------------------

CREATE TABLE group_memberships (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  group_id     uuid        NOT NULL REFERENCES groups   (id) ON DELETE CASCADE,
  is_crew_lead boolean     DEFAULT false,
  joined_at    timestamptz DEFAULT now(),
  UNIQUE (profile_id, group_id)
);

-- Keep groups.member_count in sync automatically
CREATE OR REPLACE FUNCTION trg_increment_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_group_memberships_insert
  AFTER INSERT ON group_memberships
  FOR EACH ROW EXECUTE FUNCTION trg_increment_member_count();

CREATE OR REPLACE FUNCTION trg_decrement_member_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE groups SET member_count = member_count - 1 WHERE id = OLD.group_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_group_memberships_delete
  AFTER DELETE ON group_memberships
  FOR EACH ROW EXECUTE FUNCTION trg_decrement_member_count();


-- ---------------------------------------------------------------------------
-- 5. posts
--    Content published into a group, region, cluster, or globally.
--    scope_id points to the relevant group / region / etc. row.
-- ---------------------------------------------------------------------------

CREATE TABLE posts (
  id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  uuid           NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  post_type  post_type      DEFAULT 'feed',
  visibility post_visibility DEFAULT 'group',
  -- Polymorphic scope: the UUID of the group, region, etc.
  scope_id   uuid,
  body       text,
  media_urls text[]         DEFAULT '{}',
  is_pinned  boolean        DEFAULT false,
  created_at timestamptz    DEFAULT now(),
  updated_at timestamptz    DEFAULT now()
);

CREATE TRIGGER trg_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 6. events
--    Scheduled gatherings; scope_type/scope_id describe where they live.
-- ---------------------------------------------------------------------------

CREATE TABLE events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text        NOT NULL,
  description     text,
  host_id         uuid        REFERENCES profiles (id),
  -- Polymorphic scope (e.g. scope_type='group', scope_id=<group uuid>)
  scope_id        uuid        NOT NULL,
  scope_type      text        NOT NULL,
  location        text,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz,
  slug            text        UNIQUE NOT NULL,
  is_cancelled    boolean     DEFAULT false,
  -- Mux live-stream identifiers (null when event is not streamed)
  mux_stream_id   text,
  mux_playback_id text,
  created_at      timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 7. event_rsvps
-- ---------------------------------------------------------------------------

CREATE TABLE event_rsvps (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events   (id) ON DELETE CASCADE,
  profile_id uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  status     text        NOT NULL CHECK (status IN ('going', 'not_going')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (event_id, profile_id)
);


-- ---------------------------------------------------------------------------
-- 8. crew_tasks
--    Catalogue of actions crew members can complete to earn points.
-- ---------------------------------------------------------------------------

CREATE TABLE crew_tasks (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text        NOT NULL,
  task_type            text        NOT NULL,
  points_value         integer     DEFAULT 10,
  is_repeatable        boolean     DEFAULT true,
  requires_verification boolean    DEFAULT false,
  created_at           timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 9. crew_completions
--    Records each time a crew member completes a task.
-- ---------------------------------------------------------------------------

CREATE TABLE crew_completions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  task_id       uuid        REFERENCES crew_tasks (id),
  points_earned integer     NOT NULL,
  -- Null until a verified task is approved by another crew member
  verified_by   uuid        REFERENCES profiles (id),
  completed_at  timestamptz DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- Deferred FK: nexus_regions.mentor_id → profiles
-- (profiles didn't exist when nexus_regions was created)
-- ---------------------------------------------------------------------------

ALTER TABLE nexus_regions
  ADD CONSTRAINT fk_mentor
  FOREIGN KEY (mentor_id) REFERENCES profiles (id);


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- profiles
CREATE INDEX idx_profiles_handle          ON profiles (handle);
CREATE INDEX idx_profiles_auth_user_id    ON profiles (auth_user_id);
CREATE INDEX idx_profiles_nexus_region_id ON profiles (nexus_region_id);
CREATE INDEX idx_profiles_embedding       ON profiles USING hnsw (embedding vector_cosine_ops);

-- groups
CREATE INDEX idx_groups_slug      ON groups (slug);
CREATE INDEX idx_groups_region_id ON groups (region_id);
CREATE INDEX idx_groups_embedding ON groups USING hnsw (embedding vector_cosine_ops);

-- posts
CREATE INDEX idx_posts_author_id  ON posts (author_id);
CREATE INDEX idx_posts_scope_id   ON posts (scope_id);
CREATE INDEX idx_posts_created_at ON posts (created_at);

-- events
CREATE INDEX idx_events_slug      ON events (slug);
CREATE INDEX idx_events_host_id   ON events (host_id);
CREATE INDEX idx_events_starts_at ON events (starts_at);

-- group_memberships
CREATE INDEX idx_group_memberships_profile_id ON group_memberships (profile_id);
CREATE INDEX idx_group_memberships_group_id   ON group_memberships (group_id);

-- nexus_regions
CREATE INDEX idx_nexus_regions_full_path ON nexus_regions (full_path);
CREATE INDEX idx_nexus_regions_slug      ON nexus_regions (slug);


-- ---------------------------------------------------------------------------
-- Trigger: auto-create profile on new auth user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (auth_user_id, display_name, handle)
  VALUES (
    NEW.id,
    NEW.email,
    -- Derive a unique handle from the email local-part + a short random suffix
    split_part(NEW.email, '@', 1) || '_' || substr(gen_random_uuid()::text, 1, 6)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
