-- Per-space_id READ-ISOLATION contract (the deferred ADR-321 "contract" phase; audit-flagged).
--
-- THE GAP: circles/events/practices/journey_plans/programs each carry a `space_id` (the tenancy
-- axis), but their SELECT policies are space-BLIND: they enforce the row's own visibility (event
-- status, circle archive, program approval) without regard to the OWNING SPACE's visibility. Today
-- this leaks nothing because every row is owned by a network space (the root, or the network demos),
-- so there is no private-space content yet. This closes the gap BEFORE a Private space owns content:
-- a Private space's circles/events/practices/journeys must not be readable by non-members.
--
-- THE MECHANISM: an `AS RESTRICTIVE` SELECT policy per table. Restrictive policies AND with the
-- existing permissive policy, so a row is visible only if (its own rules allow) AND (the owning space
-- is visible to the viewer). For network/root/unpartitioned content the guard is a no-op (it returns
-- true), so existing behavior is exactly preserved; only Private-space content is walled to its
-- owner + active members. The guard runs through a SECURITY DEFINER helper (ADR-056 pattern, like
-- is_space_admin / is_space_member) so it reads spaces/space_members without re-entering their RLS.
--
-- SCOPE: the five space_id-bearing CONTENT tables. The space_* tables are already service-role-only
-- (RLS, no policies). pages/page_settings (layout infra, read via the admin client) are a SEPARATE
-- follow-up. Child tables (rsvps, memberships, blocks) inherit visibility through their parent today
-- and are a later expansion. WRITE isolation (only a space's editors write its content) is also a
-- later step; this contract is reads.
--
-- PERF: for the common case (network/root content) the helper short-circuits on the visibility EXISTS
-- (an indexed spaces PK lookup) before touching space_members. A denormalized space-visibility column
-- on the content tables is a possible future optimization if large scans show cost; not needed now.

create or replace function public.can_view_space_content(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Unpartitioned rows (no owning space) stay visible (legacy / pre-backfill safety).
    p_space_id is null
    -- The owning space is network or unset (not Private): content is as public as its own rules allow.
    or exists (
      select 1 from public.spaces s
      where s.id = p_space_id and s.visibility is distinct from 'private'
    )
    -- A Private space's content is visible to its owner or an active member.
    or public.is_space_member(p_space_id);
$$;

comment on function public.can_view_space_content(uuid) is
  'True if content owned by the given space_id may be read by the current viewer: the space is network/unset (public as its own rules allow), the row is unpartitioned (null space_id), or the viewer is the owner / an active member of a Private space. SECURITY DEFINER (ADR-056) so it reads spaces/space_members without re-entering their RLS. Used by the AS RESTRICTIVE space-isolation SELECT policies on the content tables.';

revoke all on function public.can_view_space_content(uuid) from public;
grant execute on function public.can_view_space_content(uuid) to authenticated, anon;

-- One restrictive SELECT guard per content table. ANDs with each table's existing permissive policy.
drop policy if exists circles_space_visible on public.circles;
create policy circles_space_visible on public.circles
  as restrictive for select using (public.can_view_space_content(space_id));

drop policy if exists events_space_visible on public.events;
create policy events_space_visible on public.events
  as restrictive for select using (public.can_view_space_content(space_id));

drop policy if exists practices_space_visible on public.practices;
create policy practices_space_visible on public.practices
  as restrictive for select using (public.can_view_space_content(space_id));

drop policy if exists journey_plans_space_visible on public.journey_plans;
create policy journey_plans_space_visible on public.journey_plans
  as restrictive for select using (public.can_view_space_content(space_id));

drop policy if exists programs_space_visible on public.programs;
create policy programs_space_visible on public.programs
  as restrictive for select using (public.can_view_space_content(space_id));
