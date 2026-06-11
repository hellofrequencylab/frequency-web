import { describe, it, expect } from 'vitest'
import {
  staffCan,
  staffSeesAdmin,
  resolveStaffAccess,
  staffDomainDefault,
  STAFF_ROLES,
  STAFF_DOMAINS,
  type CapabilityOverrides,
} from './staff-roles'

// P1.7 / ADR-222 — the per-FUNCTION (capability) override layer. Precedence is
// override > code-default(CAPS), and an empty/absent override must resolve EXACTLY
// as today. These are pure unit tests over the resolver (no DB).

describe('capability override resolution (ADR-222)', () => {
  it('PARITY: no override resolves EXACTLY as the code default (today) for every cell', () => {
    for (const role of STAFF_ROLES) {
      for (const domain of STAFF_DOMAINS) {
        const def = staffDomainDefault(role, domain)
        // resolver with no overrides === default
        expect(resolveStaffAccess(role, domain)).toBe(def)
        expect(resolveStaffAccess(role, domain, {})).toBe(def)
        // staffCan with no overrides === staffCan default behavior at every level
        for (const level of ['read', 'write'] as const) {
          const want = level === 'read' ? def === 'read' || def === 'write' : def === 'write'
          expect(staffCan(role, domain, level)).toBe(want)
          expect(staffCan(role, domain, level, {})).toBe(want)
        }
      }
    }
  })

  it('an override WINS over the code default (precedence)', () => {
    // analyst defaults to no community write; grant it via override.
    expect(staffCan('analyst', 'community', 'write')).toBe(false)
    const grant: CapabilityOverrides = { analyst: { community: 'write' } }
    expect(resolveStaffAccess('analyst', 'community', grant)).toBe('write')
    expect(staffCan('analyst', 'community', 'write', grant)).toBe(true)
    expect(staffCan('analyst', 'community', 'read', grant)).toBe(true)
  })

  it('an override can DENY a default-granted capability', () => {
    // operations defaults to community write; revoke it.
    expect(staffCan('operations', 'community', 'write')).toBe(true)
    const deny: CapabilityOverrides = { operations: { community: 'none' } }
    expect(resolveStaffAccess('operations', 'community', deny)).toBe('none')
    expect(staffCan('operations', 'community', 'write', deny)).toBe(false)
    expect(staffCan('operations', 'community', 'read', deny)).toBe(false)
  })

  it('an override can DOWNGRADE write → read', () => {
    expect(staffCan('admin', 'members', 'write')).toBe(true)
    const down: CapabilityOverrides = { admin: { members: 'read' } }
    expect(staffCan('admin', 'members', 'write', down)).toBe(false)
    expect(staffCan('admin', 'members', 'read', down)).toBe(true)
  })

  it('overrides are SCOPED to their exact (role, domain) cell — no bleed', () => {
    const ov: CapabilityOverrides = { analyst: { community: 'write' } }
    // same role, other domain: untouched
    expect(resolveStaffAccess('analyst', 'insights', ov)).toBe(staffDomainDefault('analyst', 'insights'))
    // other role, same domain: untouched
    expect(resolveStaffAccess('operations', 'community', ov)).toBe(
      staffDomainDefault('operations', 'community'),
    )
  })

  it('null role is never granted, with or without overrides', () => {
    const ov: CapabilityOverrides = { owner: { finance: 'write' } }
    expect(staffCan(null, 'finance', 'read', ov)).toBe(false)
    expect(resolveStaffAccess(undefined, 'finance', ov)).toBe('none')
  })

  it('staffSeesAdmin threads overrides: denying every admin-floor domain drops the floor', () => {
    // analyst sees the admin floor today (reads community/structure/insights/qr).
    expect(staffSeesAdmin('analyst')).toBe(true)
    // deny every admin-floor domain for analyst → no floor.
    const deny: CapabilityOverrides = {
      analyst: { community: 'none', structure: 'none', insights: 'none', qr: 'none' },
    }
    expect(staffSeesAdmin('analyst', deny)).toBe(false)
    // with no overrides it still sees the floor (behavior-preserving).
    expect(staffSeesAdmin('analyst', {})).toBe(true)
  })
})
