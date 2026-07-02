-- App overrides: operator-managed PER-SCOPE customization of the standardized admin rail's
-- App catalog (docs/ADMIN-RAIL.md Phase 6). Mirrors public.page_chrome_overrides exactly:
-- the code catalog (lib/apps/catalog.ts APPS, resolved per scope by lib/apps/for-scope.ts
-- appsForScope) is the DEFAULT; each row here overlays ONE App at ONE scope kind, so an
-- operator can enable / disable / reorder an App and set a per-App "who sees it" role floor
-- WITHOUT a code deploy. An absent row keeps the catalog default (fail-safe).
--
-- Keyed (scope_key, app_id): scope_key is the AdminScope.kind ('global' | 'circle' | 'event'
-- | 'hub' | 'nexus' | 'practice' | 'channel' | 'profile') — see lib/apps/overrides.ts
-- scopeKeyFor. app_id is a catalog App id (lib/apps/catalog.ts appById); a row whose app_id
-- is unknown is ignored by the reader.
--
-- Live end-to-end: the resolver (lib/apps/overrides.ts loadAppOverrides / mergeAppOverrides)
-- and the manage surface (/admin/page-layout → Apps tab) ship alongside the read. The server
-- twin resolveAppsForScope (lib/apps/for-scope.ts) composes these OVER appsForScope, dropping
-- disabled Apps, applying `position`, and gating on `min_role`.
--
-- House style: additive + idempotent, RLS on. Applied to production via the Supabase SQL
-- Editor (the repo migration-history baseline predates `db push` being safe here — see
-- docs/WORKFLOW.md). lib/database.types.ts is regenerated separately; the reader
-- (loadAppOverrides) is FAIL-SAFE and returns {} until this migration is applied.

-- ── The (scope, app) override store ─────────────────────────────────────────────────────
create table if not exists public.app_overrides (
  -- The AdminScope kind this override applies to (e.g. 'global', 'circle', 'event').
  scope_key  text not null,
  -- A catalog App id (lib/apps/catalog.ts). Validated app-side (appById) before use.
  app_id     text not null,
  -- Phase 2 (per-space overrides, TODO): a per-space row scopes to one Space; NULL = the
  -- scope-kind default that applies everywhere. Reserved now so the shape is forward-
  -- compatible; the reader ignores it today and no per-space policy exists yet (see below).
  space_id   uuid references public.spaces(id) on delete cascade,
  -- Whether the App is shown at this scope. false = drop it from the rail (fail-safe: an
  -- absent row keeps the catalog default, which is shown).
  enabled    boolean not null default true,
  -- Optional explicit sort position within its category; NULL = keep the catalog order
  -- (mergeAppOverrides stable-sorts by `position ?? catalogIndex`).
  position   int,
  -- Optional per-App role FLOOR — the lowest community rung that may SEE this App at this
  -- scope (mirrors page_settings slot.roles / MODULE_ROLES). NULL = everyone the gate allows.
  min_role   text check (min_role in ('host', 'guide', 'mentor')),
  -- Optional operator note (why this App was overridden here).
  note       text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (scope_key, app_id)
);
comment on table public.app_overrides is
  'Operator per-scope overrides for the standardized admin rail''s Apps: (scope_key, app_id) -> enabled/position/min_role. Merged OVER the code catalog defaults in lib/apps/for-scope.ts (appsForScope) via lib/apps/overrides.ts (mergeAppOverrides). docs/ADMIN-RAIL.md Phase 6.';

alter table public.app_overrides enable row level security;

-- World-readable: the App resolver merges these over the catalog defaults per request and
-- must see them regardless of the caller's auth context (which Apps a rail shows is non-
-- sensitive presentation data, like page_chrome_overrides / menu_config / themes config).
-- Writes go EXCLUSIVELY through the service-role admin client in a staff-gated server action
-- (app/(main)/admin/page-layout/app-actions.ts); there is intentionally NO client-facing
-- write policy.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_overrides'
      and policyname = 'app_overrides_read_all'
  ) then
    create policy app_overrides_read_all
      on public.app_overrides for select
      using (true);
  end if;
end $$;

-- TODO (Phase 2, per-space overrides): when a Space may customize its OWN rail, add a
-- scoped WRITE policy for space owners keyed on space_id (e.g. `using (space_id is not null
-- and <caller owns/admins space_id>)`), and re-key the reader on (scope_key, space_id). The
-- scope-kind default rows (space_id IS NULL) stay platform-operator-only. Deferred here to
-- keep Phase 6 additive and fail-safe; today every write is service-role + staff-gated.
