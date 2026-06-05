import { describe, it, expect } from 'vitest'
import { ADMIN_MODULES, modulesFor, showsAdminPanel, moduleById } from './registry'
import type { Capability, Scope } from '@/lib/core/capabilities'

// The engine is pure: which modules a tier sees is (scope kind × capabilities),
// not a per-role branch. These lock that contract.

const circleScope: Scope = { kind: 'circle', circleId: 'c1', hostId: 'h1' }

describe('admin module registry', () => {
  it('surfaces circle.settings to a viewer holding circle.editSettings', () => {
    const caps = new Set<Capability>(['circle.view', 'circle.editSettings'])
    expect(modulesFor(circleScope, caps).map((m) => m.id)).toContain('circle.settings')
    expect(showsAdminPanel(circleScope, caps)).toBe(true)
  })

  it('hides circle modules from a viewer without the capability (member tier)', () => {
    const caps = new Set<Capability>(['circle.view'])
    expect(modulesFor(circleScope, caps)).toHaveLength(0)
    expect(showsAdminPanel(circleScope, caps)).toBe(false)
  })

  it('does not surface circle modules on a non-circle scope', () => {
    const caps = new Set<Capability>(['circle.editSettings'])
    expect(modulesFor({ kind: 'global' }, caps)).toHaveLength(0)
    expect(modulesFor({ kind: 'profile', ownerId: 'p1' }, caps)).toHaveLength(0)
  })

  it('returns modules ordered by their `order` field', () => {
    const caps = new Set<Capability>(ADMIN_MODULES.map((m) => m.requiredCapability))
    const circleMods = modulesFor(circleScope, caps)
    const orders = circleMods.map((m) => m.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('has unique module ids and resolvable lookups', () => {
    const ids = ADMIN_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(moduleById('circle.settings')?.requiredCapability).toBe('circle.editSettings')
    expect(moduleById('does.not.exist')).toBeUndefined()
  })
})
