-- Phase F follow-up: clear the last 2 multiple_permissive_policies advisor findings
-- (both role {authenticated}), taking the advisor count to 0. Predicates are byte-faithful
-- copies of the live policies (verified against pg_policies). RESTRICTIVE policies untouched.

-- ============================================================================================
-- space_subscription_items (SELECT): trivial 2 -> 1 OR merge (owner/admin + staff).
-- ============================================================================================
drop policy if exists "space_subscription_items: owner or admin read" on public.space_subscription_items;
drop policy if exists "space_subscription_items: staff read" on public.space_subscription_items;
create policy "space_subscription_items: owner, admin, or staff read"
  on public.space_subscription_items for select to authenticated
  using (
    (space_id in (select s.id from spaces s where s.owner_profile_id = (select public.get_my_profile_id())))
    or (space_id in (
      select sm.space_id from space_members sm
      where sm.profile_id = (select public.get_my_profile_id()) and sm.role = 'admin' and sm.status = 'active'
    ))
    or ((select public.get_my_web_role()) = any (array['admin', 'janitor']))
  );

-- ============================================================================================
-- dispatch_likes: SHAPE CHANGE. An ALL policy ("manage own") overlapped a SELECT-true read
-- policy on the SELECT action (two permissive SELECT policies). Split the ALL policy into
-- explicit INSERT/UPDATE/DELETE own policies and keep the SELECT-true read: on SELECT,
-- (own OR true) == true, so the own-clause was redundant there. After this, SELECT has exactly
-- one permissive policy (true) and each write action has one (own). No app path references the
-- policy NAME (RLS is enforced DB-side; names are never used in code).
--
-- own = the caller's profile row (auth_user_id -> profiles.id), byte-faithful to the original.
-- ============================================================================================
drop policy if exists "Users can manage their own likes" on public.dispatch_likes;

create policy "dispatch_likes: insert own"
  on public.dispatch_likes for insert to authenticated
  with check (profile_id = (select profiles.id from profiles where profiles.auth_user_id = (select auth.uid())));

create policy "dispatch_likes: update own"
  on public.dispatch_likes for update to authenticated
  using (profile_id = (select profiles.id from profiles where profiles.auth_user_id = (select auth.uid())))
  with check (profile_id = (select profiles.id from profiles where profiles.auth_user_id = (select auth.uid())));

create policy "dispatch_likes: delete own"
  on public.dispatch_likes for delete to authenticated
  using (profile_id = (select profiles.id from profiles where profiles.auth_user_id = (select auth.uid())));

-- The SELECT read policy "Authenticated users can read dispatch likes" (qual true) is left intact.
