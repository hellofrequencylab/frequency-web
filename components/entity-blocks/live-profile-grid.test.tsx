import { describe, it, expect, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LiveProfileGrid } from './live-profile-grid'
import { setSpaceEditMode } from './space-edit-mode'
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

// LIVE-PAGE EDIT MODE fail-safe: the on-page inline editors turn on ONLY for a Space owner (a seeded space
// store, in the client edit-mode signal). On the server render / no-provider fallback (a visitor's SSR and
// this test), the edit-mode signal being on must NEVER flip the page into the editable surface — the server
// snapshot of the signal is always false and there is no space store — so it stays the plain read-only
// render and a visitor can never see (or trip) the editor.
describe('LiveProfileGrid (edit mode is inert on the read-only render)', () => {
  afterEach(() => setSpaceEditMode(false))

  it('renders the read-only server nodes even when edit mode is on, with no provider', () => {
    setSpaceEditMode(true)
    const rows: RowDef[] = [{ id: 'r0', columns: 1, cells: [['about']] }]
    const html = renderToStaticMarkup(
      <LiveProfileGrid nodes={nodes} initialRows={rows} spaceSlug="demo" />,
    )
    // The read-only node placed as before — NOT the selectable edit wrapper (role="group").
    expect(html).toContain('data-block="about"')
    expect(html).not.toContain('role="group"')
  })
})
