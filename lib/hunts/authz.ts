/**
 * Hunt authorization (FH-008): the role matrix in docs/hunts/ROLE-MATRIX.md as one pure function.
 *
 * It takes facts the caller loaded fresh for this request (the Hunt, its role grants, its partner
 * rows, and the actor's live Space staff standing) and answers allow or deny with a reason code.
 * It reads no database and keeps no cache, so a revoked grant stops working on the very next call
 * as long as the loader reads the rows each time. Nothing here widens access: an unknown action,
 * an anonymous actor outside the public read, and the participant roster all fall through to deny.
 *
 * The loader that fetches these facts lives with the routes (it needs the service-role client);
 * this module is the part that can be tested without one.
 */

type HuntRole = 'owner' | 'admin' | 'editor' | 'operator'

export type HuntAction =
  | 'read_public'
  | 'edit_draft'
  | 'publish'
  | 'pause_resume'
  | 'end'
  | 'cancel_safety'
  | 'grant_role'
  | 'transfer_owner'
  | 'manage_placement'
  | 'verify_claim'
  | 'redeem_reward'
  | 'review_claim'
  | 'submit_claim'
  | 'read_own_run'
  | 'read_aggregate'
  | 'read_run_for_case'
  | 'export_own_contacts'
  | 'export_hunt'
  | 'read_roster'

type DenyReason =
  | 'signed_out'
  | 'not_visible'
  | 'no_role'
  | 'role_too_low'
  | 'wrong_hunt_or_venue'
  | 'partner_not_active'
  | 'partner_role_missing'
  | 'not_staff'
  | 'not_own_run'
  | 'needs_case'
  | 'owner_only'
  | 'forbidden_for_everyone'

type Decision = { allow: true; via: string; audit: boolean } | { allow: false; reason: DenyReason }

export interface HuntFacts {
  id: string
  visibility: 'private' | 'unlisted' | 'public'
  ownerProfileId: string | null
  ownerSpaceId: string | null
}

export interface RoleGrant {
  huntId: string
  profileId: string
  role: HuntRole
  expiresAt: string | null
  revokedAt: string | null
}

export interface PartnerRow {
  huntId: string
  spaceId: string
  status: 'invited' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'suspended'
  effectiveAt: string | null
  revokedAt: string | null
  permittedRoles: string[]
}

export interface Actor {
  /** Null when signed out. */
  profileId: string | null
  /** The actor's live standing in the Space that owns the Hunt, read this request. */
  ownerSpaceRole?: 'owner' | 'admin' | null
  /** Space ids where the actor is current staff, read this request. */
  staffSpaceIds?: string[]
  /** Platform support staff. Needs a case reference for any run read. */
  platformSupport?: boolean
}

export interface Context {
  /** The venue Space the action happens at, for venue-scoped actions. */
  venueSpaceId?: string | null
  /** The hunt_id a placement, claim or run belongs to, when it came from a row. */
  targetHuntId?: string
  /** The player a run belongs to, for read_own_run. */
  runSubjectId?: string | null
  /** The role being granted, for grant_role. */
  targetRole?: HuntRole
  /** A support case reference. */
  caseRef?: string | null
}

export interface Inputs {
  hunt: HuntFacts
  grants: RoleGrant[]
  partners: PartnerRow[]
  actor: Actor
  ctx?: Context
  /** ISO instant. Passed in so a test can prove revocation at a precise moment. */
  now: string
}

const RANK: Record<HuntRole, number> = { operator: 1, editor: 2, admin: 3, owner: 4 }

const OWNER_ADMIN: HuntRole[] = ['owner', 'admin']
const ALL_ROLES: HuntRole[] = ['owner', 'admin', 'editor', 'operator']

/**
 * Which Hunt roles may do each action (the grant matrix in docs/hunts/ROLE-MATRIX.md). Listed
 * explicitly rather than by rank: editors draft but do not run the door, operators run the door but
 * do not draft, and a higher rank is not a superset of a lower lane. Partner, player and support
 * paths are handled separately.
 */
const ALLOWED: Partial<Record<HuntAction, HuntRole[]>> = {
  edit_draft: ['owner', 'admin', 'editor'],
  publish: OWNER_ADMIN,
  pause_resume: OWNER_ADMIN,
  end: OWNER_ADMIN,
  cancel_safety: OWNER_ADMIN,
  grant_role: OWNER_ADMIN,
  transfer_owner: ['owner'],
  manage_placement: ['owner', 'admin', 'editor'],
  verify_claim: ['owner', 'admin', 'operator'],
  redeem_reward: ['owner', 'admin', 'operator'],
  review_claim: ['owner', 'admin', 'operator'],
  read_aggregate: ALL_ROLES,
  export_hunt: OWNER_ADMIN,
}

const PARTNER_NEEDS: Partial<Record<HuntAction, string>> = {
  manage_placement: 'editor',
  verify_claim: 'operator',
  redeem_reward: 'operator',
  review_claim: 'operator',
  read_aggregate: '',
  export_own_contacts: '',
}

const live = (iso: string | null, now: string, kind: 'ends' | 'starts') =>
  iso === null ? kind === 'ends' : kind === 'ends' ? Date.parse(iso) > Date.parse(now) : Date.parse(iso) <= Date.parse(now)

/** Roles the actor holds on this Hunt right now: grants not revoked or expired, plus owner standing. */
export function effectiveRoles(i: Inputs): HuntRole[] {
  const { hunt, grants, actor, now } = i
  if (!actor.profileId) return []
  const roles = new Set<HuntRole>()
  for (const g of grants) {
    if (g.huntId !== hunt.id || g.profileId !== actor.profileId) continue
    if (g.revokedAt !== null && Date.parse(g.revokedAt) <= Date.parse(now)) continue
    if (!live(g.expiresAt, now, 'ends')) continue
    roles.add(g.role)
  }
  if (hunt.ownerProfileId === actor.profileId) roles.add('owner')
  if (hunt.ownerSpaceId && actor.ownerSpaceRole) roles.add(actor.ownerSpaceRole)
  return [...roles]
}

function partnerAllows(action: HuntAction, i: Inputs): Decision | null {
  const need = PARTNER_NEEDS[action]
  if (need === undefined) return null
  const { hunt, partners, actor, ctx, now } = i
  const venue = ctx?.venueSpaceId
  if (!venue) return null
  const row = partners.find((p) => p.huntId === hunt.id && p.spaceId === venue)
  if (!row) return null
  const active =
    row.status === 'accepted' &&
    live(row.effectiveAt, now, 'starts') &&
    row.effectiveAt !== null &&
    (row.revokedAt === null || Date.parse(row.revokedAt) > Date.parse(now))
  if (!active) return { allow: false, reason: 'partner_not_active' }
  if (!actor.staffSpaceIds?.includes(venue)) return { allow: false, reason: 'not_staff' }
  if (need && !row.permittedRoles.includes(need)) return { allow: false, reason: 'partner_role_missing' }
  return { allow: true, via: 'partner', audit: false }
}

export function decide(action: HuntAction, i: Inputs): Decision {
  const { hunt, actor, ctx } = i

  // The roster does not exist as a view, for anyone.
  if (action === 'read_roster') return { allow: false, reason: 'forbidden_for_everyone' }

  // A row from another Hunt is never this Hunt's to touch.
  if (ctx?.targetHuntId && ctx.targetHuntId !== hunt.id) return { allow: false, reason: 'wrong_hunt_or_venue' }

  const roles = effectiveRoles(i)
  const top = roles.reduce<number>((m, r) => Math.max(m, RANK[r]), 0)

  if (action === 'read_public') {
    if (hunt.visibility !== 'private') return { allow: true, via: 'public', audit: false }
    if (roles.length > 0) return { allow: true, via: 'role', audit: false }
    return { allow: false, reason: 'not_visible' }
  }

  if (!actor.profileId && !actor.platformSupport) return { allow: false, reason: 'signed_out' }

  if (action === 'read_own_run') {
    if (ctx?.runSubjectId && ctx.runSubjectId === actor.profileId) return { allow: true, via: 'player', audit: false }
    if (actor.platformSupport) return supportRead(i)
    return { allow: false, reason: 'not_own_run' }
  }

  if (action === 'read_run_for_case') return supportRead(i)

  if ((action === 'cancel_safety' || action === 'review_claim') && actor.platformSupport && ctx?.caseRef) {
    return { allow: true, via: 'support', audit: true }
  }

  if (action === 'submit_claim') {
    // Any signed-in member plays; the engine checks the run, placement and window.
    return { allow: true, via: actor.profileId && roles.length ? 'role' : 'player', audit: false }
  }

  if (action === 'grant_role' && ctx?.targetRole) {
    if (ctx.targetRole === 'owner') return { allow: false, reason: 'owner_only' }
    // An admin cannot touch the owner's grant.
    if (top < RANK.admin) return { allow: false, reason: roles.length ? 'role_too_low' : 'no_role' }
    return { allow: true, via: 'role', audit: true }
  }

  const allowed = ALLOWED[action]
  if (allowed && roles.some((r) => allowed.includes(r))) {
    return { allow: true, via: 'role', audit: action === 'transfer_owner' || action === 'publish' }
  }

  const viaPartner = partnerAllows(action, i)
  if (viaPartner) return viaPartner

  if (allowed === undefined && action !== 'export_own_contacts') return { allow: false, reason: 'forbidden_for_everyone' }
  if (action === 'export_own_contacts') return { allow: false, reason: 'wrong_hunt_or_venue' }
  if (action === 'transfer_owner') return { allow: false, reason: roles.length ? 'owner_only' : 'no_role' }
  return { allow: false, reason: roles.length ? 'role_too_low' : 'no_role' }
}

function supportRead(i: Inputs): Decision {
  if (!i.actor.platformSupport) return { allow: false, reason: 'not_own_run' }
  if (!i.ctx?.caseRef) return { allow: false, reason: 'needs_case' }
  return { allow: true, via: 'support', audit: true }
}
