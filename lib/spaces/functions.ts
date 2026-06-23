// Per-Space FUNCTION access (per-space-roles Phase 1). The single PURE resolver for "may this viewer
// use this Space tool?", composing the two existing primitives:
//   1. ENTITLEMENT (the on/off switch) — spaceHasEntitlement(space, fn.entitlement) for a plan-gated
//      function; for a UNIVERSAL function (no entitlement) the switch lives in the SAME spaces.entitlements
//      blob keyed by the function key, DEFAULT-ON (only an explicit `false` turns it off).
//   2. ROLE (who may use it once on) — atLeastSpaceRole(viewerSpaceRole, minRole), where minRole is the
//      per-Space override (spaces.feature_roles) if present, else the function's CODE default.
//
// PURE + framework-independent (no Supabase/Next imports — only the pure ladder + entitlement readers),
// like lib/spaces/entitlements.ts and lib/pricing/plans.ts, so it is trivially unit-testable. FAIL-SAFE
// is the whole contract: an unknown function, a null/unknown viewer role, or a malformed blob all read
// as NO ACCESS.
//
// NON-BREAKING: defaults reproduce today's behavior. A universal function is default-ON for its default
// role (editor / moderator / admin = today's canEditProfile / canInvite / isAdmin thresholds). CRM and
// email keep their entitlement gate with an `admin` default role. An empty spaces.feature_roles ('{}')
// means every function uses its CODE default min-role. Adding a capability is one registry row + (for a
// plan-gated one) one entitlement key — never a schema change.
//
// Copy follows docs/CONTENT-VOICE.md: plain operator-facing nouns, no em or en dashes.

import { atLeastSpaceRole, SPACE_ROLES, type SpaceRole } from './membership'
import { spaceHasEntitlement, spaceEntitlements, type SpaceLike } from './entitlements'
import type { SpaceType } from './types'

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
  | 'billing'
  | 'profile'

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
  /** The spaces.entitlements key this function's ON state requires, or null for a universal toggle. */
  entitlement: string | null
  /** The CODE default lowest SpaceRole that may use the function (overridable per-Space). */
  defaultMinRole: SpaceRole
  /** The Space types that offer this function ('*' = every type). */
  types: readonly FunctionTypeScope[]
}

/** THE registry. Order is the operator-grid order. Universal functions (`entitlement: null`) default ON;
 *  plan-gated ones (CRM, email) keep their entitlement switch. Default roles mirror today's thresholds:
 *  editor = canEditProfile, moderator = canInvite, admin = isAdmin / canManageMembers. */
export const SPACE_FUNCTIONS: readonly SpaceFunctionDef[] = [
  {
    key: 'crm',
    label: 'CRM',
    description: 'The pipeline, contacts, and private notes for this space.',
    entitlement: 'crm',
    defaultMinRole: 'admin',
    types: ['practitioner', 'business', 'coaching', 'organization'],
  },
  {
    key: 'email',
    label: 'Email',
    description: 'Write a campaign, pick who gets it, and send or schedule it.',
    entitlement: 'email',
    defaultMinRole: 'admin',
    types: ['business', 'organization'],
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
    types: ['practitioner'],
  },
  {
    key: 'memberships',
    label: 'Memberships',
    description: 'Define the tiers members can join, and see who has joined.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['business'],
  },
  {
    key: 'donations',
    label: 'Donations',
    description: 'Set up the fund, a short description, and the amounts members can pick.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['organization'],
  },
  {
    key: 'enroll',
    label: 'Enrollment',
    description: 'Define the program and see who has enrolled.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['coaching'],
  },
  {
    key: 'tickets',
    label: 'Tickets',
    description: 'Set up free or RSVP ticket tiers, and see who has reserved a spot.',
    entitlement: null,
    defaultMinRole: 'editor',
    types: ['event_space'],
  },
  {
    key: 'checkin',
    label: 'Check in',
    description: 'Show the door code and see who checked in.',
    entitlement: null,
    defaultMinRole: 'moderator',
    types: ['event_space'],
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

/** The function keys ENABLED BY DEFAULT for a type (its on-by-default tool set, before any operator/owner
 *  toggle). A universal function is on by default; a plan-gated one is on only when the plan grants it,
 *  which is not knowable from the type alone, so this returns the UNIVERSAL defaults for the type. PURE. */
export function defaultEnabledFunctions(type: SpaceType | null | undefined): SpaceFunctionKey[] {
  return functionsForType(type)
    .filter((fn) => fn.entitlement === null)
    .map((fn) => fn.key)
}

// ── The on/off + role resolution (pure, default-deny / fail-safe) ────────────────────────────────

/** Whether a function's ON switch is set for a Space.
 *  - PLAN-GATED (fn.entitlement != null): the plan must grant the entitlement (spaceHasEntitlement,
 *    DEFAULT-DENY: a missing key is OFF). This is the corrective fix for the CRM gate — once
 *    spaces.entitlements actually projects onto the Space, `crm:true` turns the board on.
 *  - UNIVERSAL (fn.entitlement === null): the switch lives in the same entitlements blob keyed by the
 *    function key, DEFAULT-ON — only an explicit `false` (an operator/owner turning it off) disables it,
 *    so an empty blob keeps every universal tool ON (today's behavior). */
export function spaceFunctionEnabled(space: SpaceLike | null | undefined, fn: SpaceFunctionDef): boolean {
  if (fn.entitlement) return spaceHasEntitlement(space, fn.entitlement)
  // Universal: default-ON. spaceEntitlements normalizes every value to a boolean, so a key present and
  // not `true` reads as off; an absent key (the common case) is ON.
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
