-- Tighten the contacts SELECT policy to the OPERATOR set (meta-scan CRM tenancy audit, 2026-07-25).
--
-- `contacts_space_read` granted `is_space_member(space_id)` — ANY active member of a Space (even a
-- plain 'member'/'viewer' role) could client-read that Space's ENTIRE CRM contact book via PostgREST:
-- every lead's email, display name, consent_state, engagement/at-risk scores. Every app surface
-- already gates CRM reads at the operator level (requireSpaceEditor / resolveSpaceManageAccess), and
-- every server read goes through the admin client (verified: zero user-client `.from('contacts')`
-- readers in the app), so the member-wide SELECT was a dormant over-exposure with no legitimate
-- consumer — but directly exploitable with a member JWT + the anon key.
--
-- New floor: `can_write_space_content(space_id)` = the space owner / editor / moderator / admin (and
-- platform staff for the root/NULL lane) — the same set the write policies already require — plus the
-- explicit platform-staff clause for cross-lane admin reads. Within-tenant role isolation now matches
-- the app's own gates, completing the "safeties so nothing bleeds through" contract (write policies
-- were already operator-only; reads now match).
--
-- Idempotent (drop + recreate). Reversible: recreate with is_space_member(space_id).

drop policy if exists contacts_space_read on public.contacts;
create policy contacts_space_read on public.contacts
  for select using (
    public.can_write_space_content(space_id)
    or public.get_my_web_role() in ('admin', 'janitor')
  );
