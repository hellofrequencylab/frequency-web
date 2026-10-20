// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { NodeSpaceCanvasEditor } from './space-canvas-editor'
import { NodeLayoutProvider, useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// E0 task 12b. The on-canvas Space editor, driven by the node store: two Text blocks are two tiles, each
// edits and removes on its own, and a section added in the rail lands in the node document.

const doc = upgradeLayout({
  rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }],
  content: { text: { text: 'First words' } },
})!

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() { const s = useNodeLayout()!; useEffect(() => { store = s }, [s]); return null }

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as never
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

async function mount() {
  await act(async () => {
    root.render(
      <NodeLayoutProvider save={async () => ({})}>
        <Probe />
        <NodeSpaceCanvasEditor loomScope="acme" />
      </NodeLayoutProvider>,
    )
  })
  await act(async () => store.seed(doc))
}

describe('NodeSpaceCanvasEditor', () => {
  it('shows two Text blocks as two rail tiles', async () => {
    await mount()
    expect(container.querySelectorAll('button[aria-label="Move Text up"]')).toHaveLength(2)
  })

  it('removes one Text block and keeps the other with its words', async () => {
    await mount()
    const [a, b] = store.layout!.rows[0].cells[0]
    const tiles = container.querySelectorAll<HTMLButtonElement>('li button[aria-current]')
    await act(async () => tiles[1].click())
    await act(async () => { [...container.querySelectorAll('button')].find((x) => x.textContent?.includes('Remove block'))!.click() })
    const left = store.layout!.rows[0].cells[0]
    expect(left.map((n) => n.nid)).toEqual([a.nid])
    expect(left[0].nid).not.toBe(b.nid)
    expect(left[0].content).toEqual({ text: 'First words' })
  })

  it('adds a section to the node document', async () => {
    await mount()
    await act(async () => { [...container.querySelectorAll('button')].find((x) => x.textContent?.includes('Add section'))!.click() })
    expect(store.layout!.rows).toHaveLength(2)
  })
})
