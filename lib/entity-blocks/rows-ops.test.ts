import { describe, it, expect } from 'vitest'
import {
  addRow,
  removeRow,
  moveRow,
  setRowColumns,
  setRowRatio,
  setRowTitle,
  setRowHeaderOn,
  setRowMargin,
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

  // ADR-542 item 8 (the "only the title saved" bug): the store's applyContent folds each field edit over
  // the FRESHEST layout (a ref), so a burst of edits accumulates every field instead of the last write
  // clobbering the earlier ones. This models that: each write reads the RESULT of the previous (as the
  // ref does), and every field survives.
  it('accumulates a burst of field edits when each merges over the latest layout (stale-closure fix)', () => {
    let layout = base()
    const fields: Array<[string, unknown]> = [
      ['title', 'Join us'],
      ['body', 'Come along'],
      ['buttonLabel', 'Book'],
      ['buttonUrl', 'https://x.com/book'],
      ['image', 'https://x.com/a.jpg'],
    ]
    // Simulate the panel firing one field at a time, each folding the single key over the LATEST bag.
    for (const [key, value] of fields) {
      const merged = { ...(layout.content?.callout ?? {}), [key]: value }
      layout = setBlockContent(layout, 'callout', merged)
    }
    expect(layout.content?.callout).toEqual({
      title: 'Join us',
      body: 'Come along',
      buttonLabel: 'Book',
      buttonUrl: 'https://x.com/book',
      image: 'https://x.com/a.jpg',
    })
  })

  // The bug it replaces: folding each field over a STALE snapshot (captured once) keeps only the LAST
  // field written — proof the "merge against the freshest state" contract is what saves the other fields.
  it('a stale captured snapshot drops every field but the last (the bug being fixed)', () => {
    const snapshot = base() // captured once, never updated (the render-time closure)
    let layout = base()
    for (const [key, value] of [
      ['title', 'Join us'],
      ['body', 'Come along'],
      ['buttonLabel', 'Book'],
    ] as Array<[string, unknown]>) {
      // Each write merges over the STALE snapshot's (empty) callout bag → only this one key.
      layout = setBlockContent(layout, 'callout', { ...(snapshot.content?.callout ?? {}), [key]: value })
    }
    expect(layout.content?.callout).toEqual({ buttonLabel: 'Book' })
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

describe('setRowMargin (ADR-569 C3)', () => {
  it('sets and clears a top / bottom row margin, keeping the shape sparse', () => {
    const withTop = setRowMargin(base(), 'r0', 'mt', 'lg')
    expect(withTop.rows[0].mt).toBe('lg')
    expect(withTop.rows[0].mb).toBeUndefined()
    const withBottom = setRowMargin(withTop, 'r0', 'mb', 'sm')
    expect(withBottom.rows[0].mb).toBe('sm')
    // A neutral `none` clears the step back to the sparse default.
    const cleared = setRowMargin(withBottom, 'r0', 'mt', 'none')
    expect(cleared.rows[0].mt).toBeUndefined()
    expect(cleared.rows[0].mb).toBe('sm')
  })
  it('is a no-op for an unknown row id', () => {
    const out = setRowMargin(base(), 'nope', 'mt', 'lg')
    expect(out.rows.every((r) => r.mt === undefined)).toBe(true)
  })
  it('carries a set margin through a subsequent normalize (a reorder)', () => {
    const withMargin = setRowMargin(base(), 'r1', 'mb', 'xl')
    const reordered = moveRow(withMargin, 1, 0)
    expect(reordered.rows[0].mb).toBe('xl')
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

// ── Fix: a MOVE / reorder must never drop a block's authored content or style (silent data loss). ──
describe('content survives a move (regression)', () => {
  // A space-ish layout with an authored bag on `photoHero`, placed in row 0.
  function withContent(): BuilderLayout {
    return {
      rows: [row('r0', 1, ['photoHero']), row('r1', 1, ['about'])],
      hidden: [],
      content: { photoHero: { title: 'Kept headline', subtitle: 'Kept subtitle' } },
      style: { photoHero: { align: 'center' } },
    }
  }

  it('placeBlock (move to another row) keeps the moved block content + style intact', () => {
    const before = withContent()
    // Move photoHero into row r1 (the reorder the bug report reproduced).
    const after = placeBlock(before, 'photoHero', 'r1', 0)
    expect(after.content?.photoHero).toEqual({ title: 'Kept headline', subtitle: 'Kept subtitle' })
    expect(after.style?.photoHero).toEqual({ align: 'center' })
    // And it actually moved.
    expect(after.rows.find((r) => r.id === 'r1')?.cells[0]).toContain('photoHero')
  })

  it('moveBlock keeps content, and every OTHER block content is preserved too', () => {
    const before: BuilderLayout = {
      ...withContent(),
      content: {
        photoHero: { title: 'Kept headline' },
        about: { title: 'About kept' },
      },
    }
    const after = moveBlock(before, 'photoHero', 'r1', 0)
    expect(after.content?.photoHero).toEqual({ title: 'Kept headline' })
    expect(after.content?.about).toEqual({ title: 'About kept' })
  })

  it('nudgeBox within a column keeps content', () => {
    const before: BuilderLayout = {
      rows: [{ id: 'r0', columns: 1, cells: [['photoHero', 'about']] }],
      hidden: [],
      content: { photoHero: { title: 'Kept' } },
    }
    const after = nudgeBox(before, 'about', -1)
    expect(after.content?.photoHero).toEqual({ title: 'Kept' })
  })

  it('benching a block keeps its content (config kept for re-placement)', () => {
    const after = benchBlock(withContent(), 'photoHero')
    expect(after.content?.photoHero).toEqual({ title: 'Kept headline', subtitle: 'Kept subtitle' })
  })

  it('removeBlock (permanent delete) drops the deleted block bag but keeps every other', () => {
    const before: BuilderLayout = {
      ...withContent(),
      content: { photoHero: { title: 'Gone' }, about: { title: 'Stays' } },
    }
    const after = removeBlock(before, 'photoHero')
    expect(after.content?.photoHero).toBeUndefined()
    expect(after.content?.about).toEqual({ title: 'Stays' })
  })
})

// ── Fix 5: per-row editable title + live-header toggle serialization. ──
describe('setRowTitle / setRowHeaderOn', () => {
  const base2 = (): BuilderLayout => ({ rows: [row('r0', 1, ['about'])], hidden: [] })

  it('sets a trimmed, bounded title on the row', () => {
    const out = setRowTitle(base2(), 'r0', '  Featured  ')
    expect(out.rows[0].title).toBe('Featured')
  })

  it('a blank title clears both title and header toggle', () => {
    const titled = setRowHeaderOn(setRowTitle(base2(), 'r0', 'Featured'), 'r0', true)
    expect(titled.rows[0].headerOn).toBe(true)
    const cleared = setRowTitle(titled, 'r0', '   ')
    expect(cleared.rows[0].title).toBeUndefined()
    expect(cleared.rows[0].headerOn).toBeUndefined()
  })

  it('the header toggle only sticks when the row has a title', () => {
    const noTitle = setRowHeaderOn(base2(), 'r0', true)
    expect(noTitle.rows[0].headerOn).toBeUndefined()
    const titled = setRowHeaderOn(setRowTitle(base2(), 'r0', 'Featured'), 'r0', true)
    expect(titled.rows[0].headerOn).toBe(true)
  })

  it('turning the header toggle off drops the flag but keeps the title (editor name stays)', () => {
    const on = setRowHeaderOn(setRowTitle(base2(), 'r0', 'Featured'), 'r0', true)
    const off = setRowHeaderOn(on, 'r0', false)
    expect(off.rows[0].title).toBe('Featured')
    expect(off.rows[0].headerOn).toBeUndefined()
  })

  it('title + toggle survive normalize (persisted through a mutation)', () => {
    const titled = setRowHeaderOn(setRowTitle(base2(), 'r0', 'Featured'), 'r0', true)
    const normalized = normalize(titled)
    expect(normalized.rows[0].title).toBe('Featured')
    expect(normalized.rows[0].headerOn).toBe(true)
  })

  it('title + toggle survive a block move on the same row-id', () => {
    let l: BuilderLayout = { rows: [row('r0', 1, ['about']), row('r1', 1, ['photoHero'])], hidden: [] }
    l = setRowHeaderOn(setRowTitle(l, 'r0', 'Featured'), 'r0', true)
    const after = placeBlock(l, 'photoHero', 'r0', 0)
    expect(after.rows.find((r) => r.id === 'r0')?.title).toBe('Featured')
    expect(after.rows.find((r) => r.id === 'r0')?.headerOn).toBe(true)
  })
})
