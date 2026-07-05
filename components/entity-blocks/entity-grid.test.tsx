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
    const rows = resolveRows({ rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'] }] }, 'space')
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('grid gap-6 sm:grid-cols-2')
    expect(html).toContain('data-block="about"')
    expect(html).toContain('data-block="stats"')
  })

  it('renders a lead-ratio 2-column row as a 66/33 grid', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'], ratio: 'lead' }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('grid gap-6 sm:grid-cols-[2fr_1fr]')
  })

  it('renders a trail-ratio 2-column row as a 33/66 grid', () => {
    const rows = resolveRows(
      { rows: [{ id: 'r0', columns: 2, slots: ['about', 'stats'], ratio: 'trail' }] },
      'space',
    )
    const html = renderToStaticMarkup(<EntityGrid rows={rows} renderBlock={renderBlock} />)
    expect(html).toContain('grid gap-6 sm:grid-cols-[1fr_2fr]')
  })

  it('renders nothing for an empty (null) cell', () => {
    const rows = [{ id: 'r0', columns: 2 as const, slots: ['about', null] }]
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
