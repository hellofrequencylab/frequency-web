-- SECURITY FIX: make the `spaces` SELECT policy visibility-aware.
--
-- THE LEAK: the only SELECT policy on `spaces` was `spaces_read_active` USING (status = 'active'),
-- which is visibility-BLIND. A browser anon-key client exists (NEXT_PUBLIC_SUPABASE_ANON_KEY), so
-- anyone could `select * from public.spaces where visibility = 'private'` directly and read every
-- Private space's metadata (slug, name, brand_*, type, owner_profile_id, entitlements). The app-side
-- getVisibleSpaceBySlug gate is correct but is enforced only in app code; the table did not honor it.
-- (Member lists, bookings, and availability were never exposed: those tables are service-role-only.)
--
-- THE FIX: a Private space is readable by a direct client ONLY for its owner or an active member;
-- network (or unset) spaces stay publicly readable, which preserves the directory/profile/discovery
-- behavior. The app itself reads `spaces` through the service-role admin client (lib/spaces/store.ts),
-- which bypasses RLS, so app behavior is unchanged: this purely closes the direct-query hole.
--
-- is_space_member is SECURITY DEFINER (ADR-056 pattern, same as is_space_admin) so it reads
-- spaces/space_members as the owner and never re-enters their RLS. EXECUTE is granted to authenticated
-- AND anon because the policy applies to both roles (for anon, auth.uid() is null -> the function
-- returns false -> anon sees only non-private spaces).

create or replace function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.spaces s
    where s.id = p_space_id and s.owner_profile_id = (select auth.uid())
  ) or exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id
      and m.profile_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

comment on function public.is_space_member(uuid) is
  'True if the current auth.uid() is the owner or an ACTIVE member (any role) of the given Space. SECURITY DEFINER so it reads spaces/space_members without re-entering their RLS (ADR-056). Used by the visibility-aware spaces_read_active policy to wall Private spaces from non-members at the DB layer. Pinned search_path.';

revoke all on function public.is_space_member(uuid) from public;
grant execute on function public.is_space_member(uuid) to authenticated, anon;

-- Replace the visibility-blind policy with the visibility-aware one. `visibility is distinct from
-- 'private'` treats network AND null/unset as visible (matching getSpaceVisibility's default), and
-- walls only explicit Private spaces to owner/members.
drop policy if exists spaces_read_active on public.spaces;
create policy spaces_read_active on public.spaces
  for select
  using (
    status = 'active'
    and (visibility is distinct from 'private' or public.is_space_member(id))
  );
