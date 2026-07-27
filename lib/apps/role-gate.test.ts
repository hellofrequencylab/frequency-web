import { describe, it, expect } from 'vitest'
import { appGatePasses } from './access'
import type { AppGate, AppViewer } from './types'

// The PLATFORM nav axis on the App gate (ADR-848). These lock the two things that make this gate
// different from every other member of AppGate, and the one trap that motivated the `axis` field:
//
//   1. The role floor and the staff capability UNION. Every other gate system here is a single
//      predicate; this one admits on EITHER arm.
//   2. `requiresOperatedSpaces` is a hard VETO evaluated BEFORE the union, so it beats both arms.
//   3. `axis` says WHICH ladder `minAccess` is read against. The legacy catalogs value-encode this
//      and disagree: nav-areas reads 'janitor' as a COMMUNITY rung, while lib/admin/guard.ts reads
//      the same token as the `web_role` staff axis. ADR-208 moved real operators onto `web_role`,
//      so reading a studio leaf's `min:'janitor'` against the community ladder would hide it from
//      every actual operator and show it to anyone holding the deprecated community rung.

const base: AppViewer = { caps: new Set() }

const roleGate = (g: Partial<Extract<AppGate, { system: 'role' }>>): AppGate => ({
  system: 'role',
  minAccess: 'host',
  ...g,
})

describe('role gate — the community ladder arm', () => {
  it('admits a viewer at the floor', () => {
    expect(appGatePasses(roleGate({}), { ...base, role: 'host' })).toBe(true)
  })

  it('admits a viewer above the floor', () => {
    expect(appGatePasses(roleGate({}), { ...base, role: 'mentor' })).toBe(true)
  })

  it('refuses a viewer below the floor', () => {
    expect(appGatePasses(roleGate({}), { ...base, role: 'member' })).toBe(false)
  })

  it('refuses an anonymous viewer, who does not even clear the member rung', () => {
    expect(appGatePasses(roleGate({ minAccess: 'member' }), base)).toBe(false)
  })

  it('admits everyone at the visitor floor, signed in or not', () => {
    expect(appGatePasses(roleGate({ minAccess: 'visitor' }), base)).toBe(true)
  })
})

describe('role gate — the staff arm, and the union', () => {
  it('admits a staff viewer who fails the role floor, because the arms UNION', () => {
    const gate = roleGate({ minAccess: 'janitor', staffDomain: 'marketing' })
    expect(appGatePasses(gate, { ...base, role: 'member', staffRole: 'marketer' })).toBe(true)
  })

  it('admits a role viewer with no staff row at all, the other arm of the same union', () => {
    const gate = roleGate({ minAccess: 'host', staffDomain: 'platform' })
    expect(appGatePasses(gate, { ...base, role: 'host', staffRole: null })).toBe(true)
  })

  it('refuses a staff viewer whose domain does not cover the gate', () => {
    const gate = roleGate({ minAccess: 'janitor', staffDomain: 'platform' })
    // A marketer holds `marketing`, not `platform`.
    expect(appGatePasses(gate, { ...base, role: 'member', staffRole: 'marketer' })).toBe(false)
  })

  it('surfaces at READ level by default, matching nav-areas', () => {
    // `analyst` holds insights at read, not write.
    const gate = roleGate({ minAccess: 'janitor', staffDomain: 'insights' })
    expect(appGatePasses(gate, { ...base, role: 'member', staffRole: 'analyst' })).toBe(true)
  })

  it('honors a gate that opts into WRITE, which is stricter than surfacing', () => {
    const gate = roleGate({ minAccess: 'janitor', staffDomain: 'insights', staffLevel: 'write' })
    expect(appGatePasses(gate, { ...base, role: 'member', staffRole: 'analyst' })).toBe(false)
    expect(appGatePasses(gate, { ...base, role: 'member', staffRole: 'owner' })).toBe(true)
  })

  it('refuses a gate with no staffDomain for a staff viewer below the role floor', () => {
    const gate = roleGate({ minAccess: 'janitor' })
    expect(appGatePasses(gate, { ...base, role: 'member', staffRole: 'owner' })).toBe(false)
  })
})

describe('role gate — axis: the trap this field exists to prevent', () => {
  // A real operator today: web_role janitor, community_role member (ADR-208).
  const operator: AppViewer = { ...base, role: 'member', webRole: 'janitor' }
  // Someone still carrying the deprecated community rung, with no platform standing.
  const legacy: AppViewer = { ...base, role: 'janitor', webRole: 'none' }

  it('reads a web-axis floor against web_role, so the real operator passes', () => {
    expect(appGatePasses(roleGate({ axis: 'web', minAccess: 'janitor' }), operator)).toBe(true)
  })

  it('refuses the deprecated community rung on a web-axis floor', () => {
    expect(appGatePasses(roleGate({ axis: 'web', minAccess: 'janitor' }), legacy)).toBe(false)
  })

  it('inverts both answers on the community axis, which is exactly the bug', () => {
    expect(appGatePasses(roleGate({ minAccess: 'janitor' }), operator)).toBe(false)
    expect(appGatePasses(roleGate({ minAccess: 'janitor' }), legacy)).toBe(true)
  })

  it("treats a web-axis 'admin' floor as any platform staff, not the community rung", () => {
    const gate = roleGate({ axis: 'web', minAccess: 'admin' })
    expect(appGatePasses(gate, { ...base, role: 'member', webRole: 'admin' })).toBe(true)
    expect(appGatePasses(gate, { ...base, role: 'member', webRole: 'janitor' })).toBe(true)
    expect(appGatePasses(gate, { ...base, role: 'member', webRole: 'none' })).toBe(false)
  })

  it('falls through to the community ladder for a web-axis floor below admin, which has no web meaning', () => {
    const gate = roleGate({ axis: 'web', minAccess: 'host' })
    expect(appGatePasses(gate, { ...base, role: 'host', webRole: 'none' })).toBe(true)
    expect(appGatePasses(gate, { ...base, role: 'member', webRole: 'none' })).toBe(false)
  })

  it('defaults to the community axis when omitted, preserving NAV_AREAS behavior', () => {
    expect(appGatePasses(roleGate({ minAccess: 'host' }), { ...base, role: 'host' })).toBe(true)
  })

  it('fails a web-axis floor closed when webRole is absent', () => {
    expect(appGatePasses(roleGate({ axis: 'web', minAccess: 'janitor' }), { ...base, role: 'janitor' })).toBe(false)
  })
})

describe('role gate — requiresOperatedSpaces is a veto, not an arm', () => {
  const gate = roleGate({ minAccess: 'member', requiresOperatedSpaces: true })

  it('hides the row from a viewer who runs no Space, even at the floor', () => {
    expect(appGatePasses(gate, { ...base, role: 'mentor' })).toBe(false)
  })

  it('hides it from a staff viewer too, so the veto beats the staff arm', () => {
    const staffed = roleGate({ minAccess: 'janitor', staffDomain: 'platform', requiresOperatedSpaces: true })
    expect(appGatePasses(staffed, { ...base, role: 'member', staffRole: 'owner' })).toBe(false)
  })

  it('shows it once the viewer operates a Space and clears an arm', () => {
    expect(appGatePasses(gate, { ...base, role: 'member', operatesSpaces: true })).toBe(true)
  })

  it('treats anything other than true as failing the veto', () => {
    expect(appGatePasses(gate, { ...base, role: 'mentor', operatesSpaces: false })).toBe(false)
  })
})

describe('staff gate — the declared domain is now actually read', () => {
  // `domain` was declared on this gate from the start and never evaluated, so a domain-narrowed
  // staff gate granted MORE than the catalog said. These lock the narrowing shut.
  it('still admits any staff when the gate names no domain', () => {
    expect(appGatePasses({ system: 'staff' }, { ...base, isStaff: true })).toBe(true)
  })

  it('requires the named domain when the gate narrows to one', () => {
    const gate: AppGate = { system: 'staff', domain: 'finance' }
    expect(appGatePasses(gate, { ...base, isStaff: true, staffRole: 'accounting' })).toBe(true)
    expect(appGatePasses(gate, { ...base, isStaff: true, staffRole: 'marketer' })).toBe(false)
  })

  it('refuses a domain-narrowed gate when the viewer carries no staff row', () => {
    expect(appGatePasses({ system: 'staff', domain: 'platform' }, { ...base, isStaff: true })).toBe(false)
  })

  it('still fails closed when isStaff is unset, whatever the domain says', () => {
    expect(appGatePasses({ system: 'staff', domain: 'platform' }, { ...base, staffRole: 'owner' })).toBe(false)
  })
})
