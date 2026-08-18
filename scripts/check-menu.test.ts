import { describe, it, expect } from 'vitest'
import { menuViolations, moduleShapeViolations, handDeclaredMenuRows, laneViolations, menuSurface, runCheck } from './check-menu.mjs'

// Locks the admin-menu contract guard (ADR-553 · ADR-927, docs/MENU-CONTRACT.md). The guard's rules are
// exported as pure classifiers, so feeding them fixture strings keeps them honest without touching the
// filesystem (mirrors scripts/check-rls.test.ts). The point of these tests, after ADR-927: the gate must
// enforce "every menu row traces to a catalog row", NOT a naming convention — so the adversarial cases
// (rename the variable, move the list, add a lane) matter more than the happy path.

describe('check-menu · rule 2 (the legacy name floor)', () => {
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
    expect(menuViolations('lib/nav/studio.ts', 'export const STUDIO_LEAVES = [\n]\n')).toHaveLength(0)
  })

  it('honors the // menu-ok: escape hatch', () => {
    const v = menuViolations('lib/x.ts', 'const OTHER_MODULES = [] // menu-ok: not an admin catalog, a build step\n')
    expect(v).toHaveLength(0)
  })

  it('does not flag unrelated code', () => {
    expect(menuViolations('lib/x.ts', 'const MODULE_COMPONENTS = {}\nconst surfaces = []\n')).toHaveLength(0)
  })
})

describe('check-menu · rule 1 (module-catalog SHAPE, name-blind)', () => {
  // THE regression this rule exists for (ADR-927): the old gate matched `*_MODULES` by name, so it was
  // satisfiable by renaming the variable. The shape is the tell, so the name is irrelevant.
  const rows = `const anythingAtAll = [
  { id: 'circle.basics', label: 'Basics', slot: 'basics', render: 'inline', requiredCapability: 'circle.editSettings' },
  { id: 'circle.danger', label: 'Danger', slot: 'danger', render: 'inline', requiredCapability: 'circle.delete' },
]
`
  it('flags an admin-module-shaped list whatever the variable is called', () => {
    const v = moduleShapeViolations('lib/circles/whatever.ts', rows)
    expect(v).toHaveLength(1)
    expect(v[0].kind).toBe('module-shape')
  })

  it('still flags it after a rename that would satisfy the old name rule', () => {
    // No `*_MODULES` anywhere: rule 2 is silent, rule 1 is not. This is the hole ADR-927 named.
    expect(menuViolations('lib/circles/whatever.ts', rows)).toHaveLength(0)
    expect(moduleShapeViolations('lib/circles/whatever.ts', rows)).toHaveLength(1)
  })

  it('allows the same rows inside a registered catalog', () => {
    expect(moduleShapeViolations('lib/admin/modules/registry.ts', rows)).toHaveLength(0)
    expect(moduleShapeViolations('lib/admin/modules/space-modules.ts', rows)).toHaveLength(0)
  })

  it('does not flag a route-local `{ key, label, blurb }` grouping (the manage-hub section registries)', () => {
    const hub = `export const EVENT_HUB_SECTIONS = [
  { key: 'home', label: 'Home', blurb: 'Your command center.' },
  { key: 'guests', label: 'Guests', blurb: 'Who is coming.' },
]
`
    expect(moduleShapeViolations('app/(main)/events/[slug]/manage/hub.ts', hub)).toHaveLength(0)
    expect(handDeclaredMenuRows('app/(main)/events/[slug]/manage/hub.ts', hub).count).toBe(0)
  })
})

describe('check-menu · rule 3 (hand-declared menu rows in the resolution surface)', () => {
  it('counts a hand-typed per-scope link menu', () => {
    const bank = `function baseBank(scope) {
  switch (scope.kind) {
    case 'space':
      return [
        { label: 'Manage console', icon: Settings, href: '/x' },
        { label: 'CRM', icon: Users, href: '/y' },
      ]
    default:
      return []
  }
}
`
    expect(handDeclaredMenuRows('lib/admin/rail-bank.ts', bank).count).toBe(2)
  })

  it('does not count rows DERIVED from the catalog (no string-literal label)', () => {
    const derived = `const rows = apps.map((a) => [{ id: a.id, label: a.label, node: nodeFor(a) }])\n`
    expect(handDeclaredMenuRows('components/layout/settings-panel.tsx', derived).count).toBe(0)
  })

  it('honors // menu-ok: on the array', () => {
    const ok = `const x = [ // menu-ok: a fixture, not a menu
  { label: 'A', href: '/a' },
]
`
    expect(handDeclaredMenuRows('lib/admin/x.ts', ok).count).toBe(0)
  })

  it('covers the rail model, the rail bank and the App catalog', () => {
    const surface = menuSurface()
    expect(surface).toContain('components/layout/settings-panel.tsx')
    expect(surface).toContain('lib/admin/rail-bank.ts')
    expect(surface).toContain('lib/apps/catalog.ts')
    expect(surface).toContain('lib/apps/for-scope.ts')
    expect(surface).toContain('lib/admin/entity-console.ts')
    expect(surface).toContain('lib/admin/modules/space-menu.ts')
  })

  it('extends the surface one hop into lib/, so a list cannot escape by moving sideways', () => {
    // lib/nav/studio.ts is not under a seed directory; it is in the surface because lib/apps/catalog.ts
    // imports it. That hop is what stops "move the hand-rolled array into a new lib file" from working.
    expect(menuSurface()).toContain('lib/nav/studio.ts')
  })
})

describe('check-menu · rule 4 (the APPS lane manifest)', () => {
  const ok = `import { ADMIN_MODULES } from '@/lib/admin/modules/registry'
import { LAYOUT_MODULES } from '@/lib/widgets/modules'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { STUDIO_LEAVES } from '@/lib/nav/studio'
const EDITOR_APPS = ADMIN_MODULES.map((m) => m)
const PAGE_APPS = LAYOUT_MODULES.map((m) => m)
const ELEMENT_SEEDS = []
const ELEMENT_APPS = ELEMENT_SEEDS.map((m) => m)
const SPACE_EDITOR_APPS = SPACE_MODULES.map((m) => m)
const ADMIN_NAV_APPS = STUDIO_LEAVES.map((m) => m)
export const APPS = [...EDITOR_APPS, ...PAGE_APPS, ...ELEMENT_APPS, ...SPACE_EDITOR_APPS, ...ADMIN_NAV_APPS]
`
  it('passes the registered five-lane composition', () => {
    expect(laneViolations(ok)).toHaveLength(0)
  })

  it('fails an unregistered SIXTH lane', () => {
    const src = ok.replace(
      'export const APPS = [',
      'const BESPOKE_APPS = [{ id: "x" }]\nexport const APPS = [...BESPOKE_APPS, ',
    )
    const v = laneViolations(src)
    expect(v.some((x: { text: string }) => x.text.includes('UNREGISTERED lane `BESPOKE_APPS`'))).toBe(true)
  })

  it('fails a lane repointed at a hand-rolled array', () => {
    const src = ok.replace('const EDITOR_APPS = ADMIN_MODULES.map', 'const HAND_ROLLED = []\nconst EDITOR_APPS = HAND_ROLLED.map')
    const v = laneViolations(src)
    expect(v.some((x: { text: string }) => x.text.includes('derives from `HAND_ROLLED`'))).toBe(true)
  })

  it('fails a lane that restates rows instead of deriving them', () => {
    const src = ok.replace('const EDITOR_APPS = ADMIN_MODULES.map((m) => m)', 'const EDITOR_APPS = [{ id: "x" }]')
    const v = laneViolations(src)
    expect(v.some((x: { text: string }) => x.text.includes('not a `<CATALOG>.map(...)` derivation'))).toBe(true)
  })

  it('fails a lane sourced from a catalog that is not registered', () => {
    const src = ok
      .replace("import { STUDIO_LEAVES } from '@/lib/nav/studio'", "import { STUDIO_LEAVES } from '@/lib/nav/somewhere-else'")
    const v = laneViolations(src)
    expect(v.some((x: { text: string }) => x.text.includes('not imported from a REGISTERED catalog'))).toBe(true)
  })

  it('fails when a registered lane silently stops being composed', () => {
    const src = ok.replace(', ...ADMIN_NAV_APPS]', ']')
    const v = laneViolations(src)
    expect(v.some((x: { text: string }) => x.text.includes('no longer composed into `APPS`'))).toBe(true)
  })
})

describe('check-menu · the live repo', () => {
  it('is green, with the frozen debt held at its baseline', () => {
    const { violations, ratchet } = runCheck()
    expect(violations).toEqual([])
    // The three grandfathered sites (ADR-927): the rail model's inline extras, the rail bank's per-scope
    // links, and the channel module's duplicated hub links. Any of them may FALL; none may rise.
    expect(ratchet.stale).toEqual([])
    expect(ratchet.held.length + ratchet.fell.length).toBe(3)
  })
})
