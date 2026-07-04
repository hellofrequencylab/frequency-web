import { describe, it, expect } from 'vitest'
import {
  addRow,
  removeRow,
  moveRow,
  setRowColumns,
  placeBlock,
  moveBlock,
  benchBlock,
  swapCells,
  hideBlock,
  unhideBlock,
  removeBlock,
  deriveBench,
  placedIds,
  normalize,
  genRowId,
  type BuilderLayout,
} from './rows-ops'
import { blocksForKind } from './registry'
import type { RowDef } from './layout'

const row = (id: string, columns: 1 | 2 | 3 | 4, slots: (string | null)[]): RowDef => ({ id, columns, slots })

// A small member layout: about (row 0), then stats|links (row 1, 2-up).
function base(): BuilderLayout {
  return {
    rows: [row('r0', 1, ['about']), row('r1', 2, ['stats', 'links'])],
    hidden: [],
  }
}

describe('genRowId', () => {
  it('produces a safe token that avoids collisions', () => {
    const id = genRowId(['r0', 'r1'])
    expect(id).toMatch(/^r[0-9a-z]+$/i)
    expect(['r0', 'r1']).not.toContain(id)
  })
})

describe('normalize (invariants)', () => {
  it('clamps slots to columns, drops unknown + duplicate ids, and fixes bad columns', () => {
    const out = normalize({
      rows: [
        row('r0', 2, ['about', 'about']), // dup -> second becomes null
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'r1', columns: 9 as any, slots: ['nope', 'stats'] }, // bad columns -> 1; unknown 'nope' dropped
      ],
      hidden: ['links', 'ghost'], // 'ghost' unknown -> dropped
    })
    expect(out.rows[0]).toEqual(row('r0', 2, ['about', null]))
    expect(out.rows[1].columns).toBe(1)
    expect(out.rows[1].slots).toEqual([null]) // 'nope' unknown, and only 1 slot
    expect(out.hidden).toEqual(['links'])
  })

  it('regenerates unsafe / duplicate row ids', () => {
    const out = normalize({ rows: [row('bad id', 1, ['about']), row('r0', 1, ['stats']), row('r0', 1, ['links'])], hidden: [] })
    const ids = out.rows.map((r) => r.id)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).toMatch(/^r[0-9a-z]+$/i)
  })

  it('caps the row count at 24', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row(`r${i}`, 1, [null]))
    expect(normalize({ rows, hidden: [] }).rows).toHaveLength(24)
  })
})

describe('addRow', () => {
  it('appends a fresh empty 1-column row by default', () => {
    const out = addRow(base())
    expect(out.rows).toHaveLength(3)
    expect(out.rows[2]).toMatchObject({ columns: 1, slots: [null] })
  })
  it('inserts at an index', () => {
    const out = addRow(base(), 0)
    expect(out.rows[0].slots).toEqual([null])
    expect(out.rows[1].slots).toEqual(['about'])
  })
  it('is a no-op at the 24-row cap', () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(`r${i}`, 1, [null]))
    const out = addRow({ rows, hidden: [] })
    expect(out.rows).toHaveLength(24)
  })
})

describe('removeRow', () => {
  it('removes a row and its blocks fall to the derived bench', () => {
    const out = removeRow(base(), 'r1')
    expect(out.rows).toHaveLength(1)
    expect(placedIds(out.rows).has('stats')).toBe(false)
    expect(deriveBench(out, 'member')).toContain('stats')
  })
  it('is a no-op for an unknown row id', () => {
    expect(removeRow(base(), 'nope').rows).toHaveLength(2)
  })
})

describe('moveRow', () => {
  it('reorders rows', () => {
    const out = moveRow(base(), 0, 1)
    expect(out.rows.map((r) => r.slots[0])).toEqual(['stats', 'about'])
  })
  it('clamps out-of-range destinations and no-ops equal indices', () => {
    expect(moveRow(base(), 0, 99).rows[1].slots[0]).toBe('about')
    expect(moveRow(base(), 0, 0).rows[0].slots[0]).toBe('about')
    expect(moveRow(base(), 5, 0).rows[0].slots[0]).toBe('about')
  })
})

describe('setRowColumns', () => {
  it('widens a row and pads with empty slots', () => {
    const out = setRowColumns(base(), 'r0', 3)
    expect(out.rows[0]).toEqual(row('r0', 3, ['about', null, null]))
  })
  it('narrows a row, pushing overflow blocks to the bench', () => {
    const out = setRowColumns(base(), 'r1', 1)
    expect(out.rows[1]).toEqual(row('r1', 1, ['stats']))
    expect(deriveBench(out, 'member')).toContain('links') // overflow benched
  })
  it('rejects an out-of-range column count', () => {
    expect(setRowColumns(base(), 'r0', 5)).toEqual(base())
    expect(setRowColumns(base(), 'r0', 0)).toEqual(base())
  })
})

describe('placeBlock / moveBlock', () => {
  it('places a benched block into an empty slot', () => {
    const start = setRowColumns(base(), 'r0', 2) // about | empty
    const out = placeBlock(start, 'topfriends', 'r0', 1)
    expect(out.rows[0].slots).toEqual(['about', 'topfriends'])
  })
  it('moving a placed block frees its old slot (no duplication)', () => {
    const out = moveBlock(base(), 'links', 'r0', 0) // r0 was ['about']; occupied -> about displaced
    expect(placedIds(out.rows).has('links')).toBe(true)
    // exactly one occurrence of links across all rows
    const count = out.rows.flatMap((r) => r.slots).filter((s) => s === 'links').length
    expect(count).toBe(1)
  })
  it('displaces the occupant to the bench when the target slot is full', () => {
    const out = placeBlock(base(), 'topfriends', 'r0', 0) // about was there
    expect(out.rows[0].slots).toEqual(['topfriends'])
    expect(deriveBench(out, 'member')).toContain('about')
  })
  it('unhides a block when it is placed', () => {
    const hiddenLayout = hideBlock(base(), 'stats')
    const out = placeBlock(hiddenLayout, 'stats', 'r0', 0)
    expect(out.hidden).not.toContain('stats')
  })
  it('is a no-op for unknown block / row / column', () => {
    expect(placeBlock(base(), 'ghost', 'r0', 0)).toEqual(base())
    expect(placeBlock(base(), 'about', 'nope', 0)).toEqual(base())
    expect(placeBlock(base(), 'about', 'r0', 4)).toEqual(base())
  })
})

describe('benchBlock', () => {
  it('frees the slot and derives to the bench', () => {
    const out = benchBlock(base(), 'stats')
    expect(placedIds(out.rows).has('stats')).toBe(false)
    expect(deriveBench(out, 'member')).toContain('stats')
  })
})

describe('swapCells', () => {
  it('swaps two occupied cells within a row', () => {
    const out = swapCells(base(), 'r1', 0, 'r1', 1)
    expect(out.rows[1].slots).toEqual(['links', 'stats'])
  })
  it('swapping with an empty neighbour is a plain move', () => {
    const wide = setRowColumns(base(), 'r0', 2) // ['about', null]
    const out = swapCells(wide, 'r0', 0, 'r0', 1)
    expect(out.rows[0].slots).toEqual([null, 'about'])
  })
  it('swaps across rows', () => {
    const out = swapCells(base(), 'r0', 0, 'r1', 0) // about <-> stats
    expect(out.rows[0].slots[0]).toBe('stats')
    expect(out.rows[1].slots[0]).toBe('about')
  })
  it('is a no-op for a bad address', () => {
    expect(swapCells(base(), 'r0', 0, 'nope', 0)).toEqual(base())
    expect(swapCells(base(), 'r0', 9, 'r1', 0)).toEqual(base())
  })
})

describe('hide / unhide', () => {
  it('hides a block in place (still occupies its slot, off the render)', () => {
    const out = hideBlock(base(), 'stats')
    expect(out.hidden).toContain('stats')
    expect(placedIds(out.rows).has('stats')).toBe(true)
    expect(deriveBench(out, 'member')).not.toContain('stats') // hidden ≠ benched
  })
  it('does not double-add and unhides cleanly', () => {
    const once = hideBlock(base(), 'stats')
    expect(hideBlock(once, 'stats')).toEqual(once)
    expect(unhideBlock(once, 'stats').hidden).not.toContain('stats')
  })
})

describe('removeBlock (delete)', () => {
  it('clears both the slot and any hidden flag', () => {
    const out = removeBlock(hideBlock(base(), 'stats'), 'stats')
    expect(placedIds(out.rows).has('stats')).toBe(false)
    expect(out.hidden).not.toContain('stats')
    expect(deriveBench(out, 'member')).toContain('stats')
  })
})

describe('deriveBench', () => {
  it('is palette minus placed minus hidden', () => {
    const palette = blocksForKind('member').map((b) => b.id)
    const layout = hideBlock(base(), 'topfriends')
    const bench = deriveBench(layout, 'member')
    expect(bench).not.toContain('about') // placed
    expect(bench).not.toContain('stats') // placed
    expect(bench).not.toContain('topfriends') // hidden
    // everything else in the member palette is benched
    for (const id of palette) {
      if (!['about', 'stats', 'links', 'topfriends'].includes(id)) expect(bench).toContain(id)
    }
  })
})
