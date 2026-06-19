// Per-Space ENTITLEMENTS + CAPABILITIES (ENTITY-SPACES-BUILD §0, Epic 0.1; ENTITY-SPACES-SYSTEM
// §1.4 / §3.2). Two concerns, both PURE + testable (no Supabase/Next imports except the membership
// seam at the very bottom):
//   1. ENTITLEMENTS — what the Space's PLAN grants. Read from the `spaces.entitlements` jsonb
//      ({ "crm": true, "email": true, … }). DEFAULT-DENY: a missing key (or a non-`true` value, or
//      a malformed blob) reads as OFF. A new capability is one jsonb key, never a code change (P4).
//   2. CAPABILITIES — what a PERSON may do on a Space. Combines the Space OWNER
//      (spaces.owner_profile_id) with their `space_members` role into a small capability set
//      (canEditProfile / canManageMembers / canInvite). The owner is all-powerful on their own
//      Space; member roles map onto the ladder (lib/spaces/membership.ts).
//
// `spaces.entitlements` is not in the generated DB types yet, so the Space the resolver hands us
// may not carry it on the typed `Space` interface — these readers accept the field loosely
// (`SpaceLike`) and reach it without a typed cast on the row (ADR-246). Keeping the entitlement
// readers pure (a plain object in, a boolean out) makes them trivially unit-testable.

import { isSpaceRole, atLeastSpaceRole, getSpaceMembership, type SpaceRole } from './membership'

// ── Entitlements (pure: jsonb in, boolean out, default-deny) ─────────────────────────────

/** A normalized entitlement map: capability key -> granted. */
export type Entitlements = Record<string, boolean>

/** The minimum shape these readers need from a Space: who owns it and its raw entitlements blob.
 *  `entitlements` is `unknown` because the column isn't in the generated types yet (ADR-246) — it
 *  arrives as whatever the jsonb holds, and is normalized here. */
export interface SpaceLike {
  ownerProfileId?: string | null
  entitlements?: unknown
  /** The Space id — only needed by getSpaceCapabilities to look up membership. */
  id?: string
}

/** Normalize the raw `spaces.entitlements` jsonb to a clean `{ key: boolean }` map. DEFAULT-DENY
 *  is the whole contract: anything that isn't an object of booleans collapses to {} (or drops the
 *  bad keys), so a missing/garbage blob grants NOTHING. Only an explicit `true` counts as granted;
 *  any other value for a key reads as `false`. */
export function spaceEntitlements(space: SpaceLike | null | undefined): Entitlements {
  const raw = space?.entitlements
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Entitlements = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    out[key] = value === true
  }
  return out
}

/** Whether a Space's plan grants a capability. DEFAULT-DENY: a missing key, a non-`true` value, a
 *  malformed blob, or a null Space all read as `false`. The one entitlement gate primitive. */
export function spaceHasEntitlement(space: SpaceLike | null | undefined, key: string): boolean {
  return spaceEntitlements(space)[key] === true
}

// ── Capabilities (owner + member role -> a capability set) ───────────────────────────────

/** What a person may do on a Space. Derived from owner + their space-member role; consumed by the
 *  profile/settings surfaces (the profile agents read this). */
export interface SpaceCapabilities {
  /** Is the viewer the Space owner? (spaces.owner_profile_id). */
  isOwner: boolean
  /** Is the viewer a Space admin? (owner, OR an active `admin` member). */
  isAdmin: boolean
  /** Their effective space role (null if neither owner nor a member). Owners report 'admin'. */
  role: SpaceRole | null
  /** May they edit the Space profile (copy, theme, layout)? owner / admin / editor. */
  canEditProfile: boolean
  /** May they add/remove/role-change members? owner / admin only. */
  canManageMembers: boolean
  /** May they invite teammates? owner / admin / moderator. */
  canInvite: boolean
}

const NO_CAPABILITIES: SpaceCapabilities = {
  isOwner: false,
  isAdmin: false,
  role: null,
  canEditProfile: false,
  canManageMembers: false,
  canInvite: false,
}

/** Build the capability set from the resolved owner-ness + an effective space role. Pure (no IO),
 *  so it's unit-testable on its own and reused by getSpaceCapabilities. An owner is treated as
 *  'admin' (the top rung) regardless of any member row. */
export function spaceCapabilitiesFor(isOwner: boolean, memberRole: SpaceRole | null): SpaceCapabilities {
  const role: SpaceRole | null = isOwner ? 'admin' : memberRole
  const isAdmin = isOwner || atLeastSpaceRole(role, 'admin')
  return {
    isOwner,
    isAdmin,
    role,
    canEditProfile: isOwner || atLeastSpaceRole(role, 'editor'),
    canManageMembers: isAdmin,
    canInvite: isOwner || atLeastSpaceRole(role, 'moderator'),
  }
}

/** Is this person a Space ADMIN — the owner, OR an `admin` member? The combined (owner-or-admin)
 *  check the settings/member surfaces gate on. Pure: pass the Space (for ownership) and the
 *  effective member role; for the IO version use getSpaceCapabilities(...).isAdmin. */
export function isSpaceAdmin(
  space: SpaceLike | null | undefined,
  profileId: string | null | undefined,
  memberRole: SpaceRole | null = null,
): boolean {
  if (!profileId) return false
  const isOwner = !!space?.ownerProfileId && space.ownerProfileId === profileId
  return isOwner || (isSpaceRole(memberRole) && atLeastSpaceRole(memberRole, 'admin'))
}

/** The full capability set for a person on a Space — the IO entry point the profile agents call.
 *  Folds the Space OWNER (spaces.owner_profile_id) together with their `space_members` role (only
 *  an ACTIVE membership grants authority; invited/suspended do not). FAIL-SAFE: an anonymous
 *  caller or a lookup error yields the no-capabilities set. */
export async function getSpaceCapabilities(
  space: SpaceLike | null | undefined,
  profileId: string | null | undefined,
): Promise<SpaceCapabilities> {
  if (!space || !profileId) return NO_CAPABILITIES
  const isOwner = !!space.ownerProfileId && space.ownerProfileId === profileId
  let memberRole: SpaceRole | null = null
  if (space.id) {
    const membership = await getSpaceMembership(space.id, profileId)
    // Only an ACTIVE membership confers a role (invited/suspended carry none).
    if (membership && membership.status === 'active') memberRole = membership.role
  }
  // An anonymous-to-this-space caller (not owner, no active membership) gets nothing.
  if (!isOwner && !memberRole) return NO_CAPABILITIES
  return spaceCapabilitiesFor(isOwner, memberRole)
}
