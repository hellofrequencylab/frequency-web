import { describe, expect, it } from 'vitest'
import { ENTITY_BLOCKS, blockRendersOnSite, blockSupportsKind, blocksForKind } from './registry'
import { maxColumnsForKind, resolveRows, siteSurfaceRows, starterRows, type EntityLayout } from './layout'

// E3 (LIVE-1171): Site is a fourth kind. It is the web renderer on a Space's public page, so its legality is the
// Space's, its ceiling is stated on its own, and a fresh Site starts from the Space starters.
describe('the site kind', () => {
  it('holds exactly the blocks a Space holds', () => {
    const space = ENTITY_BLOCKS.filter((b) => blockSupportsKind(b, 'space')).map((b) => b.id)
    const site = ENTITY_BLOCKS.filter((b) => blockSupportsKind(b, 'site')).map((b) => b.id)
    expect(site).toEqual(space)
    expect(site.length).toBeGreaterThan(0)
  })

  it('does not change what member or email may hold', () => {
    for (const kind of ['member', 'email'] as const) {
      const declared = ENTITY_BLOCKS.filter((b) => b.kinds.includes(kind)).map((b) => b.id)
      expect(blocksForKind(kind).map((b) => b.id).sort()).toEqual(declared.sort())
    }
  })

  it('stops at two columns', () => {
    expect(maxColumnsForKind('site')).toBe(2)
  })

  it('starts a fresh Site from the Space starter, with the blocks still legal', () => {
    const rows = resolveRows(null, 'site')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows).toEqual(resolveRows(null, 'space'))
    expect(starterRows('site', 'basic')).toEqual(starterRows('space', 'basic'))
  })
})

// The house Home resolves its rows as kind `site` (LIVE-1173). That is only a safe swap while a Site and a Space
// resolve the same rows from the same saved layout, so pin it over layouts that exercise every rule resolveRows
// applies: the column clamp, the hidden list, a retired id and the per-type cap.
describe('a saved layout resolves the same rows for site as for space', () => {
  const layouts: EntityLayout[] = [
    { rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']] }] },
    { rows: [{ id: 'r0', columns: 3, cells: [['about'], ['events'], ['reviews']] }] },
    { rows: [{ id: 'r0', columns: 1, cells: [['about', 'not-a-block', 'events']] }], hidden: ['events'] },
    { template: 'single', slots: { main: ['about', 'events'] } },
    { order: ['events', 'about'] },
    {},
  ]
  it.each(layouts.map((l, i) => [i, l] as const))('layout %i', (_i, layout) => {
    expect(resolveRows(layout, 'site')).toEqual(resolveRows(layout, 'space'))
  })
})

// The Site surface filter (LIVE-2232): legality stays the Space's, and the registry says which of those blocks draw on
// the published website. Only the Spotlight-only blocks stay off it; everything else passes untouched.
describe('the site surface filter', () => {
  it('keeps only the Spotlight-only blocks off the Site', () => {
    const off = ENTITY_BLOCKS.filter((b) => blockSupportsKind(b, 'site') && !blockRendersOnSite(b)).map((b) => b.id)
    expect(off.sort()).toEqual(['donate', 'linkCards'])
  })

  it('never draws a block the Site may not hold', () => {
    for (const b of ENTITY_BLOCKS) if (!blockSupportsKind(b, 'site')) expect(blockRendersOnSite(b)).toBe(false)
  })

  it('drops a Spotlight-only id from its cell and keeps the row shape', () => {
    const rows = resolveRows({ rows: [{ id: 'r0', columns: 2, cells: [['about', 'linkCards'], ['donate']] }] }, 'site')
    expect(siteSurfaceRows(rows)).toEqual([{ id: 'r0', columns: 2, cells: [['about'], []] }])
    expect(rows[0].cells).toEqual([['about', 'linkCards'], ['donate']])
  })

  it('changes nothing on the starters or a layout with no Spotlight-only block', () => {
    const layouts: (EntityLayout | null)[] = [null, { rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']] }] }, { order: ['events', 'about'] }]
    for (const l of layouts) {
      const rows = resolveRows(l, 'site')
      expect(siteSurfaceRows(rows)).toEqual(rows)
    }
  })
})
