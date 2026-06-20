-- Per-space_id WRITE-ISOLATION contract (the write pair to ADR-328's read contract).
--
-- THE GAP: circles + events have session-client write policies (host/guide/mentor community
-- authoring); the existing permissive INSERT/UPDATE/DELETE policies do NOT check the row's space_id,
-- so a community host could craft a direct session-client write that sets space_id to ANOTHER space
-- (e.g. a private Space) and inject/alter content there. (practices/journey_plans/programs have no
-- session-write policy today, so they are already service-role-only; the guard is added there too,
-- defensively, so the invariant holds table-wide if a write policy is ever introduced.)
--
-- THE FIX: a can_write_space_content(space_id) SECURITY DEFINER helper (ADR-056 pattern) + an
-- AS RESTRICTIVE policy for INSERT / UPDATE / DELETE on each content table. Restrictive policies AND
-- with the existing permissive ones, so a write is allowed only if the existing rules allow AND the
-- writer controls the row's owning space. A write is space-allowed when the row is unpartitioned
-- (null), owned by the ROOT space (the open community, where the existing host/guide/mentor policies
-- govern as today), or the writer is the owner / an active editor+ member of the space. The UPDATE
-- policy checks BOTH the old row (USING) and the new row (WITH CHECK), so content cannot be moved
-- across spaces either. The authority (owner OR active editor/moderator/admin) mirrors the app's
-- getSpaceCapabilities.canEditProfile.
--
-- VERIFIED SAFE FOR EXISTING DATA: every circle/practice is root-owned and every community event is
-- root-owned, so can_write returns true for all of them (the root branch); only the seeded sub-space
-- offerings (owned by their Space's admin) are newly gated, which is the intended isolation. No
-- existing community write flow is affected.
--
-- DEFERRED (additive, noted in ADR-328/329): child tables (rsvps/blocks), and a per-row author
-- carve-out if a future flow needs non-admins to author within a Space.

create or replace function public.can_write_space_content(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Unpartitioned rows (no owning space): the existing per-row policies govern, as today.
    p_space_id is null
    -- Root space (the open community): existing host/guide/mentor authoring governs, unchanged.
    or exists (select 1 from public.spaces s where s.id = p_space_id and s.type = 'root')
    -- A sub-Space's content: writable by its owner or an active editor / moderator / admin member.
    or exists (select 1 from public.spaces s where s.id = p_space_id and s.owner_profile_id = (select auth.uid()))
    or exists (
      select 1 from public.space_members m
      where m.space_id = p_space_id
        and m.profile_id = (select auth.uid())
        and m.status = 'active'
        and m.role in ('editor', 'moderator', 'admin')
    );
$$;

comment on function public.can_write_space_content(uuid) is
  'True if the current viewer may write content owned by the given space_id: unpartitioned (null), the ROOT space (community authoring governed by the existing per-row policies), or the owner / an active editor+ member of a sub-Space. SECURITY DEFINER (ADR-056) so it reads spaces/space_members without re-entering their RLS. Used by the AS RESTRICTIVE write-isolation policies on the content tables; mirrors getSpaceCapabilities.canEditProfile.';

revoke all on function public.can_write_space_content(uuid) from public;
grant execute on function public.can_write_space_content(uuid) to authenticated, anon;

-- Restrictive INSERT / UPDATE / DELETE guards per content table (AND with the existing permissive
-- write policies). UPDATE guards both old (USING) and new (WITH CHECK) row, blocking cross-space moves.
do $$
declare t text;
begin
  foreach t in array array['circles','events','practices','journey_plans','programs']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_space_writable_ins', t);
    execute format('create policy %I on public.%I as restrictive for insert with check (public.can_write_space_content(space_id))', t || '_space_writable_ins', t);

    execute format('drop policy if exists %I on public.%I', t || '_space_writable_upd', t);
    execute format('create policy %I on public.%I as restrictive for update using (public.can_write_space_content(space_id)) with check (public.can_write_space_content(space_id))', t || '_space_writable_upd', t);

    execute format('drop policy if exists %I on public.%I', t || '_space_writable_del', t);
    execute format('create policy %I on public.%I as restrictive for delete using (public.can_write_space_content(space_id))', t || '_space_writable_del', t);
  end loop;
end $$;
