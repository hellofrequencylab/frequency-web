import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bindingProblems, objectKeys, BASELINE, REGISTRY, MIN_PAGE_APPS } from './check-surface-binding.mjs'
import { APPS } from '../lib/apps/catalog'

// Locks check:surface-binding (EDITOR-GATES §3). The CLI runs `bindingProblems` over the real catalog and the
// parsed COMPONENTS keys; here it runs over the live tree (the enforcing arm beside the CLI) and over mutated
// copies of it, so every assertion is proven to fire. Its vitest home is the one guard-wiring.test.ts names.

const componentKeys = objectKeys(readFileSync(REGISTRY, 'utf8'), 'COMPONENTS')!
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { unboundPageDescriptors: number }
const live = { apps: APPS, componentKeys, baseline }
const pageApps = APPS.filter((a) => a.surfaces.page !== undefined)

describe('check:surface-binding, the live tree', () => {
  it('holds', () => {
    expect(bindingProblems(live)).toEqual([])
  })

  it('finds the page Apps and the registry (the floors are real, not vacuous)', () => {
    expect(pageApps.length).toBeGreaterThanOrEqual(MIN_PAGE_APPS)
    expect(componentKeys.length).toBeGreaterThanOrEqual(MIN_PAGE_APPS)
  })

  it('reads the two readings apart: the descriptors are empty, the components resolve', () => {
    const empty = pageApps.filter((a) => Object.keys(a.surfaces.page as object).length === 0).length
    expect(empty).toBe(baseline.unboundPageDescriptors)
    expect(pageApps.every((a) => componentKeys.includes(a.id))).toBe(true)
  })
})

describe('check:surface-binding, each arm fires', () => {
  it('S0 an empty catalog, an empty registry and a missing baseline say so rather than pass', () => {
    expect(bindingProblems({ ...live, apps: [] }).join()).toContain('page Apps, under the floor')
    expect(bindingProblems({ ...live, componentKeys: [] }).join()).toContain('COMPONENTS keys')
    expect(bindingProblems({ ...live, baseline: null }).join()).toContain('no integer unboundPageDescriptors')
  })

  it('S2 a page App with no component, and a component with no page App', () => {
    const extraApp = { id: 'ghost-block', surfaces: { page: {} } }
    expect(bindingProblems({ ...live, apps: [...APPS, extraApp] }).join()).toContain("page App 'ghost-block' has no component")
    expect(bindingProblems({ ...live, componentKeys: [...componentKeys, 'orphan-component'] }).join()).toContain("component 'orphan-component'")
  })

  it('S3 a new empty descriptor fails above the baseline, and a recorded win must lower it', () => {
    const extra = { id: componentKeys[0], surfaces: { page: {} } }
    expect(bindingProblems({ ...live, apps: [...APPS.filter((a) => a.id !== componentKeys[0]), extra], baseline: { unboundPageDescriptors: baseline.unboundPageDescriptors - 1 } }).join()).toContain('above the baseline')
    expect(bindingProblems({ ...live, baseline: { unboundPageDescriptors: baseline.unboundPageDescriptors + 1 } }).join()).toContain('lower unboundPageDescriptors')
  })
})

describe('objectKeys', () => {
  it('reads string and identifier keys from the named object literal only', () => {
    const src = "const OTHER = { no: 1 }\nconst COMPONENTS: Record<string, X> = { 'a-b': A, c: C, ...rest }"
    expect(objectKeys(src, 'COMPONENTS')).toEqual(['a-b', 'c'])
    expect(objectKeys(src, 'MISSING')).toBeNull()
  })
})
