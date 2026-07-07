import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { EntityGrid } from './entity-grid'
import { resolveRows } from '@/lib/entity-blocks/layout'

// ADR-516 Phase A render gate. Proves the DATA-DRIVEN EntityGrid renders resolved rows in order, and that
// the legacy `single` template (the default the vast majority of profiles use) still renders its blocks
// stacked in one `@container space-y-6` container — byte-identical to the pre-ADR-516 switch output.
// EntityGrid is server-safe (no hooks), so it runs under renderToStaticMarkup in the node test env.

const renderBlock = (id: string) => <div key={id} data-block={id} />

describe('EntityGrid (data-driven rows)', () => {
  it('renders the legacy single default byte-identically (blocks stacked in one @container)', () => {
    const rows = resolveRows({ template: 'single', slots: { main: ['about', 'stats', 'links', 'topfriends'] } }, 'member')
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    // One outer stack container, no inner grid wrappers, blocks in order.
    expect(html).toBe(
      '<div class="@container space-y-6">' +
        '<div data-block="about"></div>' +
        '<div data-block="stats"></div>' +
        '<div data-block="links"></div>' +
        '<div data-block="topfriends"></div>' +
        '</div>',
    )
  })

  it('renders a multi-column row as a grid with per-cell @container', () => {
    // A SPACE keeps a 2-column row (a member is clamped to a single column).
    const rows = resolveRows({ rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']] }] }, 'space')
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('grid gap-6 sm:grid-cols-2')
    expect(html).toContain('data-block="about"')
    expect(html).toContain('data-block="stats"')
  })

  it('renders a lead-ratio 2-column row as a 66/33 grid', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']], ratio: 'lead' }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('grid gap-6 sm:grid-cols-[2fr_1fr]')
  })

  it('renders a trail-ratio 2-column row as a 33/66 grid', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']], ratio: 'trail' }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('grid gap-6 sm:grid-cols-[1fr_2fr]')
  })

  it('renders nothing for an empty (null) cell', () => {
    const rows = [{ id: 'r0', columns: 2 as const, cells: [['about'], []] }]
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('data-block="about"')
    expect(html).not.toContain('data-block="null"')
  })

  it('renders the blocks in resolved row order', () => {
    const rows = resolveRows({ order: ['links', 'about'] }, 'member')
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html.indexOf('data-block="links"')).toBeLessThan(html.indexOf('data-block="about"'))
  })
})

// ── Fix 5: per-row LIVE header renders only when the toggle is on + the title is non-blank + the row
// has blocks (never a lone header). A titled-but-toggled-off row shows NO header on the live page. ──
describe('EntityGrid row header (Fix 5)', () => {
  it('renders the row title as an <h2> when the header toggle is on', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 1, cells: [['about']], title: 'Featured', headerOn: true }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('<h2')
    expect(html).toContain('Featured')
    expect(html).toContain('data-block="about"')
  })

  it('does NOT render a header when the toggle is off (title stays an editor-only name)', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 1, cells: [['about']], title: 'Featured' }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).not.toContain('Featured')
    expect(html).not.toContain('<h2')
  })

  it('suppresses the header over a row with no blocks (never a lone heading)', () => {
    const rows = [{ id: 'r0', columns: 1 as const, cells: [[]], title: 'Featured', headerOn: true }]
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).not.toContain('<h2')
  })

  it('renders a header above a multi-column row', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 2, cells: [['about'], ['stats']], title: 'Two up', headerOn: true }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('Two up')
    expect(html).toContain('grid gap-6 sm:grid-cols-2')
  })
})

// ── Fix 8: a block that renders null (empty / collapsed) reserves NO height — the grid emits nothing for
// it, never a hollow box. renderBlock returning null stands in for a collapsed content block. ──
describe('EntityGrid empty-block collapse (Fix 8)', () => {
  const renderMaybe = (id: string) => (id === 'about' ? <div key={id} data-block={id} /> : null)

  it('emits nothing for a block that renders null (no reserved box)', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 1, cells: [['about', 'stats']] }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderMaybe} />)
    expect(html).toContain('data-block="about"')
    // 'stats' rendered null → no element, no empty wrapper of its own.
    expect(html).not.toContain('data-block="stats"')
  })
})
