-- Space Modes, M2 data (ADR-461/464, docs/SPACE-MODES-PLAN.md section 2/3c). Turns spaces.type into an
-- operating MODE with a finer FOCUS sub-mode, and gives the operator a place to OVERRIDE the Mode preset
-- so a later re-preset never clobbers a hand-set value. This migration adds exactly two columns to
-- public.spaces:
--   1. mode_variant text  - the Focus sub-mode (nullable; null resolves to the type's DEFAULT variant in
--                           code via lib/spaces/modes.ts resolveMode, so an existing row needs no backfill).
--   2. preferences jsonb  - operator OVERRIDES (nav order, label overrides, toggle overrides) merged OVER
--                           the Mode defaults. Operator override wins; a re-preset only refills what the
--                           operator has NOT touched.
--
-- WHY IT IS SAFE. Mode is FREE framing, not an entitlement: it only orders, defaults, and labels, and a
-- capability stays gated only by spaces.entitlements (plan + add-ons) and the space-role ladder. So this
-- schema CANNOT change what any Space can do. Both columns are additive with safe defaults (mode_variant
-- null = the type's default Focus; preferences '{}' = no overrides = exactly today's behavior), so every
-- existing row keeps reading and behaving identically with no backfill.
--
-- HOUSE STYLE (mirrors 20260916000000_pricing_addons_seats.sql + 20260915000000_pricing_plan_collapse.sql):
-- additive + idempotent (add column if not exists). RLS UNCHANGED: the existing public.spaces policies
-- already cover every column of the row, so these two new columns inherit the same owner/admin-write,
-- public-active-read posture with NO new policy needed. Writes are service-mediated through the gated Mode
-- settings server actions (double-gated on the space-admin role server-side), the same posture as
-- spaces.entitlements / feature_roles. No em or en dashes in any comment or string (CONTENT-VOICE).
-- Reached untyped from app code until lib/database.types.ts regenerates (ADR-246):
--   npx supabase gen types typescript --linked > lib/database.types.ts
-- (Do NOT hand-edit lib/database.types.ts.)
--
-- WARNING: NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply path.
-- Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- == Prerequisites already present (referenced, never recreated): public.spaces (with type, entitlements,
--    feature_roles, owner_profile_id, plan). RLS on public.spaces is already enabled with the owner/admin
--    write + public-active read policies from the original Spaces migration. No helper functions are added.

-- == 1. spaces.mode_variant: the Focus sub-mode ===================================================
-- Nullable text. NULL resolves in code (lib/spaces/modes.ts) to the type's DEFAULT Focus (business ->
-- service, coaching -> packages, practitioner -> appointments, event_space -> ticketed, organization ->
-- donations, lab -> cohort), so existing rows need no backfill and a future Mode/Focus is a code-only add.
-- No CHECK constraint by design: the vocabulary is owned by the TypeScript registry (resolveMode drops an
-- unknown value to the default), so the column stays a free text the code validates, matching how
-- spaces.type and the entitlements blob are governed by code rather than DB CHECKs here.
alter table public.spaces
  add column if not exists mode_variant text;

comment on column public.spaces.mode_variant is
  'Space Modes (ADR-461/464): the Focus sub-mode of the Space Mode (spaces.type). Nullable; null resolves to the type default Focus in lib/spaces/modes.ts resolveMode. Free text governed by the code registry (no DB CHECK). Read untyped until lib/database.types.ts regenerates.';

-- == 2. spaces.preferences: operator overrides of the Mode preset =================================
-- jsonb, not null, default '{}'. Holds the operator OVERRIDES the Mode settings page persists: nav order,
-- label overrides, and toggle overrides, each tracked as "set by operator" so a later Mode re-preset
-- refills only what the operator has NOT touched (the same posture as the brand accent "guest" rule in
-- the blueprints). An empty object means "no overrides" = the pure Mode defaults = today's behavior. This
-- is deliberately a SEPARATE blob from spaces.entitlements (the on/off + plan switches) and
-- spaces.feature_roles (the per-function min-role): preferences is FRAMING (Mode ordering + labels), not
-- capability, so it never participates in any gate.
alter table public.spaces
  add column if not exists preferences jsonb not null default '{}'::jsonb;

comment on column public.spaces.preferences is
  'Space Modes (ADR-461/464): operator OVERRIDES of the Mode preset (nav order, label overrides, toggle overrides), merged OVER the Mode defaults so operator override wins and a re-preset never clobbers a hand-set value. FRAMING only, never a gate. Default {} = no overrides = the pure Mode defaults. Read untyped until lib/database.types.ts regenerates.';

-- == RLS: UNCHANGED ===============================================================================
-- No policy is added or altered. public.spaces already has row level security enabled with the
-- owner/admin write + public-active read policies from the original Spaces migration, and those policies
-- gate the ROW (every column), so mode_variant and preferences inherit the same protection automatically.
-- Writes to these columns flow through the service-role admin client behind the gated Mode settings server
-- actions (double-gated on the space-admin role server-side), exactly like spaces.entitlements /
-- feature_roles. There is intentionally no client write policy specific to these columns.

-- == Rollback (hand-review aid) ===================================================================
-- This migration is additive + behavior-preserving (Mode is free framing; the defaults reproduce today's
-- behavior exactly), so a rollback is rarely needed. To reverse:
--   1. alter table public.spaces drop column if exists preferences;
--   2. alter table public.spaces drop column if exists mode_variant;
-- No policy, index, trigger, or data backfill was added, so nothing else needs reverting.
