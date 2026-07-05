import { describe, it, expect } from 'vitest'
import {
  parseEntityLayout,
  mergeEntityLayout,
  sanitizeEntityLayout,
  layoutSlots,
  templateToRows,
  resolveRows,
  starterRows,
  STARTER_LAYOUTS,
  type EntityLayout,
  type RowDef,
} from './layout'
import type { TemplateId } from '@/lib/widgets/templates'

describe('slot-key injection guard (CodeQL remote property injection)', () => {
  it('drops unknown / dangerous slot keys on parse', () => {
    const parsed = parseEntityLayout({
      slots: { __proto__: ['about'], constructor: ['about'], bogus: ['about'] },
    })
    expect(parsed?.slots).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('keeps a known slot key on parse', () => {
    expect(parseEntityLayout({ slots: { main: ['about'] } })?.slots).toEqual({ main: ['about'] })
  })

  it('drops unknown slot keys on sanitize', () => {
    const clean = sanitizeEntityLayout({ slots: { __proto__: ['about'], main: ['about'] } }, 'space')
    expect(Object.keys(clean?.slots ?? {})).toEqual(['main'])
  })
})

// The member palette (about/stats/links/topfriends + content blocks) and space-only ids drive the
// kind-filtering cases below. Ids used: 'about','stats','links','topfriends' (member), 'offerings'
// (space-only), 'heading' (shared content).

describe('parseEntityLayout', () => {
  it('returns null for non-objects', () => {
    expect(parseEntityLayout(null)).toBeNull()
    expect(parseEntityLayout(undefined)).toBeNull()
    expect(parseEntityLayout('x')).toBeNull()
    expect(parseEntityLayout(['about'])).toBeNull()
    expect(parseEntityLayout(42)).toBeNull()
  })

  it('returns null for an object with no recognised keys', () => {
    expect(parseEntityLayout({})).toBeNull()
    expect(parseEntityLayout({ foo: 'bar' })).toBeNull()
  })

  it('reads a grid shape (template + slots + hidden)', () => {
    const parsed = parseEntityLayout({
      template: 'main-side',
      slots: { main: ['about', 'stats'], side: ['links'], junk: [] },
      hidden: ['topfriends'],
    })
    expect(parsed).toEqual({
      template: 'main-side',
      slots: { main: ['about', 'stats'], side: ['links'] },
      hidden: ['topfriends'],
    })
  })

  it('drops a bad template and non-string slot entries', () => {
    const parsed = parseEntityLayout({
      template: 'nope',
      slots: { main: ['about', 7, null, 'stats'] },
    })
    expect(parsed).toEqual({ slots: { main: ['about', 'stats'] } })
  })

  it('reads the flat back-compat order shape', () => {
    expect(parseEntityLayout({ order: ['about', 'links'] })).toEqual({ order: ['about', 'links'] })
  })
})

describe('mergeEntityLayout', () => {
  const memberDefaults = ['about', 'stats', 'links', 'topfriends']

  it('null saved → fresh default in the single template default slot', () => {
    const merged = mergeEntityLayout(memberDefaults, null, 'member')
    expect(merged.template).toBe('single')
    expect(merged.slots).toEqual({ main: ['about', 'stats', 'links', 'topfriends'] })
    expect(merged.hidden).toEqual([])
  })

  it('keeps a saved template and assigns ids to their slots', () => {
    const saved: EntityLayout = {
      template: 'main-side',
      slots: { main: ['stats', 'about'], side: ['links'] },
    }
    const merged = mergeEntityLayout(memberDefaults, saved, 'member')
    expect(merged.template).toBe('main-side')
    // 'links' stays in side; 'topfriends' was never placed → appended to the default (main) slot.
    expect(merged.slots?.main).toEqual(['stats', 'about', 'topfriends'])
    expect(merged.slots?.side).toEqual(['links'])
  })

  it('drops hidden ids from every slot', () => {
    const saved: EntityLayout = { slots: { main: ['about', 'stats', 'links', 'topfriends'] }, hidden: ['stats'] }
    const merged = mergeEntityLayout(memberDefaults, saved, 'member')
    expect(merged.slots?.main).not.toContain('stats')
    expect(merged.hidden).toContain('stats')
  })

  it('appends a new default id the saved layout never placed', () => {
    const saved: EntityLayout = { slots: { main: ['about'] }, hidden: ['stats', 'links', 'topfriends'] }
    const withNew = mergeEntityLayout([...memberDefaults, 'heading'], saved, 'member')
    // hidden ones stay out; the brand-new 'heading' is appended to main.
    expect(withNew.slots?.main).toEqual(['about', 'heading'])
  })

  it('filters ids that do not support the kind', () => {
    // 'offerings' is space-only; asked for a member it must be dropped.
    const saved: EntityLayout = { slots: { main: ['about', 'offerings'] } }
    const merged = mergeEntityLayout(['about', 'offerings', 'stats'], saved, 'member')
    expect(merged.slots?.main).not.toContain('offerings')
    expect(merged.slots?.main).toContain('about')
  })

  it('reads the flat back-compat order into the default slot', () => {
    const merged = mergeEntityLayout(memberDefaults, { order: ['links', 'about'] }, 'member')
    expect(merged.template).toBe('single')
    // saved order first, then the untouched defaults appended.
    expect(merged.slots?.main).toEqual(['links', 'about', 'stats', 'topfriends'])
  })

  it('reassigns ids from a slot the new template no longer has into the default slot', () => {
    // Saved under a 3-slot template, but the layout now resolves under single (bad template ignored).
    const saved: EntityLayout = { template: 'nope' as never, slots: { side: ['links'], 'col-2': ['stats'] } }
    const merged = mergeEntityLayout(memberDefaults, saved, 'member')
    expect(merged.template).toBe('single')
    // everything lands in main.
    expect(new Set(merged.slots?.main)).toEqual(new Set(['links', 'stats', 'about', 'topfriends']))
  })
})

// ── ADR-516 Phase A: freeform rows model ────────────────────────────────────────────────────────────

describe('rows validation (parseEntityLayout)', () => {
  it('reads a valid rows array', () => {
    const parsed = parseEntityLayout({
      rows: [
        { id: 'r0', columns: 1, slots: ['about'] },
        { id: 'r1', columns: 2, slots: ['stats', 'links'] },
      ],
    })
    expect(parsed?.rows).toEqual([
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 2, cells: [['stats'], ['links']] },
    ])
  })

  it('rejects a row with bad columns (not 1..4)', () => {
    expect(parseEntityLayout({ rows: [{ id: 'r0', columns: 5, slots: ['about'] }] })?.rows).toBeUndefined()
    expect(parseEntityLayout({ rows: [{ id: 'r0', columns: 0, slots: ['about'] }] })?.rows).toBeUndefined()
    expect(parseEntityLayout({ rows: [{ id: 'r0', columns: 'x', slots: ['about'] }] })?.rows).toBeUndefined()
  })

  it('nulls an unknown block id but keeps the cell positional', () => {
    const parsed = parseEntityLayout({ rows: [{ id: 'r0', columns: 2, slots: ['about', 'nope'] }] })
    expect(parsed?.rows).toEqual([{ id: 'r0', columns: 2, cells: [['about'], []] }])
  })

  it('dedupes a block id across all rows (later repeat becomes null)', () => {
    const parsed = parseEntityLayout({
      rows: [
        { id: 'r0', columns: 1, slots: ['about'] },
        { id: 'r1', columns: 2, slots: ['about', 'stats'] },
      ],
    })
    expect(parsed?.rows?.[1].cells).toEqual([[], ['stats']])
  })

  it('clamps slots length to columns (pads with null, truncates extras)', () => {
    const short = parseEntityLayout({ rows: [{ id: 'r0', columns: 3, slots: ['about'] }] })
    expect(short?.rows?.[0].cells).toEqual([['about'], [], []])
    const long = parseEntityLayout({ rows: [{ id: 'r0', columns: 1, slots: ['about', 'stats'] }] })
    expect(long?.rows?.[0].cells).toEqual([['about']])
  })

  it('caps the row count at 24', () => {
    const many = Array.from({ length: 40 }, () => ({ id: 'r0', columns: 1 as const, slots: [] as string[] }))
    expect(parseEntityLayout({ rows: many })?.rows?.length).toBe(24)
  })

  it('regenerates an unsafe row id (never trusts the raw key)', () => {
    const parsed = parseEntityLayout({ rows: [{ id: '__proto__', columns: 1, slots: ['about'] }] })
    expect(parsed?.rows?.[0].id).toBe('r0')
  })

  it('drops wrong-kind ids on sanitize', () => {
    // 'topfriends' is member-only; sanitizing for a SPACE (which keeps the 2-column row) must null it.
    const clean = sanitizeEntityLayout({ rows: [{ id: 'r0', columns: 2, slots: ['about', 'topfriends'] }] }, 'space')
    expect(clean?.rows?.[0].cells).toEqual([['about'], []])
  })
})

// ── ADR-526: per-kind max columns (member = single-column list; space = up to two) + 2-col ratio ───────

describe('per-kind max columns clamp', () => {
  it('clamps a member layout to a single column (drops the overflow block to the bench)', () => {
    // 'about'+'stats' are both valid member blocks; a member row can only be one column, so the second
    // cell is dropped and the row narrows to 1 column.
    const clean = sanitizeEntityLayout({ rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'] }] }, 'member')
    expect(clean?.rows).toEqual([{ id: 'r0', columns: 1, cells: [['about']] }])
  })

  it('clamps a space layout to at most two columns', () => {
    const clean = sanitizeEntityLayout(
      { rows: [{ id: 'r0', columns: 3, slots: ['about', 'stats', 'offerings'] }] },
      'space',
    )
    expect(clean?.rows).toEqual([{ id: 'r0', columns: 2, cells: [['about'], ['stats']] }])
  })

  it('resolveRows clamps a member 2-col row to one column on read', () => {
    const layout: EntityLayout = { rows: [{ id: 'r0', columns: 2, cells: [['links'], ['topfriends']] }] }
    expect(resolveRows(layout, 'member')).toEqual([{ id: 'r0', columns: 1, cells: [['links']] }])
  })
})

describe('2-column ratio (even / lead = 66/33)', () => {
  it('parses and keeps a lead ratio on a 2-column row', () => {
    const parsed = parseEntityLayout({ rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'], ratio: 'lead' }] })
    expect(parsed?.rows?.[0]).toEqual({ id: 'r0', columns: 2, cells: [['about'], ['stats']], ratio: 'lead' })
  })

  it('drops a ratio on a non-2-column row (even is the implicit default)', () => {
    const parsed = parseEntityLayout({ rows: [{ id: 'r0', columns: 1, slots: ['about'], ratio: 'lead' }] })
    expect(parsed?.rows?.[0]).toEqual({ id: 'r0', columns: 1, cells: [['about']] })
  })

  it('normalizes an unknown ratio value away', () => {
    const parsed = parseEntityLayout({ rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'], ratio: 'wat' }] })
    expect(parsed?.rows?.[0]).toEqual({ id: 'r0', columns: 2, cells: [['about'], ['stats']] })
  })

  it('carries the lead ratio through sanitize + resolve for a space', () => {
    const raw = { rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'], ratio: 'lead' }] }
    const clean = sanitizeEntityLayout(raw, 'space')
    expect(clean?.rows?.[0].ratio).toBe('lead')
    expect(resolveRows(clean, 'space')?.[0].ratio).toBe('lead')
  })

  it('drops the ratio when a member row is clamped out of 2 columns', () => {
    const clean = sanitizeEntityLayout(
      { rows: [{ id: 'r0', columns: 2, slots: ['links', 'topfriends'], ratio: 'lead' }] },
      'member',
    )
    expect(clean?.rows?.[0]).toEqual({ id: 'r0', columns: 1, cells: [['links']] })
  })

  it('carries a trail (33/66) ratio for a space 2-column row', () => {
    const clean = sanitizeEntityLayout(
      { rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'], ratio: 'trail' }] },
      'space',
    )
    expect(clean?.rows?.[0].ratio).toBe('trail')
    expect(resolveRows(clean, 'space')?.[0].ratio).toBe('trail')
  })
})

describe('per-block content + style (ADR-528)', () => {
  it('parses + sanitizes content and style, keyed by block id', () => {
    const raw = {
      rows: [{ id: 'r0', columns: 1, slots: ['heading'] }],
      content: { heading: { text: 'Hi', bogus: 'x' }, __proto__: { text: 'no' } },
      style: { heading: { background: true, pad: 'md' } },
    }
    const clean = sanitizeEntityLayout(raw, 'space')
    expect(clean?.content).toEqual({ heading: { text: 'Hi' } })
    expect(clean?.style).toEqual({ heading: { background: true, pad: 'md' } })
  })

  it('drops a wrong-kind block content bag on sanitize', () => {
    // 'offerings' is space-only; its content bag must not survive a member sanitize.
    const clean = sanitizeEntityLayout(
      { rows: [{ id: 'r0', columns: 1, slots: ['links'] }], content: { offerings: { title: 'x' } } },
      'member',
    )
    expect(clean?.content).toBeUndefined()
  })

  it('mergeEntityLayout carries content + style onto the effective grid', () => {
    const saved = parseEntityLayout({
      content: { heading: { text: 'Hi' } },
      style: { heading: { align: 'center' } },
    })
    const merged = mergeEntityLayout(['heading', 'links'], saved, 'space')
    expect(merged.content).toEqual({ heading: { text: 'Hi' } })
    expect(merged.style).toEqual({ heading: { align: 'center' } })
  })
})

describe('templateToRows (all 7 templates)', () => {
  const ALL: TemplateId[] = [
    'single',
    'main-side',
    'two-col',
    'three-col',
    'header-side',
    'header-two-col',
    'header-main-side-footer',
  ]

  it('produces valid RowDefs (columns 1..4, slots length === columns) for every template', () => {
    for (const tpl of ALL) {
      const slots: Record<string, string[]> = {
        main: ['about', 'stats'],
        side: ['links'],
        top: ['about'],
        header: ['about'],
        footer: ['stats'],
        'col-1': ['links'],
        'col-2': ['topfriends'],
        'col-3': ['heading'],
      }
      const rows = templateToRows(tpl, slots, 'member')
      for (const row of rows) {
        expect([1, 2, 3, 4]).toContain(row.columns)
        expect(row.cells.length).toBe(row.columns)
      }
    }
  })

  it('single → one 1-column row per block, order preserved (byte-identical default stack)', () => {
    const rows = templateToRows('single', { main: ['about', 'stats', 'links', 'topfriends'] }, 'member')
    expect(rows).toEqual([
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 1, cells: [['stats']] },
      { id: 'r2', columns: 1, cells: [['links']] },
      { id: 'r3', columns: 1, cells: [['topfriends']] },
    ])
  })

  it('main-side → a 2-column row zipping the two columns', () => {
    const rows = templateToRows('main-side', { main: ['about'], side: ['links'] }, 'member')
    expect(rows).toEqual([{ id: 'r0', columns: 2, cells: [['about'], ['links']] }])
  })

  it('header-main-side-footer → header row(s), a 2-col body, then footer row(s)', () => {
    const rows = templateToRows(
      'header-main-side-footer',
      { header: ['about'], main: ['stats'], side: ['links'], footer: ['topfriends'] },
      'member',
    )
    expect(rows).toEqual([
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 2, cells: [['stats'], ['links']] },
      { id: 'r2', columns: 1, cells: [['topfriends']] },
    ])
  })

  it('drops wrong-kind ids during conversion', () => {
    const rows = templateToRows('single', { main: ['about', 'offerings'] }, 'member')
    expect(rows).toEqual([{ id: 'r0', columns: 1, cells: [['about']] }])
  })
})

describe('resolveRows fallbacks', () => {
  it('rows present → validated rows, hidden dropped', () => {
    // Uses a SPACE (which keeps a 2-column row) to prove hidden ids null their cell positionally.
    const layout: EntityLayout = {
      rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']] }],
      hidden: ['stats'],
    }
    expect(resolveRows(layout, 'space')).toEqual([{ id: 'r0', columns: 2, cells: [['about'], []] }])
  })

  it('legacy template + slots → templateToRows', () => {
    const layout: EntityLayout = { template: 'single', slots: { main: ['about', 'stats'] } }
    expect(resolveRows(layout, 'member')).toEqual([
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 1, cells: [['stats']] },
    ])
  })

  it('flat legacy order → single-column rows', () => {
    expect(resolveRows({ order: ['about', 'links'] }, 'member')).toEqual([
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 1, cells: [['links']] },
    ])
  })

  it('null / empty layout → the basic starter for the kind', () => {
    expect(resolveRows(null, 'member')).toEqual(starterRows('member', 'basic'))
    expect(resolveRows({}, 'space')).toEqual(starterRows('space', 'basic'))
  })

  it('proves the LIVE default render is unchanged: merged member default → 4 stacked 1-col rows', () => {
    // The exact live member path: mergeEntityLayout(defaultMemberLayout(), null) → resolveRows.
    const merged = mergeEntityLayout(['about', 'stats', 'links', 'topfriends'], null, 'member')
    expect(resolveRows(merged, 'member')).toEqual([
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 1, cells: [['stats']] },
      { id: 'r2', columns: 1, cells: [['links']] },
      { id: 'r3', columns: 1, cells: [['topfriends']] },
    ])
  })
})

describe('starter layouts', () => {
  const kinds = ['member', 'space'] as const
  const ids = ['basic', 'showcase', 'minimal'] as const

  it('every starter is a well-formed RowDef[] with real block ids', () => {
    for (const kind of kinds) {
      for (const id of ids) {
        const rows: RowDef[] = starterRows(kind, id)
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
          expect([1, 2, 3, 4]).toContain(row.columns)
          expect(row.cells.length).toBe(row.columns)
        }
        // Sanitizing the starter for its kind must not null any placed id (they are all valid).
        const clean = sanitizeEntityLayout({ rows }, kind)
        expect(clean?.rows).toEqual(rows)
      }
    }
  })

  it('member basic omits the chrome-owned about/stats and leads with links, topfriends (ADR-522)', () => {
    expect(starterRows('member', 'basic')).toEqual([
      { id: 'r0', columns: 1, cells: [['links']] },
      { id: 'r1', columns: 1, cells: [['topfriends']] },
    ])
    // The chrome (bio + Standing card) is canonical; the member grid never re-renders it by default.
    const ids = starterRows('member', 'basic').flatMap((r) => r.cells.flat())
    expect(ids).not.toContain('about')
    expect(ids).not.toContain('stats')
  })

  it('minimal starters lead with the essentials (member → links, space → about)', () => {
    expect(starterRows('member', 'minimal')).toEqual([{ id: 'r0', columns: 1, cells: [['links']] }])
    // The space minimal starter (ADR-529 curated core): about, offerings, contact.
    expect(starterRows('space', 'minimal').flatMap((r) => r.cells.flat())).toEqual(['about', 'offerings', 'contact'])
  })

  it('starterRows returns a fresh copy (mutation-safe)', () => {
    const a = starterRows('member', 'basic')
    a[0].cells[0][0] = 'mutated'
    expect(STARTER_LAYOUTS.member.basic[0].cells[0][0]).toBe('links')
  })
})

describe('layoutSlots', () => {
  it('lists visible ids per slot in template order', () => {
    const rows = layoutSlots({ template: 'main-side', slots: { main: ['about'], side: ['links'] } })
    expect(rows).toEqual([
      { slot: 'main', ids: ['about'] },
      { slot: 'side', ids: ['links'] },
    ])
  })

  it('reads a flat order as the single template main slot', () => {
    expect(layoutSlots({ order: ['about', 'stats'] })).toEqual([{ slot: 'main', ids: ['about', 'stats'] }])
  })
})
