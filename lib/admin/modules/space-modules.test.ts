import { describe, it, expect } from 'vitest'
import {
  SPACE_MODULES,
  spaceModuleById,
  isFeatureEnabled,
  isModuleEnabled,
  spaceModuleManifest,
} from './space-modules'
import { SPACE_FUNCTIONS, type SpaceFunctionKey } from '@/lib/spaces/functions'

// ADR-543 (docs/MODULAR-MENU.md P0): the universal SPACE module catalog + manifest.

describe('SPACE_MODULES catalog', () => {
  it('has unique ids and a monotonic order', () => {
    const ids = SPACE_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const orders = SPACE_MODULES.map((m) => m.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('covers every space SERVICE function with at least one module (profile is the shell)', () => {
    const featured = new Set(
      SPACE_MODULES.filter((m) => m.gate.kind === 'feature').map((m) => (m.gate as { fn: SpaceFunctionKey }).fn),
    )
    for (const fn of SPACE_FUNCTIONS.map((f) => f.key)) {
      if (fn === 'profile') continue // the shell (Identity & Branding / Info & Connect) covers profile
      expect(featured, `no module gates on function ${fn}`).toContain(fn)
    }
  })

  it('splits the commerce services into INDEPENDENT modules (no merged Offerings surface)', () => {
    for (const id of ['space.booking', 'space.memberships', 'space.donations', 'space.enroll', 'space.tickets', 'space.checkin', 'space.services']) {
      expect(spaceModuleById(id), `${id} should be its own module`).not.toBeNull()
    }
    expect(spaceModuleById('space.offerings')).toBeNull() // the merged surface is gone
  })

  it('keeps the shell modules always-on and every service feature-gated + toggleable', () => {
    for (const m of SPACE_MODULES) {
      if (m.gate.kind === 'feature') {
        expect(m.featureKey, `${m.id} feature module should carry a featureKey`).toBe(m.gate.fn)
      }
    }
    // The shell areas that can never be turned off:
    for (const id of ['space.branding', 'space.basics', 'space.layout', 'space.settings', 'space.danger']) {
      expect(spaceModuleById(id)?.gate.kind).toBe('always')
    }
  })

  it('gives every module a deep-editing route except Danger (inline delete)', () => {
    for (const m of SPACE_MODULES) {
      if (m.id === 'space.danger') continue
      expect(typeof m.deepLink, `${m.id} needs a deepLink`).toBe('function')
      expect(m.deepLink?.('demo')).toMatch(/^\/spaces\/demo\//)
    }
  })
})

describe('feature gating', () => {
  it('is default-ON (a feature is enabled unless explicitly false)', () => {
    expect(isFeatureEnabled(undefined, 'crm')).toBe(true)
    expect(isFeatureEnabled({}, 'crm')).toBe(true)
    expect(isFeatureEnabled({ crm: true }, 'crm')).toBe(true)
    expect(isFeatureEnabled({ crm: false }, 'crm')).toBe(false)
  })

  it('isModuleEnabled: shell always, service follows its feature', () => {
    const crm = spaceModuleById('space.crm')!
    const page = spaceModuleById('space.layout')!
    expect(isModuleEnabled(page, { crm: false })).toBe(true) // shell
    expect(isModuleEnabled(crm, {})).toBe(true)
    expect(isModuleEnabled(crm, { crm: false })).toBe(false)
  })
})

describe('spaceModuleManifest', () => {
  it('returns the full catalog (order-sorted) with default entitlements', () => {
    const manifest = spaceModuleManifest({})
    expect(manifest).toHaveLength(SPACE_MODULES.length)
    const orders = manifest.map((m) => m.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })

  it('drops modules whose feature is turned off', () => {
    const manifest = spaceModuleManifest({ crm: false, availability: false })
    const ids = manifest.map((m) => m.id)
    expect(ids).not.toContain('space.crm')
    expect(ids).not.toContain('space.booking')
    expect(ids).toContain('space.people') // members still on
    expect(ids).toContain('space.layout') // shell still on
  })

  it('drops hidden modules and honors the owner order', () => {
    const manifest = spaceModuleManifest({}, { hidden: ['space.danger'], order: ['space.crm', 'space.people'] })
    const ids = manifest.map((m) => m.id)
    expect(ids).not.toContain('space.danger')
    expect(ids[0]).toBe('space.crm')
    expect(ids[1]).toBe('space.people')
    // unlisted modules keep catalog order after the explicit ones
    expect(ids.slice(2)).toEqual([...ids.slice(2)].sort((a, b) => spaceModuleById(a)!.order - spaceModuleById(b)!.order))
  })

  it('a disabled QR feature drops BOTH its modules (QR codes + Insights)', () => {
    const ids = spaceModuleManifest({ qr: false }).map((m) => m.id)
    expect(ids).not.toContain('space.reach')
    expect(ids).not.toContain('space.insights')
  })
})
