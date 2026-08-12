// The CIRCLE role ladder — the four rungs a circle's Host can set up (ADR-1014).
//
// Framework-independent (no React/Next/Supabase), like every other module in lib/core:
// `resolveCapabilities` imports it, so it must stay pure and entity-blind of the DB.
//
// WHERE A CIRCLE ROLE LIVES. On `memberships.volunteer_role`, which is already typed
// `community_role` and already read by the capability seam (lib/core/load-capabilities.ts).
// One row per person per circle, so the role travels with the membership: leave the circle
// and the role leaves with you. No new enum, no new table, no second permission system.
//
// WHY NOT `stewardships`. That table supports multiple holders and is already consumed
// (`leadsScope`), but it grants leadership as a BINARY — one active edge on `circle:<id>`
// means full leadership, with no way to say "this person moderates but does not edit
// settings" short of adding a parallel resolver. It also has no write path in app code
// (only a DELETE), so wiring it would mean a migration. `volunteer_role` already carries
// a RANKED value and already reaches the resolver. See docs/DECISIONS.md ADR-1014.
//
// THE MAPPING, and why these two values. The `community_role` enum is ORDERED
// (member < crew < host < guide < mentor), and the two rungs below borrow the two values
// whose order matches the authority they carry: Admin outranks Moderator exactly as
// 'guide' outranks 'host' on that ladder. Measured on production 2026-08-12: every one of
// the 6 `volunteer_role='host'` rows belongs to the circle's OWN host_id, and no row
// anywhere holds 'guide'. So this mapping grants nobody anything they do not already hold
// — it is provably a no-op on today's data, and every new grant is an explicit assignment.
//
// FAIL CLOSED. Any value this module does not recognise — 'crew' (the retired rung, still
// written by the demo generator), 'mentor', 'admin', 'janitor', a future enum value, or
// junk — reads as a plain Member and grants nothing. A role we cannot name is a role we
// do not honour.

import type { CommunityRole } from './roles'

/** The four rungs, most authority first. `host` is the circle's OWNER (`circles.host_id`)
 *  and is NOT stored on the membership — it is an identity, not an assignment. */
export type CircleRole = 'host' | 'admin' | 'moderator' | 'member'

/** The three rungs the Host can actually SET on someone. The Host rung is transferred, not
 *  assigned, so it is deliberately absent. */
export type AssignableCircleRole = Exclude<CircleRole, 'host'>

/** Assignment order for the picker: most authority first, so the list reads as a ladder. */
export const ASSIGNABLE_CIRCLE_ROLES: readonly AssignableCircleRole[] = [
  'admin',
  'moderator',
  'member',
] as const

/** What each assignable rung WRITES to `memberships.volunteer_role`. A plain Member stores
 *  NULL, which is what the hierarchy_v2 migration has always meant by "null = regular member"
 *  and what 4 of today's 10 rows already hold. */
export const CIRCLE_ROLE_STORED_VALUE: Record<AssignableCircleRole, CommunityRole | null> = {
  admin: 'guide',
  moderator: 'host',
  member: null,
}

/**
 * Read a stored `memberships.volunteer_role` as a circle rung. FAIL CLOSED: anything this
 * build does not recognise is a plain Member.
 *
 * This does NOT return 'host'. Ownership is `circles.host_id`, never a membership value —
 * the 6 owners in production who carry `volunteer_role='host'` are owners because of the
 * FK, and the 1 who carries NULL is just as much the owner. Reading ownership off the
 * membership would make the two disagree.
 */
export function circleRoleFromStoredValue(
  value: string | null | undefined,
): AssignableCircleRole {
  switch (value) {
    case 'guide':
      return 'admin'
    case 'host':
      return 'moderator'
    default:
      return 'member'
  }
}

/** Narrowing guard for a role name arriving from a form/client. Fail-closed by omission:
 *  'host' is not assignable, so a client asking for it is rejected. */
export function isAssignableCircleRole(value: unknown): value is AssignableCircleRole {
  return value === 'admin' || value === 'moderator' || value === 'member'
}

// ─── Member-facing copy (docs/NAMING.md + docs/CONTENT-VOICE.md) ───────────────
//
// One source for the rung's NAME and for what it can do, so the picker, the roster chip and
// the "what each one can do" disclosure can never say three different things. Plain sentences,
// concrete verbs, no em dashes; the announcement noun is Dispatch, never "broadcast"
// (NAMING.md §Dispatch).

export const CIRCLE_ROLE_LABEL: Record<CircleRole, string> = {
  host: 'Host',
  admin: 'Admin',
  moderator: 'Moderator',
  member: 'Member',
}

/** One plain line per rung: what this person can actually do. Written for the Host reading
 *  the roster, deciding who to hand something to. */
export const CIRCLE_ROLE_SUMMARY: Record<CircleRole, string> = {
  host: 'Holds the circle. Everything an Admin does, and the Host is the only one who sets these roles.',
  admin: 'Runs the circle with you. Edits the settings, hands out tasks, sends a Dispatch, and messages any member.',
  moderator: 'Keeps the room in order. Sees the full roster and can message any member directly.',
  member: 'In the circle. Posts, shows up, takes part.',
}
