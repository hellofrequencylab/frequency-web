-- The Loom Platform, LP3 Phase 2: client RLS policies for public.app_instances (ADR-499).
--
-- Phase 1 (20260924000100) created the table fail-closed: RLS enabled, zero policies,
-- service-role only. That migration carried the Phase 2 policy set as a commented block, gated
-- on the per-Space tenancy walls landing. The walls land in 20270206000000, so this applies the
-- block, with two deliberate divergences from the comment:
--
--   1. The policies are PERMISSIVE, not RESTRICTIVE. A restrictive policy only narrows what
--      permissive policies grant, and this table has none, so an as-restrictive set would have
--      granted nothing at all. The policies the block was written to mirror (the *_operator_*
--      quads in 20260918000200_space_content_tables.sql and the quads in 20270206000000) are
--      permissive; these match them.
--   2. The read policy's first arm is can_write_space_content, NOT can_view_space_content as the
--      block had it. can_view_space_content returns true for ANY viewer of a non-Private Space
--      (it answers "may you see this Space's public content"), so as a read arm here it would
--      have exposed DRAFT and ARCHIVED instances on every public Space to everyone, anon
--      included. What actually separates drafts-visible from published-only is operator
--      authority, and that is can_write_space_content.
--
-- READ: the Space's write-authorized operators see every instance (drafts included); everyone
-- else sees only PUBLISHED instances on an active Space they can view (non-Private, or Private
-- with membership), the public-render mirror of the 20260918000200 read, so a placed App shows
-- on a public surface.
--
-- WRITE: the Space's write-authorized operators only (owner / editor / moderator / admin member,
-- via private.can_write_space_content). On UPDATE both the old row (USING) and the new row
-- (WITH CHECK) are guarded so an instance cannot be moved across Spaces.
--
-- Helpers are private.* per ADR-847. Service role bypasses RLS: every existing admin-client
-- path is unchanged. The surface_ref -> space linkage stays validated server-side so
-- app_instances.space_id always equals the surface's owning Space (LOOM-PLATFORM §8).
--
-- House style: additive + idempotent (drop policy if exists / create), safe to re-run.

alter table public.app_instances enable row level security;

drop policy if exists app_instances_space_visible on public.app_instances;
create policy app_instances_space_visible on public.app_instances
  for select using (
    private.can_write_space_content(space_id)
    or (
      status = 'published'
      and exists (
        select 1 from public.spaces s
        where s.id = app_instances.space_id
          and s.status = 'active'
          and (s.visibility is distinct from 'private' or private.is_space_member(s.id))
      )
    )
  );

drop policy if exists app_instances_operator_insert on public.app_instances;
create policy app_instances_operator_insert on public.app_instances
  for insert with check (private.can_write_space_content(space_id));

drop policy if exists app_instances_operator_update on public.app_instances;
create policy app_instances_operator_update on public.app_instances
  for update
  using (private.can_write_space_content(space_id))
  with check (private.can_write_space_content(space_id));

drop policy if exists app_instances_operator_delete on public.app_instances;
create policy app_instances_operator_delete on public.app_instances
  for delete using (private.can_write_space_content(space_id));

-- The table comment said "Service-role only in Phase 1"; reflect Phase 2 reality.
comment on table public.app_instances is
  'The Loom Platform Layer 3 (Instances): one row per placed App on a surface (ADR-499). '
  'id == the page_settings.layout block_id (placement-vs-payload split: layout owns order/visibility/'
  'role-gate; this row owns the config payload). app_asset_id = the Loom library_assets row for '
  'global config (nullable so a code-only App still places); manifest_key = the always-present handle '
  'into lib/apps/catalog.ts. Phase 2 RLS (20270206000100): published instances on active non-Private '
  'Spaces are publicly visible; drafts and writes are Space-operator only. See docs/LOOM-PLATFORM.md §8.';
