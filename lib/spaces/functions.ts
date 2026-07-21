// Per-Space FUNCTION access (per-space-roles Phase 1 · UNIVERSAL FUNCTIONS ADR-517 Phase F). The single
// PURE resolver for "may this viewer use this Space tool?", composing the two primitives:
//   1. AVAILABILITY (the on/off switch) — EVERY function is UNIVERSAL and DEFAULT-ON. The switch lives in
//      the spaces.entitlements blob keyed by the function key, and only an explicit `false` (an operator
//      turning it off) disables it. There is no per-function plan default-deny anymore: after freemium
//      the FREEMIUM TIER governs usage/limits, and that lives in the LIVE `featureAllowed` seam
//      (lib/spaces/function-access.ts spaceFunctionAccessLive), NOT here. A function's `entitlement`
//      field is now just the Phase-G TIER KEY that seam reads; the pure resolver never gates on it.
//   2. ROLE (who may use it once on) — atLeastSpaceRole(viewerSpaceRole, minRole), where minRole is the
//      per-Space override (spaces.feature_roles) if present, else the function's CODE default.
//
// PURE + framework-independent (no Supabase/Next imports — only the pure ladder + entitlement readers),
// like lib/spaces/entitlements.ts and lib/pricing/plans.ts, so it is trivially unit-testable. FAIL-SAFE
// is the contract: an unknown function or a null/unknown viewer role read as NO ACCESS; a malformed blob
// reads as the default (every function ON) so a garbage blob never locks a manager out of a tool.
//
// ADR-517 Phase F — UNIVERSAL: every Space, regardless of its Mode (type), has access to EVERY function.
// Mode is now only a starter PRESET (framing/emphasis, never a gate). So `types` on every function is the
// wildcard '*': a function applies to every Space type, and `spaceFunctionAccess` returns the FULL set for
// a manager of any Space. The tier seam (`featureAllowed`, currently permissive while billing is OFF)
// stays intact for Phase G to drive; during the beta everything resolves to available.
// An empty spaces.feature_roles ('{}') means every function uses its CODE default min-role.
//
// Copy follows docs/CONTENT-VOICE.md: plain operator-facing nouns, no em or en dashes.

import { atLeastSpaceRole, isSpaceRole, SPACE_ROLES, type SpaceRole } from './membership'
import { spaceEntitlements, type SpaceLike } from './entitlements'
import type { SpaceType } from './types'

/** Every value `spaces.type` can hold (kept in lock-step with SpaceType in ./types). The operator
 *  type-defaults editor and the seed-from-defaults path validate against this list (fail-closed for an
 *  unknown type). `root` is the platform host (not member-facing), but it stays here so the union is
 *  complete; the editor renders only the provisionable, member-facing types. */
export const SPACE_TYPES: readonly SpaceType[] = ['root', 'business', 'nonprofit'] as const

/** Is `value` a known SpaceType? Fail-closed for unknown / future values. */
export function isSpaceType(value: unknown): value is SpaceType {
  return typeof value === 'string' && (SPACE_TYPES as readonly string[]).includes(value)
}

// ── The function registry (the catalog of gateable Space tools) ──────────────────────────────────

/** Every gateable per-Space function. A new tool is one key here (+ one entitlement key if plan-gated). */
export type SpaceFunctionKey =
  | 'crm'
  | 'email'
  | 'members'
  | 'qr'
  | 'availability'
  | 'memberships'
  | 'donations'
  | 'enroll'
  | 'tickets'
  | 'checkin'
  | 'shop'
  | 'billing'
  | 'profile'
  | 'reviews'
  | 'airwaves'
  | 'practices'
  | 'journeys'
  | 'loom'
  | 'collaborators'

/** A Space type, or the wildcard '*' meaning "every type offers this function". */
type FunctionTypeScope = SpaceType | '*'

/** One function in the registry: its key, operator-facing label, the plan ENTITLEMENT it needs (or null
 *  for a universal function whose on/off is a free toggle), its CODE default min-role, and which Space
 *  TYPES offer it ('*' = all). */
export interface SpaceFunctionDef {
  key: SpaceFunctionKey
  /** Operator-facing label (plain voice, no em dashes). */
  label: string
  /** One-line operator-facing description for the grids. */
  description: string
  /** The freemium TIER key for this function (ADR-517 Phase F): the key the LIVE `featureAllowed` seam
   *  (Phase G) reads to gate USAGE/LIMITS once billing is live, or null for a function with no paid tier.
   *  It is NOT a pure on/off gate — every function is universally available (default-ON) in the pure
   *  resolver; this key only feeds the tier seam (`featureKeyForFunction`). */
  entitlement: string | null
  /** The CODE default lowest SpaceRole that may use the function (overridable per-Space). */
  defaultMinRole: SpaceRole
  /** The Space types that offer this function ('*' = every type). */
  types: readonly FunctionTypeScope[]
}

/** THE registry. Order is the operator-grid order. UNIVERSAL FUNCTIONS (ADR-517 Phase F): every function
 *  applies to EVERY Space type (`types: ['*']`) and is DEFAULT-ON in the pure resolver, so every profile is
 *  the same functionally. CRM and email keep an `entitlement` VALUE, but it is now only the Phase-G freemium
 *  TIER key (read by the LIVE seam), NOT a pure gate. Default roles mirror today's thresholds:
 *  editor = canEditProfile, moderator = canInvite, admin = isAdmin / canManageMembers. */
export const SPACE_FUNCTIONS: readonly SpaceFunctionDef[] = [
  {
    key: 'crm',
    label: 'CRM',
    description: 'The pipeline, contacts, and private notes for this space.',
    entitlement: 'crm',
    defaultMinRole: 'admin',
    types: ['*'],
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Write a campaign, pick who gets it, and send or schedule it.',
    entitlement: 'email',
    defaultMinRole: 'admin',
    types: ['*'],
  },
  {
    key: 'members',
    label: 'Members',
    description: 'See who is on the team and the role each one holds.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'qr',
    label: 'QR codes',
    description: 'Create codes for this space and the landing pages they open to.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'availability',
    label: 'Availability and bookings',
    description: 'Set the weekly times members can book, and see who is on the calendar.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'memberships',
    label: 'Memberships',
    description: 'Define the tiers members can join, and see who has joined.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'donations',
    label: 'Donations',
    description: 'Set up the fund, a short description, and the amounts members can pick.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'enroll',
    label: 'Enrollment',
    description: 'Define the program and see who has enrolled.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'tickets',
    label: 'Tickets',
    description: 'Set up free or RSVP ticket tiers, and see who has reserved a spot.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'checkin',
    label: 'Check in',
    description: 'Show the door code and see who checked in.',
    entitlement: null,
    defaultMinRole: 'moderator',
    types: ['*'],
  },
  {
    key: 'shop',
    label: 'Shop',
    description: 'Your catalog, orders, and storefront.',
    entitlement: 'storefront',
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'billing',
    label: 'Plan and billing',
    description: 'See the plan, what each plan unlocks, and manage billing.',
    entitlement: null,
    defaultMinRole: 'admin',
    types: ['*'],
  },
  {
    key: 'profile',
    label: 'Profile and brand',
    description: 'Edit the space profile, brand, and visibility.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'reviews',
    label: 'Reviews',
    description: 'The member rating and review wall. Keeping it on builds trust with new members.',
    entitlement: null,
    defaultMinRole: 'admin',
    types: ['*'],
  },
  {
    key: 'airwaves',
    label: 'Airwaves',
    description: 'Host audio and video recordings, then attach them anywhere in your space.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'practices',
    label: 'Practices',
    description: 'Build the practices members do, each with its own timer, and share them in your space.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'journeys',
    label: 'Journeys',
    description: 'Build multi week programs from your practices. Free spaces publish one.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    key: 'loom',
    label: 'Loom Studio',
    description: 'Browse, upload, and organize the images in your space library.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['*'],
  },
  {
    // Collaborator spaces (ADR-799 B): host separate businesses that operate inside your space. Free to
    // host (entitlement null); a host is a business space, so this offers only to `business`. Admin-managed.
    key: 'collaborators',
    label: 'Collaborators',
    description: 'Host separate businesses that operate inside your space, and approve requests to collaborate.',
    entitlement: null,
    defaultMinRole: 'admin',
    types: ['business'],
  },
] as const

/** Fast lookup of a function def by key (null for an unknown key). */
const FUNCTION_BY_KEY: Record<string, SpaceFunctionDef> = Object.fromEntries(
  SPACE_FUNCTIONS.map((fn) => [fn.key, fn]),
)

/** The function def for a key, or null if the key is unknown (fail-closed callers branch on null). */
export function spaceFunctionDef(fn: string): SpaceFunctionDef | null {
  return FUNCTION_BY_KEY[fn] ?? null
}

/** Is `value` a known function key? */
export function isSpaceFunctionKey(value: unknown): value is SpaceFunctionKey {
  return typeof value === 'string' && value in FUNCTION_BY_KEY
}

/** The CODE default min-role for every function key (the dense map the grids seed from). */
export const DEFAULT_FUNCTION_ROLE: Record<SpaceFunctionKey, SpaceRole> = Object.fromEntries(
  SPACE_FUNCTIONS.map((fn) => [fn.key, fn.defaultMinRole]),
) as Record<SpaceFunctionKey, SpaceRole>

/** Does a function apply to a Space type? ('*' scope = every type.) */
export function functionAppliesToType(fn: SpaceFunctionDef, type: SpaceType | null | undefined): boolean {
  if (!type) return false
  return fn.types.includes('*') || fn.types.includes(type)
}

/** The functions a Space type offers, in registry order (the rows the grids render for that type). */
export function functionsForType(type: SpaceType | null | undefined): SpaceFunctionDef[] {
  return SPACE_FUNCTIONS.filter((fn) => functionAppliesToType(fn, type))
}

/** The function keys ENABLED BY DEFAULT for a type WITHOUT a freemium tier (the free tool set, before any
 *  operator/owner toggle). Under UNIVERSAL FUNCTIONS every function is default-ON; the tier-marked ones
 *  (crm/email) are excluded here only so the seeder never writes a tier key. PURE. */
export function defaultEnabledFunctions(type: SpaceType | null | undefined): SpaceFunctionKey[] {
  return functionsForType(type)
    .filter((fn) => fn.entitlement === null)
    .map((fn) => fn.key)
}

// ── The on/off + role resolution (pure, default-deny / fail-safe) ────────────────────────────────

/** Whether a function's ON switch is set for a Space. UNIVERSAL (ADR-517 Phase F): EVERY function is
 *  DEFAULT-ON. The switch lives in the spaces.entitlements blob keyed by the function key; only an explicit
 *  `false` (an operator/owner turning it off) disables it, so an empty/absent blob keeps every tool ON.
 *  There is no per-function plan default-deny: the freemium TIER gate for a plan-marked function
 *  (fn.entitlement != null) lives ENTIRELY in the LIVE `featureAllowed` seam (spaceFunctionAccessLive),
 *  which Phase G drives; the pure resolver never default-denies it, so during the beta everything is on. */
export function spaceFunctionEnabled(space: SpaceLike | null | undefined, fn: SpaceFunctionDef): boolean {
  // spaceEntitlements normalizes every value to a boolean, so a key present and not `true` reads as off;
  // an absent key (the common case) is ON. This holds for crm/email too now (their `entitlement` key is
  // only the Phase-G tier key, not a pure gate).
  const ent = spaceEntitlements(space)
  return fn.key in ent ? ent[fn.key] === true : true
}

/** Read the per-Space min-role OVERRIDE for a function from spaces.feature_roles, or null when there is
 *  no valid override (so the caller falls back to the code default). Tolerant of a malformed blob and an
 *  unknown role value (both yield null = no override). PURE. */
export function spaceFunctionMinRoleOverride(
  space: { featureRoles?: unknown } | null | undefined,
  fn: SpaceFunctionKey | string,
): SpaceRole | null {
  const raw = space?.featureRoles
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = (raw as Record<string, unknown>)[fn]
  return typeof value === 'string' && (SPACE_ROLES as readonly string[]).includes(value)
    ? (value as SpaceRole)
    : null
}

/** The EFFECTIVE min-role for a function on a Space: the per-Space override if valid, else the code
 *  default. Null for an unknown function key (the caller fails closed). PURE. */
export function spaceFunctionMinRole(
  space: ({ featureRoles?: unknown } & SpaceLike) | null | undefined,
  fn: SpaceFunctionKey | string,
): SpaceRole | null {
  const def = spaceFunctionDef(fn)
  if (!def) return null
  return spaceFunctionMinRoleOverride(space, def.key) ?? def.defaultMinRole
}

/**
 * THE per-Space function gate. May a viewer with `viewerSpaceRole` use `fn` on `space`?
 * TRUE iff the function is ENABLED (entitlement / universal switch above) AND the viewer's role meets
 * the effective min-role. FAIL-SAFE: an unknown function, a null/unknown viewer role, or a malformed
 * blob all return FALSE. PURE — no IO; compose it with the IO that resolves the viewer's space role
 * (getSpaceCapabilities -> caps.role).
 */
export function spaceFunctionAccess(
  space: ({ featureRoles?: unknown } & SpaceLike) | null | undefined,
  fn: SpaceFunctionKey | string,
  viewerSpaceRole: SpaceRole | null | undefined,
): boolean {
  const def = spaceFunctionDef(fn)
  if (!def) return false // unknown function -> no access (fail-safe)
  if (!spaceFunctionEnabled(space, def)) return false
  const minRole = spaceFunctionMinRoleOverride(space, def.key) ?? def.defaultMinRole
  return atLeastSpaceRole(viewerSpaceRole, minRole)
}

/**
 * THE per-viewer usable-function set for a Space menu — the ONE resolution shared by BOTH owner surfaces
 * so they can never drift: the /manage console (SpaceManageBoard → resolveSpaceMenu) and the standardized
 * admin rail (its Customize trigger passes this as `spaceFns` → the rail's `canUseSpaceFn` gate). Walks the
 * function registry and keeps the ones this viewer may use: a STAFF previewer sees them all (read-only,
 * every write re-gates in its sub-page); otherwise `spaceFunctionAccess` (enabled + role). Was duplicated
 * inline in manage-board.tsx and the profile layout with identical logic. PURE.
 */
export function usableSpaceFunctions(
  space: ({ featureRoles?: unknown } & SpaceLike) | null | undefined,
  viewerSpaceRole: SpaceRole | null | undefined,
  staffViewing: boolean,
): SpaceFunctionKey[] {
  return SPACE_FUNCTIONS.filter(
    (fn) => staffViewing || spaceFunctionAccess(space, fn.key, viewerSpaceRole),
  ).map((fn) => fn.key)
}

// ── Per-TYPE seed defaults (operator-set; merged over the code defaults at provision time) ──────────
//
// An operator may pre-configure each Space TYPE so every NEW Space of that type starts with a function's
// on/off + min-role already tuned (e.g. all business spaces start with `members` at 'admin'). These
// rows live in space_function_type_defaults (sparse: one row per (type, fn) the operator touched). The
// pure helpers below RESOLVE those rows over the code defaults, and SEED a new Space's entitlements +
// feature_roles from the result. FAIL-SAFE: no rows = the code defaults (today's behavior exactly).

/** One operator-set per-type default row (the sparse table shape, narrowed to the app vocabulary). */
export interface SpaceFunctionTypeDefault {
  type: SpaceType
  fn: SpaceFunctionKey
  enabled: boolean
  minRole: SpaceRole
}

/** The on/off + feature_roles blobs a NEW Space of `type` should be created with. PURE. It walks the
 *  functions the type offers, applies any operator per-type default over the CODE default, and returns
 *  two SPARSE jsonb blobs ready to write to spaces.entitlements + spaces.feature_roles:
 *   - `entitlements`: only the universal functions the operator turned OFF are written (as `false`);
 *     a default-ON function writes nothing (an empty/absent key reads as ON). Tier-marked functions
 *     (crm/email) are NEVER seeded here: their availability is universal (default-ON) and their
 *     usage/limits are governed by the Phase-G freemium TIER seam, not a per-Space seed.
 *   - `featureRoles`: only a min-role that DIFFERS from the code default is written (sparse), so an
 *     untouched type yields '{}' and the Space resolves exactly as today.
 *  An empty `defaults` list (the common case) returns two empty blobs = pure code defaults. */
export function seedSpaceConfigFromDefaults(
  type: SpaceType | null | undefined,
  defaults: readonly SpaceFunctionTypeDefault[],
): { entitlements: Record<string, boolean>; featureRoles: Record<string, SpaceRole> } {
  const entitlements: Record<string, boolean> = {}
  const featureRoles: Record<string, SpaceRole> = {}
  if (!type) return { entitlements, featureRoles }

  // Index the operator defaults for THIS type by function key (ignore rows for other types / unknown fns).
  const byFn = new Map<SpaceFunctionKey, SpaceFunctionTypeDefault>()
  for (const row of defaults) {
    if (row.type === type && isSpaceFunctionKey(row.fn)) byFn.set(row.fn, row)
  }

  for (const fn of functionsForType(type)) {
    const override = byFn.get(fn.key)

    // ON/OFF — only NON-TIER functions are seeded (tier-marked tools stay universal + default-ON, their
    // limits governed by the Phase-G tier seam). A function is default-ON, so we only write the sparse OFF
    // case: an operator default that explicitly disables it.
    if (fn.entitlement === null && override && override.enabled === false) {
      entitlements[fn.key] = false
    }

    // MIN-ROLE — write only a genuine override (differs from the code default), keeping the blob sparse.
    const minRole = override?.minRole ?? fn.defaultMinRole
    if (isSpaceRole(minRole) && minRole !== fn.defaultMinRole) {
      featureRoles[fn.key] = minRole
    }
  }

  return { entitlements, featureRoles }
}
