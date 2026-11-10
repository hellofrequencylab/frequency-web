import { describe, expect, it } from 'vitest'
import { decide, effectiveRoles } from './authz'
import type { Actor, Context, HuntAction, HuntFacts, Inputs, PartnerRow, RoleGrant } from './authz'

// Two Spaces, two Hunts. Hunt A is owned by Space X and Space Y is its accepted partner venue.
// Hunt B belongs to Space Y alone: nothing granted on A reaches it. Each case below is a deny or
// allow example from docs/hunts/ROLE-MATRIX.md.
const NOW = '2026-12-01T12:00:00Z'
const BEFORE = '2026-12-01T11:59:00Z'
const AFTER = '2026-12-01T12:01:00Z'

const X = 'space-x'
const Y = 'space-y'
const huntA: HuntFacts = { id: 'hunt-a', visibility: 'unlisted', ownerProfileId: 'p-owner', ownerSpaceId: null }
const huntB: HuntFacts = { id: 'hunt-b', visibility: 'public', ownerProfileId: null, ownerSpaceId: Y }
const privateHunt: HuntFacts = { ...huntA, visibility: 'private' }

const grant = (huntId: string, profileId: string, role: RoleGrant['role'], extra: Partial<RoleGrant> = {}): RoleGrant => ({
  huntId, profileId, role, expiresAt: null, revokedAt: null, ...extra,
})
const partner = (extra: Partial<PartnerRow> = {}): PartnerRow => ({
  huntId: 'hunt-a', spaceId: Y, status: 'accepted', effectiveAt: '2026-11-20T00:00:00Z', revokedAt: null,
  permittedRoles: ['operator', 'editor'], ...extra,
})

const grants: RoleGrant[] = [
  grant('hunt-a', 'p-admin', 'admin'),
  grant('hunt-a', 'p-editor', 'editor'),
  grant('hunt-a', 'p-operator', 'operator'),
  grant('hunt-b', 'p-operator', 'operator'), // an operator of B only matters for the wrong-Hunt case
]

const inputs = (actor: Actor, ctx: Context = {}, over: Partial<Inputs> = {}): Inputs => ({
  hunt: huntA, grants, partners: [partner()], actor, ctx, now: NOW, ...over,
})
const can = (a: HuntAction, i: Inputs) => decide(a, i).allow
const reason = (a: HuntAction, i: Inputs) => {
  const d = decide(a, i)
  return d.allow ? null : d.reason
}

const anon: Actor = { profileId: null }
const player: Actor = { profileId: 'p-player' }
const owner: Actor = { profileId: 'p-owner' }
const admin: Actor = { profileId: 'p-admin' }
const editor: Actor = { profileId: 'p-editor' }
const operator: Actor = { profileId: 'p-operator' }
const yStaff: Actor = { profileId: 'p-y-staff', staffSpaceIds: [Y] }
const xStaff: Actor = { profileId: 'p-x-staff', staffSpaceIds: [X] }
const support: Actor = { profileId: 'p-support', platformSupport: true }

describe('anonymous and player scopes', () => {
  it('lets a visitor read an unlisted or public Hunt and nothing else', () => {
    expect(can('read_public', inputs(anon))).toBe(true)
    expect(can('read_public', inputs(anon, {}, { hunt: huntB }))).toBe(true)
    for (const a of ['submit_claim', 'read_own_run', 'publish', 'verify_claim'] as const) {
      expect(reason(a, inputs(anon, { runSubjectId: 'p-player' }))).toBe('signed_out')
    }
  })

  it('hides a private Hunt from everyone without a role', () => {
    expect(reason('read_public', inputs(anon, {}, { hunt: privateHunt }))).toBe('not_visible')
    expect(reason('read_public', inputs(player, {}, { hunt: privateHunt }))).toBe('not_visible')
    expect(can('read_public', inputs(editor, {}, { hunt: privateHunt }))).toBe(true)
  })

  it('lets any signed-in member submit a claim and read only their own run', () => {
    expect(can('submit_claim', inputs(player))).toBe(true)
    expect(can('read_own_run', inputs(player, { runSubjectId: 'p-player' }))).toBe(true)
    // Deny 5: guessing another player's run id.
    expect(reason('read_own_run', inputs(player, { runSubjectId: 'p-other' }))).toBe('not_own_run')
  })

  it('gives a player no management action', () => {
    for (const a of ['edit_draft', 'publish', 'pause_resume', 'end', 'grant_role', 'transfer_owner', 'manage_placement', 'verify_claim', 'redeem_reward', 'review_claim', 'read_aggregate', 'export_hunt'] as const) {
      expect(can(a, inputs(player, { targetRole: 'editor' }))).toBe(false)
    }
  })
})

describe('owner, admin, editor and operator lanes', () => {
  it('lets the owner do everything the matrix gives an owner', () => {
    for (const a of ['edit_draft', 'publish', 'pause_resume', 'end', 'cancel_safety', 'transfer_owner', 'manage_placement', 'verify_claim', 'redeem_reward', 'review_claim', 'read_aggregate', 'export_hunt'] as const) {
      expect(can(a, inputs(owner))).toBe(true)
    }
    expect(can('grant_role', inputs(owner, { targetRole: 'admin' }))).toBe(true)
  })

  it('Deny 1: an editor drafts but does not publish', () => {
    expect(can('edit_draft', inputs(editor))).toBe(true)
    expect(reason('publish', inputs(editor))).toBe('role_too_low')
    expect(can('verify_claim', inputs(editor))).toBe(false)
  })

  it('Deny 2: an admin cannot transfer ownership or grant the owner role', () => {
    expect(can('publish', inputs(admin))).toBe(true)
    expect(reason('transfer_owner', inputs(admin))).toBe('owner_only')
    expect(reason('grant_role', inputs(admin, { targetRole: 'owner' }))).toBe('owner_only')
  })

  it('Deny 11: an operator cannot grant roles, so cannot make themselves admin', () => {
    expect(reason('grant_role', inputs(operator, { targetRole: 'admin' }))).toBe('role_too_low')
  })

  it('lets an operator run the door and not edit', () => {
    for (const a of ['verify_claim', 'redeem_reward', 'review_claim', 'read_aggregate'] as const) {
      expect(can(a, inputs(operator))).toBe(true)
    }
    expect(can('edit_draft', inputs(operator))).toBe(false)
    expect(can('manage_placement', inputs(operator))).toBe(false)
  })

  it('Deny 3: roles are per Hunt, so an operator of B cannot verify on A and a row from B is refused', () => {
    const onlyB = { ...inputs({ profileId: 'p-operator-b' }), grants: [grant('hunt-b', 'p-operator-b', 'operator')] }
    expect(reason('verify_claim', onlyB)).toBe('no_role')
    // Even an operator of A is refused a claim row that belongs to Hunt B.
    expect(reason('verify_claim', inputs(operator, { targetHuntId: 'hunt-b' }))).toBe('wrong_hunt_or_venue')
  })

  it('Deny 12: a grant past its expiry is no grant', () => {
    const expired = grants.concat(grant('hunt-a', 'p-late', 'editor', { expiresAt: BEFORE }))
    expect(effectiveRoles(inputs({ profileId: 'p-late' }, {}, { grants: expired }))).toEqual([])
    expect(reason('edit_draft', inputs({ profileId: 'p-late' }, {}, { grants: expired }))).toBe('no_role')
  })

  it('Deny 9: a Space role removed this instant stops working on the next call', () => {
    const ownsViaSpace: HuntFacts = { ...huntA, ownerProfileId: null, ownerSpaceId: X }
    const live = inputs({ profileId: 'p-x-admin', ownerSpaceRole: 'admin' }, {}, { hunt: ownsViaSpace })
    expect(can('publish', live)).toBe(true)
    // The loader re-reads standing every request; once it no longer reports the role the action is refused.
    const revoked = inputs({ profileId: 'p-x-admin', ownerSpaceRole: null }, {}, { hunt: ownsViaSpace })
    expect(reason('publish', revoked)).toBe('no_role')
  })
})

describe('immediate staff revocation', () => {
  const g = grant('hunt-a', 'p-door', 'operator', { revokedAt: NOW })
  it('treats a grant revoked at or before now as gone, and one revoked later as still live', () => {
    const base = inputs({ profileId: 'p-door' }, {}, { grants: [g] })
    expect(can('verify_claim', base)).toBe(false)
    expect(can('verify_claim', { ...base, now: BEFORE })).toBe(true)
    expect(can('verify_claim', { ...base, now: AFTER })).toBe(false)
  })
})

describe('partner Space scope (Space Y venue of Hunt A)', () => {
  const at = (s: Actor, extra: Partial<Inputs> = {}) => inputs(s, { venueSpaceId: Y }, extra)

  it("lets Y's staff verify, redeem and review at Y when the partner is accepted and permits operator", () => {
    for (const a of ['verify_claim', 'redeem_reward', 'review_claim', 'read_aggregate', 'export_own_contacts'] as const) {
      expect(can(a, at(yStaff))).toBe(true)
    }
    expect(can('manage_placement', at(yStaff))).toBe(true)
  })

  it('Deny 4: a revoked or withdrawn partner is refused immediately', () => {
    expect(reason('verify_claim', at(yStaff, { partners: [partner({ revokedAt: NOW })] }))).toBe('partner_not_active')
    expect(reason('verify_claim', at(yStaff, { partners: [partner({ status: 'withdrawn' })] }))).toBe('partner_not_active')
    expect(reason('verify_claim', at(yStaff, { partners: [partner({ status: 'invited' })] }))).toBe('partner_not_active')
    expect(reason('verify_claim', at(yStaff, { partners: [partner({ effectiveAt: AFTER })] }))).toBe('partner_not_active')
  })

  it('refuses staff of another Space and former staff of Y', () => {
    expect(reason('verify_claim', at(xStaff))).toBe('not_staff')
    expect(reason('verify_claim', at({ profileId: 'p-former', staffSpaceIds: [] }))).toBe('not_staff')
  })

  it('refuses an action the partner agreement does not permit', () => {
    expect(reason('verify_claim', at(yStaff, { partners: [partner({ permittedRoles: ['editor'] })] }))).toBe('partner_role_missing')
  })

  it('refuses a venue that is not a partner of this Hunt and a missing venue', () => {
    expect(can('verify_claim', inputs(yStaff, { venueSpaceId: X }))).toBe(false)
    expect(reason('verify_claim', inputs(yStaff, {}))).toBe('no_role')
  })

  it('gives a partner no authority over the Hunt itself', () => {
    for (const a of ['publish', 'pause_resume', 'end', 'grant_role', 'transfer_owner', 'export_hunt', 'edit_draft'] as const) {
      expect(can(a, at(yStaff, {}))).toBe(false)
    }
  })

  it("Deny 6: Y's staff cannot export another Space's contacts, and a Hunt B row stays out of reach", () => {
    expect(can('export_own_contacts', inputs(yStaff, { venueSpaceId: X }))).toBe(false)
    expect(reason('verify_claim', at(yStaff, { ctx: { venueSpaceId: Y, targetHuntId: 'hunt-b' } }))).toBe('wrong_hunt_or_venue')
  })
})

describe('support and the roster', () => {
  it('Deny 8: support reads a run only with a case, and the read is audited', () => {
    expect(reason('read_run_for_case', inputs(support, { runSubjectId: 'p-player' }))).toBe('needs_case')
    const d = decide('read_run_for_case', inputs(support, { runSubjectId: 'p-player', caseRef: 'CASE-1' }))
    expect(d).toEqual({ allow: true, via: 'support', audit: true })
  })

  it('lets support cancel for safety and review a claim with a case, and nothing more', () => {
    const c = { caseRef: 'CASE-1' }
    expect(can('cancel_safety', inputs(support, c))).toBe(true)
    expect(can('review_claim', inputs(support, c))).toBe(true)
    expect(can('publish', inputs(support, c))).toBe(false)
    expect(can('cancel_safety', inputs(support, {}))).toBe(false)
  })

  it('Deny 7: nobody gets the participant roster', () => {
    for (const a of [anon, player, owner, admin, editor, operator, yStaff, support]) {
      expect(reason('read_roster', inputs(a, { venueSpaceId: Y, caseRef: 'CASE-1' }))).toBe('forbidden_for_everyone')
    }
  })

  it('Deny 10: a signed-out visitor cannot post a claim', () => {
    expect(reason('submit_claim', inputs(anon))).toBe('signed_out')
  })
})
