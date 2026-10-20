import { describe, expect, it } from 'vitest'
import { ENTITY_BLOCKS, blockSupportsKind, blocksForKind } from './registry'
import { maxColumnsForKind, resolveRows, starterRows } from './layout'

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
