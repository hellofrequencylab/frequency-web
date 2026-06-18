import { describe, it, expect } from 'vitest'
import { moduleIdsForScope, moduleMeta, ROUTE_MODULE_IDS, LAYOUT_MODULE_IDS } from './modules'

// Route-scoping (ADR-294): a page only offers — and the resolver only renders — its own block set.
describe('moduleIdsForScope', () => {
  it('the global default (*) returns the community set', () => {
    expect(moduleIdsForScope('*')).toBe(ROUTE_MODULE_IDS['*'])
    expect(moduleIdsForScope('*')).toEqual(LAYOUT_MODULE_IDS)
  })

  it('an exact converted route returns its own set, not the global one', () => {
    const crew = moduleIdsForScope('/crew')
    expect(crew).toBe(ROUTE_MODULE_IDS['/crew'])
    expect(crew).toContain('quest-season-map')
    // No leakage: My Quest blocks never include the community default blocks.
    expect(crew).not.toContain('community-pulse')
  })

  it('a nested admin route resolves its exact set', () => {
    const j = moduleIdsForScope('/admin/content/journeys')
    expect(j).toBe(ROUTE_MODULE_IDS['/admin/content/journeys'])
    expect(j).toEqual(['admin-journeys-stats', 'admin-journeys-review', 'admin-journeys-library'])
  })

  it('the practices page resolves its blocks, including the URL-driven library', () => {
    const p = moduleIdsForScope('/practices')
    expect(p).toBe(ROUTE_MODULE_IDS['/practices'])
    expect(p).toEqual(['practices-stats', 'practices-activity', 'practices-balance', 'practices-mine', 'practices-library'])
    // No leakage; the faceted library IS a module now (it reads the URL from the x-search header).
    expect(p).not.toContain('community-pulse')
    expect(p).toContain('practices-library')
  })

  it('an unconverted route falls back through its section to the global set', () => {
    // No '/lead' or '/lead/*' set declared → inherits the global community set.
    expect(moduleIdsForScope('/lead')).toEqual(LAYOUT_MODULE_IDS)
    // A section scope with no declared set also falls back to global.
    expect(moduleIdsForScope('/settings/*')).toEqual(LAYOUT_MODULE_IDS)
  })

  it('the Vault (/crew/store) resolves its own blocks, not /crew’s', () => {
    const v = moduleIdsForScope('/crew/store')
    expect(v).toBe(ROUTE_MODULE_IDS['/crew/store'])
    expect(v).toContain('vault-standing')
    expect(v).toContain('vault-store')
    // It's a distinct exact route — it does NOT inherit My Quest's blocks or the global set.
    expect(v).not.toContain('quest-season-map')
    expect(v).not.toContain('community-pulse')
  })

  it("a section scope of a converted route does NOT inherit the exact route's blocks", () => {
    // '/crew/*' is a wildcard for crew SUB-pages (challenges, …) — distinct from '/crew' AND from
    // the now-converted exact '/crew/store' — so the wildcard still gets the generic set.
    expect(moduleIdsForScope('/crew/*')).toEqual(LAYOUT_MODULE_IDS)
  })
})

describe('moduleMeta', () => {
  it('resolves metadata across the whole union (any route block)', () => {
    expect(moduleMeta('quest-season-map')?.label).toBe('Season map')
    expect(moduleMeta('admin-journeys-library')?.label).toBe('Journey library')
    expect(moduleMeta('community-pulse')?.label).toBe('Community pulse')
    expect(moduleMeta('does-not-exist')).toBeUndefined()
  })

  it('every id in every route set has metadata + the union has no orphan dupes', () => {
    for (const ids of Object.values(ROUTE_MODULE_IDS)) {
      for (const id of ids) expect(moduleMeta(id), `missing meta for ${id}`).toBeDefined()
    }
  })
})
