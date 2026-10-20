import { describe, it, expect } from 'vitest'
import { entityBlockById, blockSupportsKind } from '@/lib/entity-blocks/registry'
import { resolveRows } from '@/lib/entity-blocks/layout'
import {
  SPACE_SPOTLIGHT_BLOCK_IDS,
  readSpaceSpotlight,
  spaceSpotlightGrid,
  nextSpotlightPreferences,
  isSellingLinkCard,
  spotlightSiteGrid,
  spaceSpotlightNodes,
  legacySpotlightWriteError,
} from './spotlight'

const placed = (prefs: unknown) =>
  resolveRows(spaceSpotlightGrid(readSpaceSpotlight(prefs)), 'space').flatMap((r) => r.cells.flat())

describe('Space Spotlight', () => {
  it('offers only registry blocks the Space renderer can draw', () => {
    for (const id of SPACE_SPOTLIGHT_BLOCK_IDS) {
      const block = entityBlockById(id)
      expect(block, id).not.toBeNull()
      expect(blockSupportsKind(block!, 'space'), id).toBe(true)
    }
  })

  it('is unpublished with the starter when nothing is saved, or the node is malformed', () => {
    for (const prefs of [null, undefined, {}, { spotlight: 'x' }, { spotlight: [] }, { spotlight: { published: 'true' } }]) {
      expect(readSpaceSpotlight(prefs).published).toBe(false)
      expect(placed(prefs)).toEqual(['about', 'linkCards', 'links'])
    }
  })

  it('publishes only on a literal true', () => {
    expect(readSpaceSpotlight({ spotlight: { published: true } }).published).toBe(true)
  })

  it('stacks a saved layout into one column and drops blocks a Spotlight does not hold', () => {
    const prefs = {
      spotlight: {
        published: true,
        layout: {
          rows: [
            { id: 'r0', columns: 2, cells: [['booking'], ['links']] },
            { id: 'r1', columns: 1, cells: [['team']] },
            { id: 'r2', columns: 1, cells: [['heading']] },
          ],
          content: { heading: { text: 'Find me here' }, team: { title: 'x' } },
        },
      },
    }
    const s = readSpaceSpotlight(prefs)
    expect(placed(prefs)).toEqual(['booking', 'links', 'heading'])
    expect(s.layout?.rows?.every((r) => r.columns === 1)).toBe(true)
    expect(Object.keys(s.layout?.content ?? {})).toEqual(['heading'])
  })

  it('writes only the spotlight node and keeps the Space page layout untouched', () => {
    const current = { profileLayout: { rows: [{ id: 'r0', columns: 1, cells: [['team']] }] }, accent: 'x' }
    const next = nextSpotlightPreferences(current, {
      published: true,
      layout: { rows: [{ id: 'r0', columns: 1, cells: [['links']] }, { id: 'r1', columns: 1, cells: [['team']] }] },
    })
    expect(next.profileLayout).toEqual(current.profileLayout)
    expect(next.accent).toBe('x')
    expect(placed(next)).toEqual(['links'])
    expect(readSpaceSpotlight(next).published).toBe(true)
  })

  it('keeps the saved layout on a publish-only change and clears it on null', () => {
    const saved = nextSpotlightPreferences({}, { layout: { rows: [{ id: 'r0', columns: 1, cells: [['links']] }] } })
    const published = nextSpotlightPreferences(saved, { published: true })
    expect(placed(published)).toEqual(['links'])
    const cleared = nextSpotlightPreferences(published, { layout: null })
    expect(readSpaceSpotlight(cleared).layout).toBeNull()
    expect(readSpaceSpotlight(cleared).published).toBe(true)
  })

  it('locks only the cards that sell or sign someone up', () => {
    for (const id of ['product:p1', 'journey:j1', 'event:e1', 'membership:m1']) expect(isSellingLinkCard(id), id).toBe(true)
    for (const id of ['book', 'contact', 'links', 'producty:x']) expect(isSellingLinkCard(id), id).toBe(false)
  })

  it('shows only stand-alone blocks on a website host', () => {
    const grid = spaceSpotlightGrid(
      readSpaceSpotlight({
        spotlight: {
          published: true,
          layout: { rows: ['about', 'events', 'linkCards', 'booking', 'links'].map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] })) },
        },
      }),
    )
    expect((spotlightSiteGrid(grid).rows ?? []).map((r) => r.cells[0][0])).toEqual(['about', 'linkCards', 'links'])
  })
})

describe('Space Spotlight as nodes (E0 task 12b)', () => {
  const nodeDoc = {
    rows: [
      { id: 'r0', columns: 2, cells: [[{ nid: 'nAAAAAA1', type: 'text', content: { text: 'One' } }], [{ nid: 'nAAAAAA2', type: 'text', content: { text: 'Two' } }]] },
      { id: 'r1', columns: 1, cells: [[{ nid: 'nAAAAAA3', type: 'team' }]] },
      { id: 'r2', columns: 1, cells: [[{ nid: 'nAAAAAA4', type: 'links' }]] },
    ],
    bench: [{ nid: 'nAAAAAA5', type: 'heading', content: { text: 'Later' } }, { nid: 'nAAAAAA6', type: 'team' }],
  }

  it('a native write keeps two Text nodes as two blocks, one per row, and drops non-Spotlight blocks', () => {
    const next = nextSpotlightPreferences({}, { published: true, layout: nodeDoc, native: true })
    const nodes = readSpaceSpotlight(next).layout?.nodes
    expect(nodes?.rows.map((r) => r.cells[0][0].nid)).toEqual(['nAAAAAA1', 'nAAAAAA2', 'nAAAAAA4'])
    expect(nodes?.rows.every((r) => r.columns === 1)).toBe(true)
    expect(nodes?.rows[1].cells[0][0].content).toEqual({ text: 'Two' })
    expect(nodes?.bench.map((n) => n.type)).toEqual(['heading'])
  })

  it('a publish toggle keeps the stored native document byte for byte', () => {
    const native = nextSpotlightPreferences({}, { layout: nodeDoc, native: true })
    const toggled = nextSpotlightPreferences(native, { published: true })
    expect((toggled.spotlight as { layout: unknown }).layout).toEqual((native.spotlight as { layout: unknown }).layout)
    expect(readSpaceSpotlight(toggled).published).toBe(true)
  })

  it('a legacy write never stores nodes, and is refused over a stored native Spotlight', () => {
    const legacy = nextSpotlightPreferences({}, { layout: { rows: [{ id: 'r0', columns: 1, cells: [['links']] }] } })
    expect(JSON.stringify(legacy)).not.toContain('"nodes"')
    const native = nextSpotlightPreferences({}, { layout: nodeDoc, native: true })
    expect(legacySpotlightWriteError({ rows: [{ id: 'r0', columns: 1, cells: [['links']] }] }, native)).toMatch(/cannot save yet/)
    expect(legacySpotlightWriteError(nodeDoc, {})).toMatch(/cannot save yet/)
    expect(legacySpotlightWriteError({ rows: [{ id: 'r0', columns: 1, cells: [['links']] }] }, legacy)).toBeNull()
  })

  it('spaceSpotlightNodes is the saved nodes, else the starter as nodes', () => {
    expect(spaceSpotlightNodes(readSpaceSpotlight({})).rows.map((r) => r.cells[0][0].type)).toEqual(['about', 'linkCards', 'links'])
    const saved = readSpaceSpotlight(nextSpotlightPreferences({}, { layout: nodeDoc, native: true }))
    expect(spaceSpotlightNodes(saved).rows).toHaveLength(3)
  })
})
