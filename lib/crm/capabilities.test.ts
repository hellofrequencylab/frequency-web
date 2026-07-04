import { describe, it, expect } from 'vitest'
import { resolveCrmCapabilities, canCrm, type CrmContext } from './capabilities'

// A signed-in viewer with no Space and no staff standing.
const member: CrmContext = { viewer: { profileId: 'p1', tier: 'free', webRole: 'none' } }

// The free personal contact engine — granted to every signed-in member (the spine, never gated).
const PERSONAL = [
  'crm.contacts.view',
  'crm.contacts.edit',
  'crm.capture',
  'crm.reminders',
  'crm.referral',
  'crm.graph',
  'crm.ai.personal',
] as const

describe('resolveCrmCapabilities — anonymous', () => {
  it('grants nothing to an anonymous viewer', () => {
    const caps = resolveCrmCapabilities({ viewer: { profileId: null } })
    expect(caps.size).toBe(0)
  })
})

describe('resolveCrmCapabilities — personal engine (free utility)', () => {
  it('grants the full personal contact engine to any signed-in member', () => {
    const caps = resolveCrmCapabilities(member)
    for (const c of PERSONAL) expect(canCrm(caps, c)).toBe(true)
  })

  it('does NOT grant any Space or Root capability to a plain member', () => {
    const caps = resolveCrmCapabilities(member)
    expect(canCrm(caps, 'crm.space.view')).toBe(false)
    expect(canCrm(caps, 'crm.root.allContacts')).toBe(false)
    expect(canCrm(caps, 'crm.root.campaigns')).toBe(false)
  })

  it('does not depend on paid tier — a free member has the same personal engine as Crew', () => {
    const free = resolveCrmCapabilities({ viewer: { profileId: 'p1', tier: 'free' } })
    const crew = resolveCrmCapabilities({ viewer: { profileId: 'p1', tier: 'crew' } })
    for (const c of PERSONAL) expect(canCrm(free, c)).toBe(canCrm(crew, c))
  })
})

describe('resolveCrmCapabilities — Space CRM amplifiers (plan axis)', () => {
  it('grants the CRM board to a practitioner-plan Space admin, but no business modules', () => {
    const caps = resolveCrmCapabilities({
      ...member,
      space: { id: 's1', entitlements: { crm: true }, featureRoles: {} },
      spaceRole: 'admin',
    })
    expect(canCrm(caps, 'crm.space.view')).toBe(true)
    expect(canCrm(caps, 'crm.space.pipeline')).toBe(true)
    // Business-plan modules are NOT unlocked by the CRM entitlement alone (default-deny).
    expect(canCrm(caps, 'crm.space.multiPipeline')).toBe(false)
    expect(canCrm(caps, 'crm.space.email')).toBe(false)
    expect(canCrm(caps, 'crm.space.automation')).toBe(false)
    expect(canCrm(caps, 'crm.space.team')).toBe(false)
    expect(canCrm(caps, 'crm.space.analytics')).toBe(false)
  })

  it('unlocks the business modules when the plan grants their entitlement keys', () => {
    const caps = resolveCrmCapabilities({
      ...member,
      space: {
        id: 's1',
        entitlements: { crm: true, email: true, automation: true, team: true, multi_pipeline: true },
        featureRoles: {},
      },
      spaceRole: 'admin',
    })
    expect(canCrm(caps, 'crm.space.multiPipeline')).toBe(true)
    expect(canCrm(caps, 'crm.space.email')).toBe(true)
    expect(canCrm(caps, 'crm.space.campaigns')).toBe(true)
    expect(canCrm(caps, 'crm.space.automation')).toBe(true)
    expect(canCrm(caps, 'crm.space.team')).toBe(true)
  })

  it('unlocks analytics only with the reporting entitlement (organization+)', () => {
    const caps = resolveCrmCapabilities({
      ...member,
      space: { id: 's1', entitlements: { crm: true, reporting: true }, featureRoles: {} },
      spaceRole: 'admin',
    })
    expect(canCrm(caps, 'crm.space.analytics')).toBe(true)
  })

  it('fails closed: a viewer below the CRM min-role gets no Space CRM access', () => {
    const caps = resolveCrmCapabilities({
      ...member,
      space: { id: 's1', entitlements: { crm: true, email: true }, featureRoles: {} },
      spaceRole: 'editor', // below the default 'admin' min-role for the CRM function
    })
    expect(canCrm(caps, 'crm.space.view')).toBe(false)
    expect(canCrm(caps, 'crm.space.email')).toBe(false)
  })

  it('UNIVERSAL (ADR-517 Phase F): an admin of a plain Space gets the CRM board with no entitlement', () => {
    // Under universal functions the pure CRM board access no longer default-denies on the entitlement blob;
    // it is available to a manager of any Space. The freemium TIER (Phase G) governs usage/limits via the
    // LIVE seam, not this pure resolver.
    const caps = resolveCrmCapabilities({
      ...member,
      space: { id: 's1', entitlements: {}, featureRoles: {} },
      spaceRole: 'admin',
    })
    expect(canCrm(caps, 'crm.space.view')).toBe(true)
  })
})

describe('resolveCrmCapabilities — Root (staff axis)', () => {
  it('an admin reads the unified hub but does not get platform-wide campaigns', () => {
    const caps = resolveCrmCapabilities({ viewer: { profileId: 'p1', webRole: 'admin' } })
    expect(canCrm(caps, 'crm.root.allContacts')).toBe(true)
    expect(canCrm(caps, 'crm.root.campaigns')).toBe(false)
  })

  it('a janitor (Executive Admin) reads the hub AND runs platform-wide campaigns', () => {
    const caps = resolveCrmCapabilities({ viewer: { profileId: 'p1', webRole: 'janitor' } })
    expect(canCrm(caps, 'crm.root.allContacts')).toBe(true)
    expect(canCrm(caps, 'crm.root.campaigns')).toBe(true)
  })

  it('Root never carries a capability to read a member’s private contacts (none exists)', () => {
    const caps = resolveCrmCapabilities({ viewer: { profileId: 'p1', webRole: 'janitor' } })
    // The capability vocabulary deliberately has no "view others' private contacts" grant.
    expect([...caps].some((c) => c.includes('private'))).toBe(false)
  })
})
