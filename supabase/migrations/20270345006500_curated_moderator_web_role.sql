-- OWN-054 / ADR-1466: a granted Platform moderator on profiles.web_role.
--
-- The 2026-09-08 ruling minted a curated moderator web_role. It arrives by GRANT,
-- never as a side effect of publishing a Circle. It is NOT staff: isStaff stays
-- admin/janitor, so this value does not open /admin. The four action helpers
-- (delete/pin post, library review, achievement grant) admit it in code.
--
-- This file:
--   1. Widens the CHECK so the value can be stored.
--   2. Adds the moderator arm to the two posts write policies, so a user-scoped
--      client matches the action helpers. Staff still writes through the admin
--      client. Do NOT add moderator to get_my_web_role() IN ('admin','janitor')
--      elsewhere — that would open CRM, insights, and Space write paths.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_web_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_web_role_check
  CHECK (web_role IN ('none', 'admin', 'janitor', 'moderator'));

COMMENT ON COLUMN public.profiles.web_role IS
  'Operational axis (NAMING.md §Roles, ADR-208, ADR-1466): none | admin (Site Admin) | janitor (Executive Admin) | moderator (Platform moderator, granted, not staff). Independent of the community_role trust ladder. Staff may enter admin surfaces; janitor holds the crown jewels; moderator may moderate the feed, library, and achievements without being staff. The team_members matrix (ADR-127) stays as the fine-grained per-domain layer.';

DROP POLICY IF EXISTS "posts: author update or host pins in circle" ON public.posts;
CREATE POLICY "posts: author update or host pins in circle"
  ON public.posts FOR UPDATE
  USING (
    author_id = private.get_my_profile_id()
    OR private.get_my_web_role() = 'moderator'
    OR (
      private.get_my_role() >= 'host'
      AND scope_id IN (SELECT id FROM public.circles WHERE host_id = private.get_my_profile_id())
    )
  );

DROP POLICY IF EXISTS "posts: author delete or host removes in circle" ON public.posts;
CREATE POLICY "posts: author delete or host removes in circle"
  ON public.posts FOR DELETE
  USING (
    author_id = private.get_my_profile_id()
    OR private.get_my_web_role() = 'moderator'
    OR (
      private.get_my_role() >= 'host'
      AND scope_id IN (SELECT id FROM public.circles WHERE host_id = private.get_my_profile_id())
    )
  );
