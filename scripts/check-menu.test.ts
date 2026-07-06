import { describe, it, expect } from 'vitest'
import { menuViolations } from './check-menu.mjs'

// Locks the admin-menu contract guard (ADR-553, docs/MENU-CONTRACT.md). menuViolations is the
// pure classifier the CLI runs; feeding it fixture strings keeps the guard honest without touching
// the filesystem (mirrors scripts/check-rls.test.ts).

describe('check-menu (admin-menu contract guard)', () => {
  it('flags a hand-rolled parallel module catalog outside the source files', () => {
    const v = menuViolations('lib/circles/circle-menu.ts', 'const CIRCLE_MODULES = [\n  { id: "x" },\n]\n')
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('parallel-catalog')
  })

  it('flags reintroducing a retired parallel registry', () => {
    const v = menuViolations('lib/admin/entities/registry.ts', 'const ENTITY_SURFACES = [\n]\n')
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('retired-registry')
  })

  it('allows the canonical catalogs at their source paths', () => {
    expect(menuViolations('lib/admin/modules/space-modules.ts', 'export const SPACE_MODULES = [\n]\n')).toHaveLength(0)
    expect(menuViolations('lib/admin/modules/registry.ts', 'export const ADMIN_MODULES = [\n]\n')).toHaveLength(0)
    expect(menuViolations('lib/widgets/modules.ts', 'export const LAYOUT_MODULES = [\n]\n')).toHaveLength(0)
  })

  it('honors the // menu-ok: escape hatch', () => {
    const v = menuViolations('lib/x.ts', 'const OTHER_MODULES = [] // menu-ok: not an admin catalog, a build step\n')
    expect(v).toHaveLength(0)
  })

  it('does not flag unrelated code', () => {
    expect(menuViolations('lib/x.ts', 'const MODULE_COMPONENTS = {}\nconst surfaces = []\n')).toHaveLength(0)
  })
})
