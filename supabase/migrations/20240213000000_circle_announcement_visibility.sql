-- Circle announcements as a "group hub" broadcast.
--
-- Until now, `cluster` and `group` post visibility were treated identically:
-- both were readable only by members of the post's circle (scope_id in
-- get_my_circle_ids()). This migration splits them:
--
--   * group   = circle-only (a member's post in a circle). Unchanged.
--   * cluster = a host/new-circle ANNOUNCEMENT. Readable by circle members
--               PLUS the wider hub if the circle has one, else the followers
--               of its topical channel (the "tuned-in" audience).
--
-- scope_id always stays the circle id (provenance + simple circle-page query);
-- the wider audience is resolved dynamically against the circle's hub_id /
-- topical_channel_id at read time.

-- Hubs have no membership table of their own: a profile belongs to a hub by
-- being an active member of any circle inside that hub.
CREATE OR REPLACE FUNCTION public.get_my_hub_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT c.hub_id
      FROM   memberships m
      JOIN   profiles    p ON p.id = m.profile_id
      JOIN   circles     c ON c.id = m.circle_id
      WHERE  p.auth_user_id = auth.uid()
        AND  m.status = 'active'
        AND  c.hub_id IS NOT NULL
    ),
    '{}'::uuid[]
  );
$function$;

-- Topical channels I follow ("tuned in"): the audience for a hub-less circle's
-- announcements.
CREATE OR REPLACE FUNCTION public.get_my_tuned_channel_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    ARRAY(
      SELECT tcm.topical_channel_id
      FROM   topical_channel_memberships tcm
      JOIN   profiles p ON p.id = tcm.profile_id
      WHERE  p.auth_user_id = auth.uid()
    ),
    '{}'::uuid[]
  );
$function$;

-- READ: crew+ see public, their region, their circles' group posts, and any
-- cluster announcement whose circle they can reach (member, hub, or channel).
DROP POLICY IF EXISTS "posts: crew+ read by visibility" ON public.posts;
CREATE POLICY "posts: crew+ read by visibility" ON public.posts
  FOR SELECT
  USING (
    get_my_role() >= 'crew'::community_role
    AND (
      visibility = 'public'::post_visibility
      OR (visibility = 'region'::post_visibility AND scope_id = get_my_region_id())
      OR (visibility = 'group'::post_visibility AND scope_id = ANY(get_my_circle_ids()))
      OR (
        visibility = 'cluster'::post_visibility
        AND (
          scope_id = ANY(get_my_circle_ids())
          OR EXISTS (
            SELECT 1 FROM circles c
            WHERE c.id = scope_id
              AND (
                (c.hub_id IS NOT NULL AND c.hub_id = ANY(get_my_hub_ids()))
                OR (c.hub_id IS NULL AND c.topical_channel_id = ANY(get_my_tuned_channel_ids()))
              )
          )
        )
      )
    )
  );

-- INSERT: a group post requires circle membership; a cluster announcement may
-- also be posted by the circle's host (who broadcasts to the wider audience).
DROP POLICY IF EXISTS "posts: crew+ insert in scope" ON public.posts;
CREATE POLICY "posts: crew+ insert in scope" ON public.posts
  FOR INSERT
  WITH CHECK (
    get_my_role() >= 'crew'::community_role
    AND author_id = get_my_profile_id()
    AND (
      visibility = 'public'::post_visibility
      OR (visibility = 'region'::post_visibility AND scope_id = get_my_region_id())
      OR (visibility = 'group'::post_visibility AND scope_id = ANY(get_my_circle_ids()))
      OR (
        visibility = 'cluster'::post_visibility
        AND (
          scope_id = ANY(get_my_circle_ids())
          OR EXISTS (
            SELECT 1 FROM circles c
            WHERE c.id = scope_id AND c.host_id = get_my_profile_id()
          )
        )
      )
    )
  );
