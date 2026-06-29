-- T0 RLS convergence (practices-admin) — add the creator + staff UPDATE arm so the
-- practices-admin actions can run on the SESSION client (off the RLS-bypassing admin client).
--
-- The existing practices_space_writable_upd policy authorizes the space owner / active
-- editor-moderator-admin member / platform staff (via can_write_space_content, fixed in
-- 20260902000000). But the app capability practice.editSettings ALSO grants the practice
-- CREATOR (practices.created_by) and platform staff regardless of space membership. Without
-- this arm, converging the admin actions to the session client would lock a creator out of
-- editing their own practice.
--
-- This additive UPDATE policy supplies the creator + staff arm using the correct identity
-- idiom: get_my_profile_id() for the profile-id ownership column (NEVER auth.uid(), since
-- profiles.id <> auth_user_id) and get_my_web_role() for staff. Postgres ORs permissive
-- UPDATE policies, so a creator/staff passes here and a space-manager passes via the
-- existing policy. Additive + reversible; validated by a BEGIN/ROLLBACK dry-run on prod.

create policy "practices: creator or staff update" on public.practices
  for update
  using (
    created_by = public.get_my_profile_id()
    or public.get_my_web_role() in ('admin', 'janitor')
  )
  with check (
    created_by = public.get_my_profile_id()
    or public.get_my_web_role() in ('admin', 'janitor')
  );
