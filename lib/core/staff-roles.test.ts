import { describe, it, expect } from 'vitest'
import { staffCan, isStaffRole, STAFF_ROLES } from './staff-roles'

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
