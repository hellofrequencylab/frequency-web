import { describe, it, expect } from 'vitest'
import {
  addRow,
  removeRow,
  moveRow,
  setRowColumns,
  setRowRatio,
  setBlockContent,
  setBlockStyle,
  placeBlock,
  moveBlock,
  benchBlock,
  nudgeBox,
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

// Build a row from a per-column list of ids (a null column is empty). Each column becomes a single-box
// stack — the ADR-542 cells shape. Multi-box stacks are built explicitly in the tests that need them.
const row = (id: string, columns: 1 | 2 | 3 | 4, slots: (string | null)[]): RowDef => ({
  id,
  columns,
  cells: slots.map((s) => (s ? [s] : [])),
})

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
  it('dedupes a block across the layout, drops unknown ids, and fixes bad columns', () => {
    const out = normalize({
      rows: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'r0', columns: 2, cells: [['about'], ['about']] } as any, // dup -> second dropped
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { id: 'r1', columns: 9 as any, cells: [['nope', 'stats']] }, // bad columns -> 1; unknown 'nope' dropped
      ],
      hidden: ['links', 'ghost'], // 'ghost' unknown -> dropped
    })
    expect(out.rows[0]).toEqual(row('r0', 2, ['about', null]))
    expect(out.rows[1].columns).toBe(1)
    expect(out.rows[1].cells).toEqual([['stats']]) // 'nope' unknown, dropped; 'stats' kept
    expect(out.hidden).toEqual(['links'])
  })

  it('caps a column stack at 12 boxes', () => {
    const ids = blocksForKind('space').map((b) => b.id).slice(0, 14)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = normalize({ rows: [{ id: 'r0', columns: 1, cells: [ids] } as any], hidden: [] })
    expect(out.rows[0].cells[0].length).toBe(12)
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
    expect(out.rows[2]).toMatchObject({ columns: 1, cells: [[]] })
  })
  it('inserts at an index', () => {
    const out = addRow(base(), 0)
    expect(out.rows[0].cells).toEqual([[]])
    expect(out.rows[1].cells).toEqual([['about']])
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
    expect(out.rows.map((r) => r.cells[0][0])).toEqual(['stats', 'about'])
  })
  it('clamps out-of-range destinations and no-ops equal indices', () => {
    expect(moveRow(base(), 0, 99).rows[1].cells[0][0]).toBe('about')
    expect(moveRow(base(), 0, 0).rows[0].cells[0][0]).toBe('about')
    expect(moveRow(base(), 5, 0).rows[0].cells[0][0]).toBe('about')
  })
})

describe('setRowColumns', () => {
  it('widens a row and pads with empty columns', () => {
    const out = setRowColumns(base(), 'r0', 3)
    expect(out.rows[0]).toEqual(row('r0', 3, ['about', null, null]))
  })
  it('narrows a row, merging overflow columns into the last kept column (nothing lost)', () => {
    const out = setRowColumns(base(), 'r1', 1)
    expect(out.rows[1]).toEqual({ id: 'r1', columns: 1, cells: [['stats', 'links']] })
    expect(deriveBench(out, 'member')).not.toContain('links') // still placed, not benched
  })
  it('rejects an out-of-range column count', () => {
    expect(setRowColumns(base(), 'r0', 5)).toEqual(base())
    expect(setRowColumns(base(), 'r0', 0)).toEqual(base())
  })
  it('drops a lead ratio when a 2-column row narrows to 1', () => {
    const wide = setRowRatio(base(), 'r1', 'lead') // r1 is 2-col
    expect(wide.rows[1].ratio).toBe('lead')
    const narrow = setRowColumns(wide, 'r1', 1)
    expect(narrow.rows[1].ratio).toBeUndefined()
  })
})

describe('setBlockContent / setBlockStyle (ADR-528)', () => {
  it('sets and clears a block content bag', () => {
    const withContent = setBlockContent(base(), 'about', { title: 'Us' })
    expect(withContent.content).toEqual({ about: { title: 'Us' } })
    const cleared = setBlockContent(withContent, 'about', undefined)
    expect(cleared.content).toBeUndefined()
  })
  it('sets and clears a block style bag', () => {
    const withStyle = setBlockStyle(base(), 'about', { background: true })
    expect(withStyle.style).toEqual({ about: { background: true } })
    const cleared = setBlockStyle(withStyle, 'about', {})
    expect(cleared.style).toBeUndefined()
  })
  it('ignores an unknown block id', () => {
    expect(setBlockContent(base(), 'nope', { title: 'x' })).toEqual(base())
  })
})

describe('setRowRatio', () => {
  it('sets a lead (66/33) ratio on a 2-column row', () => {
    const out = setRowRatio(base(), 'r1', 'lead')
    expect(out.rows[1].ratio).toBe('lead')
  })
  it('sets a trail (33/66) ratio on a 2-column row', () => {
    const out = setRowRatio(base(), 'r1', 'trail')
    expect(out.rows[1].ratio).toBe('trail')
  })
  it('is a no-op on a 1-column row (ratio has no meaning)', () => {
    const out = setRowRatio(base(), 'r0', 'lead')
    expect(out.rows[0].ratio).toBeUndefined()
  })
  it('even clears back to the sparse default (undefined)', () => {
    const lead = setRowRatio(base(), 'r1', 'lead')
    const even = setRowRatio(lead, 'r1', 'even')
    expect(even.rows[1].ratio).toBeUndefined()
  })
})

describe('placeBlock / moveBlock', () => {
  it('places a benched block into an empty column', () => {
    const start = setRowColumns(base(), 'r0', 2) // [['about'], []]
    const out = placeBlock(start, 'topfriends', 'r0', 1)
    expect(out.rows[0].cells).toEqual([['about'], ['topfriends']])
  })
  it('appends into an occupied column, stacking (no displacement) — ADR-542', () => {
    const out = placeBlock(base(), 'topfriends', 'r0', 0) // r0 col0 was ['about']
    expect(out.rows[0].cells).toEqual([['about', 'topfriends']])
    expect(deriveBench(out, 'member')).not.toContain('about') // about stays placed
  })
  it('inserts at a given stack index', () => {
    const stacked = placeBlock(base(), 'topfriends', 'r0', 0) // ['about','topfriends']
    const out = placeBlock(stacked, 'faq', 'r0', 0, 1) // insert faq at index 1
    expect(out.rows[0].cells[0]).toEqual(['about', 'faq', 'topfriends'])
  })
  it('moving a placed block frees its old column (no duplication)', () => {
    const out = moveBlock(base(), 'links', 'r0', 0) // links moves from r1 into r0 col0
    const count = out.rows.flatMap((r) => r.cells.flat()).filter((s) => s === 'links').length
    expect(count).toBe(1)
    expect(out.rows[0].cells[0]).toContain('links')
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

describe('2-column escape + column round-trip (ADR-542 stuck-block regression)', () => {
  // The reported bug: a block dragged into a 2-column row is stuck at half width. A space layout with a
  // 2-col row [about | offerings] above an empty 1-col row.
  function twoCol(): BuilderLayout {
    return { rows: [row('r0', 2, ['about', 'offerings']), row('r1', 1, [null])], hidden: [] }
  }
  it('moves a block OUT of a 2-column row into a 1-column row at full width', () => {
    const out = placeBlock(twoCol(), 'about', 'r1', 0)
    // about now sits alone in the 1-column row → full width; its old 2-col column is freed, nothing lost.
    expect(out.rows[1]).toEqual({ id: 'r1', columns: 1, cells: [['about']] })
    expect(out.rows[0].cells).toEqual([[], ['offerings']])
    expect(placedIds(out.rows)).toEqual(new Set(['about', 'offerings']))
  })
  it('narrows a 2-col row to 1 col at full width, merging both blocks (nothing lost)', () => {
    const narrowed = setRowColumns(twoCol(), 'r0', 1)
    expect(narrowed.rows[0]).toEqual({ id: 'r0', columns: 1, cells: [['about', 'offerings']] })
  })
  it('narrow then widen round-trips losslessly (no block dropped or stuck)', () => {
    const narrowed = setRowColumns(twoCol(), 'r0', 1)
    const widened = setRowColumns(narrowed, 'r0', 2)
    expect(widened.rows[0].columns).toBe(2)
    expect(placedIds(widened.rows)).toEqual(new Set(['about', 'offerings']))
  })
})

describe('benchBlock', () => {
  it('frees the slot and derives to the bench', () => {
    const out = benchBlock(base(), 'stats')
    expect(placedIds(out.rows).has('stats')).toBe(false)
    expect(deriveBench(out, 'member')).toContain('stats')
  })
})

describe('nudgeBox (reorder within a column stack)', () => {
  // A layout with a 3-deep column stack: r0 col0 = [about, contact, faq].
  function stacked(): BuilderLayout {
    const a = placeBlock(base(), 'contact', 'r0', 0) // [about, contact]
    return placeBlock(a, 'faq', 'r0', 0) // [about, contact, faq]
  }
  it('moves a box up within its column', () => {
    const out = nudgeBox(stacked(), 'contact', -1)
    expect(out.rows[0].cells[0]).toEqual(['contact', 'about', 'faq'])
  })
  it('moves a box down within its column', () => {
    const out = nudgeBox(stacked(), 'contact', 1)
    expect(out.rows[0].cells[0]).toEqual(['about', 'faq', 'contact'])
  })
  it('is a no-op at the ends of the stack', () => {
    expect(nudgeBox(stacked(), 'about', -1)).toEqual(stacked())
    expect(nudgeBox(stacked(), 'faq', 1)).toEqual(stacked())
  })
  it('is a no-op for an unplaced id', () => {
    expect(nudgeBox(base(), 'ghost', 1)).toEqual(base())
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
