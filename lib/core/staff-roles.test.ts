import { describe, it, expect } from 'vitest'
import { staffCan, isStaffRole, isSuperStaff, STAFF_ROLES, SUPER_STAFF_ROLES } from './staff-roles'

describe('staff-roles capability matrix (ADR-127)', () => {
  it('owner writes every domain', () => {
    expect(staffCan('owner', 'finance')).toBe(true)
    expect(staffCan('owner', 'roles')).toBe(true)
    expect(staffCan('owner', 'platform')).toBe(true)
  })

  it('admin spans operations but only reads finance', () => {
    expect(staffCan('admin', 'community')).toBe(true)
    expect(staffCan('admin', 'roles')).toBe(true)
    expect(staffCan('admin', 'finance')).toBe(false)
    expect(staffCan('admin', 'finance', 'read')).toBe(true)
  })

  it('operations runs the community but not marketing/finance/roles', () => {
    expect(staffCan('operations', 'community')).toBe(true)
    expect(staffCan('operations', 'members')).toBe(true)
    expect(staffCan('operations', 'qr')).toBe(true)
    expect(staffCan('operations', 'marketing')).toBe(false)
    expect(staffCan('operations', 'finance')).toBe(false)
    expect(staffCan('operations', 'roles')).toBe(false)
  })

  it('marketing writes marketing, not community/finance', () => {
    expect(staffCan('marketer', 'marketing')).toBe(true)
    expect(staffCan('marketer', 'community')).toBe(false)
    expect(staffCan('marketer', 'finance')).toBe(false)
  })

  it('accounting writes finance only; members read-only', () => {
    expect(staffCan('accounting', 'finance')).toBe(true)
    expect(staffCan('accounting', 'members')).toBe(false)
    expect(staffCan('accounting', 'members', 'read')).toBe(true)
    expect(staffCan('accounting', 'community')).toBe(false)
  })

  it('analyst is read-only everywhere it can see', () => {
    expect(staffCan('analyst', 'insights', 'read')).toBe(true)
    expect(staffCan('analyst', 'insights', 'write')).toBe(false)
    expect(staffCan('analyst', 'community', 'write')).toBe(false)
    expect(staffCan('analyst', 'finance', 'read')).toBe(false)
  })

  it('null role grants nothing; isStaffRole guards values', () => {
    expect(staffCan(null, 'community', 'read')).toBe(false)
    expect(isStaffRole('operations')).toBe(true)
    expect(isStaffRole('janitor')).toBe(false)
    expect(isStaffRole(null)).toBe(false)
    expect(STAFF_ROLES).toContain('accounting')
  })
})

// ADR-223 — admin axis formalization: the System-3 super-ladder is named, and the
// staff-domain unlocks for the Support console, the Members roster, and Vera resolve
// through `staffCan` (the same domains the nav links + page guards gate on).
describe('staff-roles super-ladder + domain unlocks (ADR-223)', () => {
  it('owner/admin are the super-ladder; departments are not', () => {
    expect(isSuperStaff('owner')).toBe(true)
    expect(isSuperStaff('admin')).toBe(true)
    expect(isSuperStaff('operations')).toBe(false)
    expect(isSuperStaff('support')).toBe(false)
    expect(isSuperStaff('analyst')).toBe(false)
    expect(isSuperStaff(null)).toBe(false)
    expect(SUPER_STAFF_ROLES).toEqual(['owner', 'admin'])
  })

  it('Support console + Members roster unlock via the `members` domain (write)', () => {
    // The `/admin/support` and `/admin/members` gates union staffCan(role,'members').
    for (const r of ['owner', 'admin', 'operations', 'support'] as const) {
      expect(staffCan(r, 'members', 'write')).toBe(true)
    }
    // Accounting/Marketing get members READ only — not the write unlock; Analyst read-only.
    expect(staffCan('accounting', 'members', 'write')).toBe(false)
    expect(staffCan('marketer', 'members', 'write')).toBe(false)
    expect(staffCan('analyst', 'members', 'write')).toBe(false)
  })

  it('Vera config unlocks via the `insights` domain (write)', () => {
    expect(staffCan('owner', 'insights', 'write')).toBe(true)
    expect(staffCan('admin', 'insights', 'write')).toBe(true)
    // Read-only insights roles (Operations/Marketing/Accounting/Support/Analyst) do
    // NOT clear Vera's write gate.
    for (const r of ['operations', 'marketer', 'accounting', 'support', 'analyst'] as const) {
      expect(staffCan(r, 'insights', 'write')).toBe(false)
    }
  })

  it('existing grants are unchanged by the formalization', () => {
    expect(staffCan('admin', 'finance', 'write')).toBe(false)
    expect(staffCan('admin', 'finance', 'read')).toBe(true)
    expect(staffCan('operations', 'roles', 'write')).toBe(false)
    expect(staffCan('support', 'community', 'write')).toBe(true)
    expect(staffCan('support', 'profiles', 'write')).toBe(true)
  })
})
