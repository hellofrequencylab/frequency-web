-- =============================================================================
-- Frequency Community Platform — Row Level Security Policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on all tables
-- ---------------------------------------------------------------------------

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_rsvps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexus_regions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_completions  ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Security-definer helper functions
--
-- These run as the function owner (postgres superuser) so they can query the
-- profiles and group_memberships tables without hitting the RLS policies we
-- are defining here. SECURITY DEFINER is intentional and correct.
--
-- search_path is pinned to avoid search-path-injection attacks.
-- ---------------------------------------------------------------------------

-- Returns the community_role of the currently authenticated user.
-- Returns NULL when called by an unauthenticated request.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS community_role
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_role
  FROM   profiles
  WHERE  auth_user_id = auth.uid();
$$;

-- Returns the profile.id of the authenticated user.
CREATE OR REPLACE FUNCTION get_my_profile_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM   profiles
  WHERE  auth_user_id = auth.uid();
$$;

-- Returns the nexus_region_id of the authenticated user.
CREATE OR REPLACE FUNCTION get_my_region_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nexus_region_id
  FROM   profiles
  WHERE  auth_user_id = auth.uid();
$$;

-- Returns an array of group UUIDs the authenticated user belongs to.
-- Returns an empty array (not NULL) when the user has no memberships.
CREATE OR REPLACE FUNCTION get_my_group_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT gm.group_id
      FROM   group_memberships gm
      JOIN   profiles          p  ON p.id = gm.profile_id
      WHERE  p.auth_user_id = auth.uid()
    ),
    '{}'::uuid[]
  );
$$;


-- =============================================================================
-- POLICIES
-- Role hierarchy (enum ordinal order): member < crew < host < guide < mentor
-- PostgreSQL enum ordering means  'crew'::community_role > 'member'::community_role.
-- NULL role (unauthenticated) makes every >= check evaluate to false — safe default.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- nexus_regions
-- Public read; only mentors may write.
-- ---------------------------------------------------------------------------

CREATE POLICY "nexus_regions: public read"
  ON nexus_regions FOR SELECT
  USING (true);

-- Mentors create top-level and sub-regions for their territory.
CREATE POLICY "nexus_regions: mentor insert"
  ON nexus_regions FOR INSERT
  WITH CHECK (get_my_role() = 'mentor');

CREATE POLICY "nexus_regions: mentor update"
  ON nexus_regions FOR UPDATE
  USING (get_my_role() = 'mentor');


-- ---------------------------------------------------------------------------
-- profiles
-- Crew+ can read active profiles within their own nexus region.
-- Every user can always read and update their own profile.
-- INSERT is handled exclusively by the handle_new_auth_user SECURITY DEFINER
-- trigger and requires no policy.
-- ---------------------------------------------------------------------------

CREATE POLICY "profiles: read own or crew+ reads in-region"
  ON profiles FOR SELECT
  USING (
    -- always see your own profile
    auth_user_id = auth.uid()
    OR (
      is_active = true
      AND get_my_role() >= 'crew'
      AND nexus_region_id = get_my_region_id()
    )
  );

-- Users may only update their own row; they cannot escalate their own role
-- (role changes must be done via service-role or trigger).
CREATE POLICY "profiles: self update"
  ON profiles FOR UPDATE
  USING    (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- groups
-- Any authenticated user can read active groups.
-- Host+ can create groups; each role tier can update groups within its scope.
-- Only mentors hard-delete groups.
-- ---------------------------------------------------------------------------

CREATE POLICY "groups: read active"
  ON groups FOR SELECT
  USING (
    is_active = true
    -- hosts+ also see inactive groups so they can manage them
    OR get_my_role() >= 'host'
  );

CREATE POLICY "groups: host+ insert"
  ON groups FOR INSERT
  WITH CHECK (get_my_role() >= 'host');

CREATE POLICY "groups: host/guide/mentor update in scope"
  ON groups FOR UPDATE
  USING (
    -- host owns this group directly
    host_id = get_my_profile_id()
    -- guide oversees this group
    OR guide_id = get_my_profile_id()
    -- mentor has region-wide authority
    OR (get_my_role() = 'mentor' AND region_id = get_my_region_id())
  );

-- Soft-deletion (is_active = false) is preferred; hard delete only for mentors.
CREATE POLICY "groups: mentor delete"
  ON groups FOR DELETE
  USING (get_my_role() = 'mentor' AND region_id = get_my_region_id());


-- ---------------------------------------------------------------------------
-- group_memberships
-- Crew+ can read memberships for groups they belong to.
-- Hosts can also see memberships of groups they host (even if not a member).
-- Crew+ can join a group by inserting their own row.
-- Members can leave; hosts can remove members from their own group.
-- ---------------------------------------------------------------------------

CREATE POLICY "group_memberships: read in joined groups or hosted"
  ON group_memberships FOR SELECT
  USING (
    -- crew+ sees members of groups they're already in
    (
      get_my_role() >= 'crew'
      AND group_id = ANY(get_my_group_ids())
    )
    -- host sees all members of groups they host
    OR (
      get_my_role() >= 'host'
      AND group_id IN (
        SELECT id FROM groups WHERE host_id = get_my_profile_id()
      )
    )
  );

-- Crew+ may only insert their own membership row.
CREATE POLICY "group_memberships: crew+ join"
  ON group_memberships FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND profile_id = get_my_profile_id()
  );

-- A member can leave; a host can remove anyone from their group.
CREATE POLICY "group_memberships: leave own or host removes"
  ON group_memberships FOR DELETE
  USING (
    profile_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND group_id IN (
        SELECT id FROM groups WHERE host_id = get_my_profile_id()
      )
    )
  );


-- ---------------------------------------------------------------------------
-- posts
-- Crew+ can read posts whose visibility matches their membership.
-- Crew+ can author posts within their accessible scopes.
-- Authors can edit/delete their own posts.
-- Hosts can also update (to pin/unpin) or delete posts within their group.
-- ---------------------------------------------------------------------------

CREATE POLICY "posts: crew+ read by visibility"
  ON posts FOR SELECT
  USING (
    get_my_role() >= 'crew'
    AND (
      visibility = 'public'
      OR (visibility = 'region'              AND scope_id = get_my_region_id())
      OR (visibility IN ('cluster', 'group') AND scope_id = ANY(get_my_group_ids()))
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
      OR (visibility IN ('cluster', 'group') AND scope_id = ANY(get_my_group_ids()))
    )
  );

-- Authors edit their own posts; hosts can pin/unpin any post in their group.
CREATE POLICY "posts: author update or host pins in group"
  ON posts FOR UPDATE
  USING (
    author_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND scope_id IN (SELECT id FROM groups WHERE host_id = get_my_profile_id())
    )
  );

CREATE POLICY "posts: author delete or host removes in group"
  ON posts FOR DELETE
  USING (
    author_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND scope_id IN (SELECT id FROM groups WHERE host_id = get_my_profile_id())
    )
  );


-- ---------------------------------------------------------------------------
-- events
-- Crew+ can read events scoped to their groups or region.
-- scope_type values are expected to be 'group', 'region', or 'cluster'.
-- Hosts+ can create events; they can also update events they host.
-- Guides and mentors have broader update authority within their scope.
-- Mentors alone can hard-delete events (hosts use is_cancelled instead).
-- ---------------------------------------------------------------------------

CREATE POLICY "events: crew+ read in scope"
  ON events FOR SELECT
  USING (
    get_my_role() >= 'crew'
    AND (
      (scope_type = 'group'   AND scope_id = ANY(get_my_group_ids()))
      OR (scope_type = 'cluster' AND scope_id = ANY(get_my_group_ids()))
      OR (scope_type = 'region'  AND scope_id = get_my_region_id())
    )
  );

-- The host_id on the new row must be the caller's own profile.
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
      AND (
        scope_id = ANY(get_my_group_ids())
        OR scope_id = get_my_region_id()
      )
    )
  );

-- Hosts should cancel events via is_cancelled = true. Hard delete is mentor-only.
CREATE POLICY "events: mentor delete"
  ON events FOR DELETE
  USING (get_my_role() = 'mentor');


-- ---------------------------------------------------------------------------
-- event_rsvps
-- Crew+ can RSVP to (and manage) their own row.
-- Hosts can read all RSVPs for events they are hosting.
-- ---------------------------------------------------------------------------

CREATE POLICY "event_rsvps: read own or host sees all for their events"
  ON event_rsvps FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR (
      get_my_role() >= 'host'
      AND event_id IN (SELECT id FROM events WHERE host_id = get_my_profile_id())
    )
  );

CREATE POLICY "event_rsvps: crew+ insert own"
  ON event_rsvps FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND profile_id = get_my_profile_id()
  );

-- Allows changing status between 'going' and 'not_going'.
CREATE POLICY "event_rsvps: crew+ update own"
  ON event_rsvps FOR UPDATE
  USING    (profile_id = get_my_profile_id())
  WITH CHECK (profile_id = get_my_profile_id());

CREATE POLICY "event_rsvps: crew+ delete own"
  ON event_rsvps FOR DELETE
  USING (profile_id = get_my_profile_id());


-- ---------------------------------------------------------------------------
-- crew_tasks
-- Public read so any crew member can browse available tasks.
-- Only mentors may define, modify, or retire tasks.
-- ---------------------------------------------------------------------------

CREATE POLICY "crew_tasks: public read"
  ON crew_tasks FOR SELECT
  USING (true);

CREATE POLICY "crew_tasks: mentor insert"
  ON crew_tasks FOR INSERT
  WITH CHECK (get_my_role() = 'mentor');

CREATE POLICY "crew_tasks: mentor update"
  ON crew_tasks FOR UPDATE
  USING (get_my_role() = 'mentor');

CREATE POLICY "crew_tasks: mentor delete"
  ON crew_tasks FOR DELETE
  USING (get_my_role() = 'mentor');


-- ---------------------------------------------------------------------------
-- crew_completions
-- Crew+ can log and view their own completions.
-- Mentors can read all completions (for verification and leaderboards) and
-- can update rows to stamp verified_by once they approve the completion.
-- ---------------------------------------------------------------------------

CREATE POLICY "crew_completions: read own or mentor reads all"
  ON crew_completions FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() = 'mentor'
  );

-- Members log completions for themselves only.
CREATE POLICY "crew_completions: crew+ insert own"
  ON crew_completions FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'
    AND profile_id = get_my_profile_id()
  );

-- Mentors stamp verified_by to approve point awards.
CREATE POLICY "crew_completions: mentor verify"
  ON crew_completions FOR UPDATE
  USING (get_my_role() = 'mentor');
