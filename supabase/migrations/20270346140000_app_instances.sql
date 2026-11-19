-- =============================================================================
-- app_instances, re-created WITH its writer (PROG-E0 tasks 16+17; owner approved 2026-11-18)
--
-- WHAT: Layer 3 of the App contract (docs/EDITOR-ARCHITECTURE.md, "Instances"): one row per block
-- placed on a surface. 20260924000100 created this table with no writer and 20270316000000 dropped it
-- (OWN-031) so E0 could re-create it together with the code that keeps it true. That code ships in
-- the same change: lib/apps/instances.ts, called when a Space page is published.
--
-- SHAPE, and why it differs from the 2026-09-24 table (docs/EDITOR-E0.md section 4):
--   * id is the node id (BlockNode.nid, `n` plus 6 to 12 base36 characters), not a uuid. Node ids
--     are minted DETERMINISTICALLY from a placement's coordinates (lib/entity-blocks/node-tree.ts),
--     so two Spaces with the same default layout hold the same ids. An id is unique only within its
--     surface, so the primary key is (space_id, surface_type, surface_ref, id).
--   * surface_type takes the architecture's four surfaces, not the old six values.
--   * surface_ref names the concrete surface (for space-profile, the Space id). Not null, so it can
--     sit in the key.
--   * no config, style_override or status. In the node tree a block's content and style live on its
--     node in the layout document, and the layout stays the placement authority (section 4.2 item 4).
--     A later phase adds columns additively when something reads them.
--   * app_asset_id stays: nullable, NULL for every code-only block (section 4.2 item 2).
--
-- WHO WRITES: syncInstancesForSurface (lib/apps/instances.ts), service role, on publish only, best
-- effort (a failed sync never fails a publish), dark unless EDITOR_CANVAS is on. Reconciles rather
-- than replaces, so created_at survives a republish. Nothing reads it yet: E2's usage index will.
--
-- ACCESS MODEL: RLS ENABLED, NO POLICIES, service role only (listed in scripts/rls-deny-all.txt and
-- `internal` in scripts/table-grants.txt). The 2027-02-06 Phase 2 read policies are not restored:
-- there is no client reader, and a policy with no reader is the drift OWN-031 removed.
--
-- Additive: creates one table, its indexes and its updated_at trigger. Alters nothing existing.
-- Reversible: drop table public.app_instances;
-- =============================================================================

create table if not exists public.app_instances (
  id            text not null check (id ~* '^n[0-9a-z]{6,12}$'),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  surface_type  text not null check (surface_type in ('profile-inapp', 'spotlight-public', 'space-profile', 'space-site')),
  surface_ref   text not null check (char_length(surface_ref) between 1 and 200),
  -- The registry block type (lib/entity-blocks/registry.ts); the handle into the catalog.
  manifest_key  text not null check (char_length(manifest_key) between 1 and 100),
  -- The Loom row for an App with global config. NULL for a code-only block.
  app_asset_id  uuid references public.library_assets(id) on delete set null,
  -- Where it sits: `<row id>:<column>` and its index in that column's stack.
  slot          text not null check (char_length(slot) between 1 and 64),
  position      integer not null default 0 check (position >= 0),
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint app_instances_pkey primary key (space_id, surface_type, surface_ref, id)
);

-- All placements of one block type (E2's usage index), and the two foreign keys that are not a key prefix.
create index if not exists app_instances_manifest_idx on public.app_instances (manifest_key);
create index if not exists app_instances_asset_idx on public.app_instances (app_asset_id) where app_asset_id is not null;
create index if not exists app_instances_created_by_idx on public.app_instances (created_by) where created_by is not null;

drop trigger if exists app_instances_set_updated_at on public.app_instances;
create trigger app_instances_set_updated_at
  before update on public.app_instances
  for each row execute function public.set_updated_at();

comment on table public.app_instances is
  'Layer 3 Instances (PROG-E0, owner 2026-11-18): one row per block placed on a surface; id is the layout node id. '
  'Written on publish by lib/apps/instances.ts; the layout document stays the placement authority. Service role only.';

alter table public.app_instances enable row level security;
revoke all on table public.app_instances from anon, authenticated;
