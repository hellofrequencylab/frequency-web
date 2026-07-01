import { describe, it, expect } from 'vitest'
import { previewableEntityRoles, isPreviewableEntityRole } from './entity-roles'
import { provisionableTypes, isProvisionableType } from './profile-config'

// The PROVISIONABLE entity-role set the staff "preview as entity" selector renders (JAN-01,
// ADR-340). Pure data, no IO. Locks: the set is SOURCED from the canonical provisionable-types helper
// (never a divergent hardcoded list) and the validator is downgrade-safe (fails closed for root and
// any non-provisionable value).

describe('previewableEntityRoles', () => {
  it('mirrors the provisionable-types helper (no divergent list)', () => {
    const roles = previewableEntityRoles()
    // Exactly the provisionable types the create wizard offers, same order, same labels.
    expect(roles.map((r) => r.type)).toEqual(provisionableTypes().map((t) => t.value))
    expect(roles.map((r) => r.label)).toEqual(provisionableTypes().map((t) => t.label))
  })

  it('covers the live entity roles and excludes root', () => {
    const types = previewableEntityRoles().map((r) => r.type)
    for (const live of ['practitioner', 'business', 'organization', 'coaching', 'event_space', 'lab', 'partner']) {
      expect(types).toContain(live)
    }
    expect(types).not.toContain('root')
  })

  it('includes lab and partner exactly when they are provisionable', () => {
    const types = previewableEntityRoles().map((r) => r.type)
    expect(types.includes('lab')).toBe(isProvisionableType('lab'))
    expect(types.includes('partner')).toBe(isProvisionableType('partner'))
  })
})

describe('isPreviewableEntityRole (downgrade-safe validator)', () => {
  it('accepts only provisionable entity-role values', () => {
    for (const t of provisionableTypes()) {
      expect(isPreviewableEntityRole(t.value)).toBe(true)
    }
  })

  it('fails closed for root, unknown, and empty values (no escalation)', () => {
    expect(isPreviewableEntityRole('root')).toBe(false)
    expect(isPreviewableEntityRole('janitor')).toBe(false)
    expect(isPreviewableEntityRole('admin')).toBe(false)
    expect(isPreviewableEntityRole('school')).toBe(false)
    expect(isPreviewableEntityRole('')).toBe(false)
    expect(isPreviewableEntityRole(null)).toBe(false)
    expect(isPreviewableEntityRole(undefined)).toBe(false)
  })
})
