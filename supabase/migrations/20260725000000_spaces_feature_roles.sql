-- Per-Space FUNCTION min-role overrides (per-space-roles Phase 1). A Space's TOOLS (CRM, email,
-- members, QR, the per-type surfaces, billing, profile) are gated two ways: an ON/OFF switch and the
-- LOWEST member role that may use the function once it is on. The ON/OFF half reuses the existing
-- `spaces.entitlements` jsonb (no new column for it). This migration adds the role half:
--
--   * spaces.feature_roles — a single jsonb mapping a function key -> the minimum SpaceRole
--     ('viewer' | 'editor' | 'moderator' | 'admin') that may use it ({ "crm": "moderator", … }). A new
--     per-function role override is ONE KEY, never a schema migration. DEFAULT '{}' = every function
--     keeps its CODE default min-role (lib/spaces/functions.ts DEFAULT_FUNCTION_ROLE) — so an empty
--     map reproduces TODAY's behavior exactly. SPARSE: the app deletes a key when it equals the code
--     default, so the blob only ever holds genuine overrides. DEFAULT-DENY on read: a missing/garbage
--     value reads as "use the code default", and an unknown role fails closed (atLeastSpaceRole).
--
--   * space_function_type_defaults — OPTIONAL per-TYPE defaults an operator can set so every NEW Space
--     of a type starts with a function on/off + min-role (e.g. all business spaces get email at
--     'admin'). One row per (type, fn). RLS ON with NO client policies: service-role / janitor only
--     (mirrors area_permissions / capability_permissions). FAIL-SAFE: a missing row = the code default,
--     so an empty table resolves EXACTLY as today. (Phase 1 ships the table + RLS; the type-defaults
--     EDITOR is deferred to Phase 2, so nothing writes it yet.)
--
-- House style (matches 20260711000000_spaces_visibility_plan_entitlements.sql): additive + idempotent,
-- expand-only (nothing dropped or made NOT NULL beyond the new column's own default), applied to
-- production via the Supabase SQL Editor. The store reader (lib/spaces/store.ts) and
-- lib/spaces/functions.ts reach the new column with untyped casts until the generated types pick it up
-- (the ADR-246 pattern for not-yet-typed columns). This file is the canonical record. SAFE to re-run.
--
-- ROLLBACK (manual, if ever needed): the additions are inert when unread, so a rollback is rarely
-- required. To fully revert:
--   drop table if exists public.space_function_type_defaults;
--   alter table public.spaces drop column if exists feature_roles;

-- ── 1. spaces.feature_roles: per-function min-role overrides (default '{}' = code defaults) ──────
alter table public.spaces
  add column if not exists feature_roles jsonb not null default '{}'::jsonb;

comment on column public.spaces.feature_roles is
  'Per-function minimum-role overrides ({ "crm": "moderator", … }; values are SpaceRoles viewer<editor<moderator<admin). One key per function, never a schema migration. DEFAULT-DENY: a missing/garbage value falls back to the code default min-role (lib/spaces/functions.ts); an unknown role fails closed. Sparse: the app stores only genuine overrides. The on/off half is spaces.entitlements. Read via spaceFunctionAccess (lib/spaces/functions.ts).';

-- ── 2. space_function_type_defaults: optional per-TYPE seed defaults (service-role/janitor only) ──
create table if not exists public.space_function_type_defaults (
  type       text not null,
  fn         text not null,
  enabled    boolean not null default true,
  min_role   text not null default 'editor'
    check (min_role in ('viewer', 'editor', 'moderator', 'admin')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  primary key (type, fn)
);

comment on table public.space_function_type_defaults is
  'OPTIONAL per-Space-type function defaults (enabled + min_role) an operator sets so every NEW Space of a type starts pre-configured. One row per (type, fn). FAIL-SAFE: a missing row = the code default (lib/spaces/functions.ts), so an empty table resolves exactly as today. type/fn are text (house style, like area_permissions): the vocabulary is owned by the TypeScript unions (SpaceType / SpaceFunctionKey) and validated in the janitor-gated server action. min_role is a SpaceRole (CHECK).';

alter table public.space_function_type_defaults enable row level security;

-- RLS mirrors area_permissions / capability_permissions: NO client write policy (writes go exclusively
-- through the service role in a janitor-gated server action, so the keys-to-the-keys stay in one
-- audited code path). Unlike those two, this is a SEED-DEFAULTS table the client never needs to read
-- for its own affordances (a live Space reads its own spaces.entitlements + spaces.feature_roles, not
-- the type defaults), so there is intentionally NO client SELECT policy either: service-role only.
