import { describe, it, expect } from 'vitest'
import { resolveRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import { publicSpotlightGrid } from './public-grid'

const placed = (layout: EntityLayout | null) => resolveRows(layout, 'member').flatMap((r) => r.cells.flat())

describe('publicSpotlightGrid', () => {
  it('leads with About and places every authored block type, in first-seen order', () => {
    const grid = publicSpotlightGrid(null, [
      { type: 'heading' },
      { type: 'gallery' },
      { type: 'heading' },
      { type: 'quote' },
    ])
    expect(placed(grid)).toEqual(['about', 'heading', 'gallery', 'quote', 'links', 'memberEvents', 'tip', 'memberContributions', 'topfriends'])
  })

  it('keeps an authored Links block where the member put it', () => {
    const grid = publicSpotlightGrid(null, [{ type: 'links' }, { type: 'embed' }, { type: 'image' }])
    expect(placed(grid)).toEqual(['about', 'links', 'embed', 'image', 'memberEvents', 'tip', 'memberContributions', 'topfriends'])
  })

  it('with nothing authored still shows About, Links, Events, Tip, Contributions and Top Friends', () => {
    expect(placed(publicSpotlightGrid(null, []))).toEqual(['about', 'links', 'memberEvents', 'tip', 'memberContributions', 'topfriends'])
  })

  it('never overrides a saved grid', () => {
    const saved: EntityLayout = { rows: [{ id: 'r0', columns: 1, cells: [['links']] }] }
    expect(publicSpotlightGrid(saved, [{ type: 'heading' }])).toBe(saved)
  })

  it('never places the session-reading Guestbook on the ISR page', () => {
    expect(placed(publicSpotlightGrid(null, [{ type: 'text' }]))).not.toContain('guestbook')
  })
})
