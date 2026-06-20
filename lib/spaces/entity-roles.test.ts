import { describe, it, expect } from 'vitest'
import { previewableEntityRoles, isPreviewableEntityRole } from './entity-roles'
import { provisionableTypes, blueprintForType } from './blueprints'

// The PROVISIONABLE entity-role set the staff "preview as entity" selector renders (JAN-01,
// ADR-340). Pure data, no IO. Locks: the set is SOURCED from the blueprint registry (never a
// divergent hardcoded list) and the validator is downgrade-safe (fails closed for root and the
// not-yet-provisionable roles).

describe('previewableEntityRoles', () => {
  it('mirrors the blueprint registry provisionable set (no divergent list)', () => {
    const roles = previewableEntityRoles()
    // Exactly the provisionable types the create wizard offers, same order, same labels.
    expect(roles.map((r) => r.type)).toEqual(provisionableTypes().map((t) => t.value))
    expect(roles.map((r) => r.label)).toEqual(provisionableTypes().map((t) => t.label))
  })

  it('covers the five live entity roles and excludes root', () => {
    const types = previewableEntityRoles().map((r) => r.type)
    for (const live of ['practitioner', 'business', 'organization', 'coaching', 'event_space']) {
      expect(types).toContain(live)
    }
    expect(types).not.toContain('root')
  })

  it('includes lab and partner exactly when their blueprints are wired (ADMIN-05)', () => {
    const types = previewableEntityRoles().map((r) => r.type)
    // A role is previewable exactly when it has a registered blueprint, so this stays correct on
    // both sides of ADMIN-05 (deferred -> excluded; wired -> included).
    expect(types.includes('lab')).toBe(blueprintForType('lab') !== null)
    expect(types.includes('partner')).toBe(blueprintForType('partner') !== null)
  })

  it('every previewable role carries its blueprint typeLabel', () => {
    for (const role of previewableEntityRoles()) {
      expect(role.label).toBe(blueprintForType(role.type)!.typeLabel)
    }
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
    expect(isPreviewableEntityRole('lab')).toBe(blueprintForType('lab') !== null)
    expect(isPreviewableEntityRole('partner')).toBe(blueprintForType('partner') !== null)
    expect(isPreviewableEntityRole('janitor')).toBe(false)
    expect(isPreviewableEntityRole('admin')).toBe(false)
    expect(isPreviewableEntityRole('school')).toBe(false)
    expect(isPreviewableEntityRole('')).toBe(false)
    expect(isPreviewableEntityRole(null)).toBe(false)
    expect(isPreviewableEntityRole(undefined)).toBe(false)
  })
})
