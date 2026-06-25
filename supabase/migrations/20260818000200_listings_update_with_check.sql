-- DEFENSE-IN-DEPTH: give the listings UPDATE policy a WITH CHECK so a row owner can't reassign it.
--
-- THE GAP: listings_update (20260815000100_listings_core_housing.sql) had only a USING clause
-- (`owner_profile_id = get_my_profile_id()`) and no WITH CHECK. USING gates which rows you may
-- update; WITH CHECK gates what the row may become. Without it, an owner editing their own listing
-- via the session client could set owner_profile_id to ANOTHER profile and hand the row away. Today
-- listing writes route through the service-role admin client, so this is defense-in-depth, not a
-- live hole — but the sibling insert/select/delete policies already pin the owner, so update should
-- too. Idempotent + safe to re-run.

drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings
  for update
  using (owner_profile_id = get_my_profile_id())
  with check (owner_profile_id = get_my_profile_id());
