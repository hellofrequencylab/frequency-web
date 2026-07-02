-- The Loom Platform — LP3 persistence slice: public.app_instances (Layer 3, "Instances").
-- Per docs/LOOM-PLATFORM.md §8. ADR-499 (proposed): the placement-vs-payload split.
--
-- WHAT THIS IS: one row per placed App on a surface. It is Layer 3 of the four-layer App
-- contract (LOOM-PLATFORM §3): Function (git) ◁ Global config (library_assets kind='app') ◁
-- INSTANCE (this table) ◁ Style (library_styles + per-instance style_override). An instance
-- references its App definition by manifest_key (always) and, when the App has a Loom row,
-- by app_asset_id (nullable, so a code-only App with no library_assets row still places).
--
-- THE PLACEMENT-VS-PAYLOAD SPLIT (ADR-499, proposed):
--   * page_settings.layout jsonb stays the PLACEMENT authority: it owns order / visibility /
--     role-gate, keyed by block_id. By contract, block_id == this row's id, so a layout slot
--     and its instance are the same identity from two angles.
--   * this row owns the CONFIG PAYLOAD: the per-placement config override + style_override +
--     status + the surface addressing (surface_type / surface_ref / slot / position).
--   One writer per concern: layout never carries the config payload (it would bloat the
--   world-readable page_settings row and break queryability); this table never re-encodes the
--   layout's order/visibility/gate. Reads compose most-specific-wins: catalog default ◁ global
--   config (space) ◁ this instance's config. Rejected alternatives (a dedicated app_configs
--   table; instance-config-inside-layout-jsonb) are recorded in LOOM-PLATFORM §8.
--
-- HOUSE STYLE (mirrors 20260919000000_library_assets.sql, 20260920000000_library_dam.sql,
-- 20260918000200_space_content_tables.sql, 20260626120000_page_settings.sql): additive +
-- idempotent (create table / index / trigger IF NOT EXISTS or drop-then-create), RLS enabled,
-- references public.spaces(id) / public.library_assets(id) / public.profiles(id), reuses the
-- existing public.set_updated_at() trigger helper. No em or en dashes in any comment or string
-- (CONTENT-VOICE). Reached untyped from app code until lib/database.types.ts regenerates
-- (ADR-246): npx supabase gen types typescript --linked > lib/database.types.ts
-- (Do NOT hand-edit lib/database.types.ts.)
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests
-- fresh-apply path. Do not run this against prod from the PR. Rollback notes at the foot.

-- == Prerequisites already present (referenced, never recreated): public.spaces (id),
--    public.library_assets (id; 20260919000000/20260920000000), public.profiles (id), the
--    trigger helper public.set_updated_at() (20240101000000, search_path pinned by
--    20260602210000), and (for Phase 2) the SECURITY DEFINER RLS helpers
--    public.can_view_space_content(uuid) (20260711090000) + public.can_write_space_content(uuid)
--    (20260902000000).

create table if not exists public.app_instances (
  id             uuid primary key default gen_random_uuid(),  -- == the layout slot's block_id

  -- who owns it (the surface's owning space; validated server-side to equal the surface's space)
  space_id       uuid not null references public.spaces(id) on delete cascade,

  -- the App definition this places. app_asset_id is the Loom row (Layer 2 global config); NULL
  -- so a code-only App with no library_assets row still places. manifest_key is the always-present
  -- handle into lib/apps/catalog.ts, so resolution never depends on a Loom row existing.
  app_asset_id   uuid references public.library_assets(id) on delete set null,
  manifest_key   text not null,

  -- where it attaches. surface_ref identifies the concrete surface (a route, a space id, a
  -- campaign id, ...); slot is the named region within it; position orders within the slot.
  surface_type   text not null check (surface_type in ('page', 'space', 'email', 'spotlight', 'rail', 'other')),
  surface_ref    text,
  slot           text,
  position       int  not null default 0,

  -- the config PAYLOAD (Layer 3 override, merged over the space global config) + per-instance
  -- style tokens (Layer 4 override; token keys only, never hex, per LOOM-PLATFORM guardrails).
  config         jsonb,
  style_override jsonb,

  status         text not null default 'published' check (status in ('draft', 'published', 'archived')),

  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.app_instances is
  'The Loom Platform Layer 3 (Instances): one row per placed App on a surface (ADR-499). '
  'id == the page_settings.layout block_id (placement-vs-payload split: layout owns order/visibility/'
  'role-gate; this row owns the config payload). app_asset_id = the Loom library_assets row for '
  'global config (nullable so a code-only App still places); manifest_key = the always-present handle '
  'into lib/apps/catalog.ts. Service-role only in Phase 1 (RLS enabled, no policy). See '
  'docs/LOOM-PLATFORM.md §8.';

-- Indexes: the surface lookup (render + "used on N surfaces"), the Loom back-reference (a Loom
-- App row -> its instances, for safe-uninstall), and the manifest handle (all instances of an App).
create index if not exists app_instances_surface_idx
  on public.app_instances (space_id, surface_type, surface_ref);
create index if not exists app_instances_asset_idx
  on public.app_instances (app_asset_id);
create index if not exists app_instances_manifest_idx
  on public.app_instances (manifest_key);

-- Reuse the existing updated_at trigger helper (public.set_updated_at, body: NEW.updated_at = now()).
drop trigger if exists app_instances_set_updated_at on public.app_instances;
create trigger app_instances_set_updated_at
  before update on public.app_instances
  for each row execute function public.set_updated_at();

-- == RLS — Phase 1 (now): deny-by-default, service-role only ======================================
-- RLS enabled with NO policy. All access flows through staff/owner-gated server actions on the
-- service-role admin client, exactly like public.pages / library_assets / library_* / page_settings.
-- Safe by construction: no client can read or write until Phase 2 lands.
alter table public.app_instances enable row level security;

-- == RLS — Phase 2 (D5 tenancy; gated by FOUNDATION-HARDENING-PLAN; LOOM-PLATFORM §8) =============
-- When per-space client RLS lands, add AS RESTRICTIVE policies that mirror the space-content
-- isolation migrations. This block is intentionally COMMENTED OUT (do not apply now):
--
--   -- READ: the same shape as the space_content_tables SELECT policies. can_view_space_content
--   -- walls Private-space content to its owner + active members (mirrors migration
--   -- 20260711090000_space_content_isolation.sql), PLUS a public-render mirror of the
--   -- 20260918000200_space_content_tables.sql read (Apps render for anon on active, non-Private
--   -- spaces), so a published App shows on a public surface.
--   drop policy if exists app_instances_space_visible on public.app_instances;
--   create policy app_instances_space_visible on public.app_instances
--     as restrictive for select using (
--       public.can_view_space_content(space_id)
--       or (
--         status = 'published'
--         and exists (
--           select 1 from public.spaces s
--           where s.id = app_instances.space_id
--             and s.status = 'active'
--             and (s.visibility is distinct from 'private' or public.is_space_member(s.id))
--         )
--       )
--     );
--
--   -- WRITE: the space's editors only (owner / admin / editor / moderator via
--   -- can_write_space_content, resolved through get_my_profile_id(); see 20260902000000). On
--   -- UPDATE, guard BOTH the old row (USING) and the new row (WITH CHECK) so an instance cannot
--   -- be moved across spaces. Mirrors the *_operator_* write policies in
--   -- 20260918000200_space_content_tables.sql.
--   drop policy if exists app_instances_operator_insert on public.app_instances;
--   create policy app_instances_operator_insert on public.app_instances
--     as restrictive for insert with check (public.can_write_space_content(space_id));
--   drop policy if exists app_instances_operator_update on public.app_instances;
--   create policy app_instances_operator_update on public.app_instances
--     as restrictive for update
--     using (public.can_write_space_content(space_id))
--     with check (public.can_write_space_content(space_id));
--   drop policy if exists app_instances_operator_delete on public.app_instances;
--   create policy app_instances_operator_delete on public.app_instances
--     as restrictive for delete using (public.can_write_space_content(space_id));
--
-- (The surface_ref -> space linkage is validated server-side so app_instances.space_id always
-- equals the surface's owning space; see LOOM-PLATFORM §8.)

-- == Rollback (hand-review aid) ==================================================================
-- Additive; no existing table, policy, column, or function is altered. To reverse (drops the table
-- and its trigger + indexes via CASCADE):
--   1. drop table if exists public.app_instances cascade;
