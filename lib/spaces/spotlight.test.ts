import { describe, it, expect } from 'vitest'
import { entityBlockById, blockSupportsKind } from '@/lib/entity-blocks/registry'
import { resolveRows } from '@/lib/entity-blocks/layout'
import {
  SPACE_SPOTLIGHT_BLOCK_IDS,
  readSpaceSpotlight,
  spaceSpotlightGrid,
  nextSpotlightPreferences,
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
})
