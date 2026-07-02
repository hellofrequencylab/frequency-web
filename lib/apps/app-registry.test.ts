import { describe, it, expect } from 'vitest'
import { APPS } from './catalog'
import {
  appsAsLibraryItems,
  appCategoryFacets,
  appSurfaceFacets,
  isPreviewableApp,
  describeGate,
} from './app-registry'

// LP5b (docs/LOOM-PLATFORM.md §4): the App catalog presented as Loom-browsable rows, mirroring the
// element registry. The code stays the source of truth, so the row set tracks APPS exactly.

describe('appsAsLibraryItems', () => {
  const items = appsAsLibraryItems()

  it('maps every App to exactly one browse row (no drift)', () => {
    expect(items).toHaveLength(APPS.length)
    expect(new Set(items.map((i) => i.id)).size).toBe(APPS.length)
  })

  it('mirrors label, category, and surfaces from the source App', () => {
    for (const item of items) {
      const app = APPS.find((a) => a.id === item.id)!
      expect(item.title).toBe(app.label)
      expect(item.category).toBe(app.category)
      expect(item.kind).toBe('app')
      // Surfaces are exactly the App's populated surface keys.
      const declared = (['editor', 'page', 'rail', 'element'] as const).filter((k) => app.surfaces[k] != null)
      expect(item.surfaces).toEqual(declared)
    }
  })

  it('element Apps are previewable; editor/page Apps are not', () => {
    expect(isPreviewableApp(APPS.find((a) => a.id === 'element:icon/lotus')!)).toBe(true)
    expect(isPreviewableApp(APPS.find((a) => a.id === 'circle.settings')!)).toBe(false)
    expect(isPreviewableApp(APPS.find((a) => a.id === 'community-pulse')!)).toBe(false)
  })
})

describe('facets', () => {
  const items = appsAsLibraryItems()

  it('category + surface facet counts sum consistently with the rows', () => {
    const catTotal = appCategoryFacets(items).reduce((n, f) => n + f.count, 0)
    expect(catTotal).toBe(items.length)
    // Every facet is non-empty and in spine order (elements last).
    const cats = appCategoryFacets(items)
    expect(cats.every((f) => f.count > 0)).toBe(true)
    expect(cats.at(-1)?.category).toBe('element')

    for (const f of appSurfaceFacets(items)) {
      expect(f.count).toBe(items.filter((i) => i.surfaces.includes(f.surface)).length)
    }
  })
})

describe('describeGate', () => {
  it('renders a plain line per gate system (no em dashes)', () => {
    expect(describeGate({ system: 'none' })).toBe('Always on')
    expect(describeGate({ system: 'capability', capability: 'circle.manage' as never })).toContain('Capability:')
    expect(describeGate({ system: 'staff' })).toBe('Staff')
    expect(describeGate({ system: 'staff', domain: 'marketing' })).toBe('Staff: marketing')
    expect(describeGate({ system: 'spaceFunction', fn: 'library' as never })).toContain('Space function:')
    expect(describeGate({ system: 'none' })).not.toContain('—')
  })
})
