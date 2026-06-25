-- SECURITY FIX: the Space DB gates compared the wrong UUID space, so they were always false.
--
-- THE BUG: is_space_member / is_space_admin (and the space_members_read self-row check) compared
-- spaces.owner_profile_id and space_members.profile_id — both FOREIGN KEYS to profiles.id — against
-- auth.uid(), which is the AUTH user id (it matches profiles.auth_user_id, NOT profiles.id). The two
-- id spaces never coincide, so every predicate evaluated false even for a Space's real owner/members.
--
-- IMPACT: a broken defense-in-depth wall, not a live leak. The app reads spaces / space_members /
-- commerce_* through the service-role admin client (which bypasses RLS), so production behavior was
-- unaffected and the bug stayed masked. But any session-client read (the direction RLS convergence,
-- ADR-042, is moving toward) was wrongly denied to legitimate members — including reads of their own
-- Private spaces' content (space_content_isolation), commerce products/orders, and membership rows.
--
-- THE FIX: resolve the caller's profile id with the canonical get_my_profile_id() helper
-- (20240101000001_rls_policies.sql — the same SELECT id FROM profiles WHERE auth_user_id = auth.uid()
-- pattern used in 169 places), exactly as the newer listings/commerce RLS already does. For anon,
-- get_my_profile_id() is null, so every predicate stays false (anon still sees only non-Private spaces).
-- Both functions stay SECURITY DEFINER with a pinned search_path; signatures and grants are unchanged.
-- All call sites are `for select` (read) policies, so this loosens no write path. Idempotent + safe to re-run.

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_profile_id = get_my_profile_id()
  ) or exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id
      and m.profile_id = get_my_profile_id()
      and m.status = 'active'
  );
$$;

revoke all on function public.is_space_member(uuid) from public;
grant execute on function public.is_space_member(uuid) to authenticated, anon;

create or replace function public.is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_profile_id = get_my_profile_id()
  ) or exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id
      and m.profile_id = get_my_profile_id()
      and m.role = 'admin'
      and m.status = 'active'
  );
$$;

revoke all on function public.is_space_admin(uuid) from public;
revoke all on function public.is_space_admin(uuid) from anon;
grant execute on function public.is_space_admin(uuid) to authenticated;

-- The space_members_read policy carried the identical bug inline: `(select auth.uid()) = profile_id`
-- compared the auth user id to a profiles.id FK, so a member could not even read their OWN membership
-- row via the session client. Recreate it with the helper (definition otherwise unchanged from
-- 20260714010000_tenancy_hardening.sql). Writes stay service-role-only (no write policies touched).
drop policy if exists space_members_read on public.space_members;
create policy space_members_read on public.space_members
  for select to authenticated
  using (
    profile_id = get_my_profile_id()
    or public.is_space_admin(space_id)
  );
