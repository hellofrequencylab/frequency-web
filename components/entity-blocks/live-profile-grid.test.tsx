import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LiveProfileGrid } from './live-profile-grid'
import type { RowDef } from '@/lib/entity-blocks/layout'

// ADR-516 Phase C. With NO provider mounted (the fail-safe path), LiveProfileGrid renders the persisted
// server layout — visually identical to a plain EntityGrid render. It places the pre-rendered node map by
// block id and drops hidden cells. (The instant-repaint-from-context path is a client effect exercised in
// the app; here we assert the server-render fallback + node placement, which run under renderToStaticMarkup.)

const nodes = {
  about: <div key="about" data-block="about" />,
  stats: <div key="stats" data-block="stats" />,
  links: <div key="links" data-block="links" />,
}

describe('LiveProfileGrid (no-provider fallback)', () => {
  it('renders the persisted rows in order from the node map', () => {
    const rows: RowDef[] = [
      { id: 'r0', columns: 1, cells: [['about']] },
      { id: 'r1', columns: 2, cells: [['stats'], ['links']] },
    ]
    const html = renderToStaticMarkup(<LiveProfileGrid nodes={nodes} initialRows={rows} />)
    expect(html).toContain('data-block="about"')
    expect(html).toContain('data-block="stats"')
    expect(html).toContain('data-block="links"')
    expect(html).toContain('grid gap-8 sm:grid-cols-2')
  })

  it('drops a hidden cell from the render', () => {
    const rows: RowDef[] = [{ id: 'r0', columns: 1, cells: [['about']] }, { id: 'r1', columns: 1, cells: [['stats']] }]
    const html = renderToStaticMarkup(<LiveProfileGrid nodes={nodes} initialRows={rows} initialHidden={['stats']} />)
    expect(html).toContain('data-block="about"')
    expect(html).not.toContain('data-block="stats"')
  })

  it('renders nothing for an unknown id', () => {
    const rows: RowDef[] = [{ id: 'r0', columns: 1, cells: [['ghost']] }]
    const html = renderToStaticMarkup(<LiveProfileGrid nodes={nodes} initialRows={rows} />)
    expect(html).not.toContain('data-block')
  })
})
