// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { LiveNodeGrid } from './live-node-grid'
import { NodeLayoutProvider, useNodeLayout } from './node-layout-store'
import { setNodeContent } from '@/lib/entity-blocks/node-ops'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The node grid renders a node document: two placements of one content block draw from their
// OWN bags, and an edit through the node store repaints the page with no server round trip.

const doc = upgradeLayout({
  rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }],
  content: { text: { text: 'Alpha' } },
})!
const nodes = { text: <div key="text" data-server="text" /> }

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() { const s = useNodeLayout()!; useEffect(() => { store = s }, [s]); return null }

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe('LiveNodeGrid', () => {
  it('renders the persisted node document with no provider', () => {
    act(() => root.render(<LiveNodeGrid nodes={nodes} initialLayout={doc} />))
    expect(container.textContent).toContain('Alpha')
  })

  it('drops a hidden node from the render', () => {
    const hidden = { ...doc, rows: doc.rows.map((r) => ({ ...r, cells: r.cells.map((s) => s.map((n) => ({ ...n, hidden: true }))) })) }
    act(() => root.render(<LiveNodeGrid nodes={nodes} initialLayout={hidden} />))
    expect(container.textContent).not.toContain('Alpha')
  })

  it('repaints each of two Text nodes from its own bag when edited', () => {
    act(() =>
      root.render(
        <NodeLayoutProvider save={async () => ({})}>
          <Probe />
          <LiveNodeGrid nodes={nodes} initialLayout={doc} />
        </NodeLayoutProvider>,
      ),
    )
    const [a] = store.layout!.rows[0].cells[0]
    act(() => store.edit((l) => setNodeContent(l, a.nid, { text: 'Beta' })))
    act(() => store.edit((l) => setNodeContent(l, store.layout!.rows[0].cells[0][1].nid, { text: 'Gamma' })))
    expect(container.textContent).toContain('Beta')
    expect(container.textContent).toContain('Gamma')
    expect(container.textContent).not.toContain('Alpha')
  })
})
