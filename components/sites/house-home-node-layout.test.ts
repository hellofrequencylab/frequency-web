import { describe, expect, it } from 'vitest'
import { parseEntityLayout, resolveRows } from '@/lib/entity-blocks/layout'
import { legacyViewOf } from '@/lib/entity-blocks/node-ops'
import { planHouseSections } from '@/lib/sites/house-theme'

// The stored shape of Daniel Tyack's Home (nodes carry the placements and the bags; no content map).
const stored = {
  rows: [
    { id: 'r0', columns: 1, cells: [[{ nid: 'n1', type: 'editorial', content: { title: 'This might be *you*' } }]] },
    { id: 'r1', columns: 1, cells: [[{ nid: 'n2', type: 'offerings', content: { title: 'Sessions' } }, { nid: 'n3', type: 'booking' }]] },
    { id: 'r9', columns: 2, cells: [[{ nid: 'n4', type: 'contact' }], [{ nid: 'n5', type: 'business' }]] },
  ],
  bench: [{ nid: 'n6', type: 'about', content: { title: 'Hi' } }],
}

describe('legacyViewOf', () => {
  it('turns a node-native Home back into placed sections with their bags', () => {
    const grid = legacyViewOf(parseEntityLayout(stored) ?? {})
    expect(grid.nodes).toBeUndefined()
    expect(grid.content?.editorial?.title).toBe('This might be *you*')
    const plan = planHouseSections(resolveRows(grid, 'site'))
    expect(plan.map((s) => s.kind)).toEqual(['who', 'sessions', 'closing'])
  })

  it('leaves a layout that already places string ids alone', () => {
    const legacy = { rows: [{ id: 'r0', columns: 1 as const, cells: [['editorial']] }], content: { editorial: { title: 'x' } } }
    const parsed = parseEntityLayout(legacy) ?? {}
    expect(legacyViewOf(parsed)).toBe(parsed)
  })
})
