-- page_settings joins the tenancy walls.
--
-- The walls phase (20270206000000) covered the space_*/CRM resource tables but stopped one
-- table short. page_settings held the only policy of its kind left in the system:
--
--   page_settings_read_authenticated | SELECT | {authenticated} | USING (true)
--
-- Every signed-in member could read every Space's page configuration: the full `layout`
-- block tree, `status` (so unpublished drafts), `visibility_role` (so the gate on a
-- restricted route), and all SEO fields. The table is keyed (space_id, route) and carries
-- an FK to spaces, so the tenancy dimension was there all along and the policy ignored it.
--
-- The replacement is the same shape as the batch-1 resource quads:
--   1. whoever can write the Space's content can read its rows (owner, space admin/editor/
--      moderator, and platform staff on root-type Spaces) -- via private.can_write_space_content
--   2. platform staff, explicitly -- the arm the batch-1 quads carry so a janitor can support
--      a member Space, which can_write_space_content grants only for root Spaces
--   3. everyone else sees PUBLISHED rows only, and only for a Space they are allowed to see
--      at all (private Spaces stay members-only) -- via private.can_view_space_content
--
-- No write arms are added here. Every write path goes through the service-role client
-- (lib/page-settings/store.ts, lib/page-settings/actions.ts), which bypasses RLS, so adding
-- write policies now would be dead code that implies a capability the app does not use.
-- Reads travel the same service-role path today, which is exactly why this change carries
-- no runtime regression risk: it closes the hole a direct session-client read would open.
--
-- visibility_role stays an application-level gate. The DB floor is "published, in a Space
-- you can see"; the role gate on top of that is enforced where the page renders.

drop policy if exists page_settings_read_authenticated on public.page_settings;

create policy page_settings_space_visible on public.page_settings
  for select
  to authenticated
  using (
    private.can_write_space_content(space_id)
    or private.get_my_web_role() in ('admin', 'janitor')
    or (
      status = 'published'
      and private.can_view_space_content(space_id)
    )
  );
