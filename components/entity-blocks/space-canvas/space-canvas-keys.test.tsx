// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout: vi.fn() }))
import { NodeSpaceCanvasEditor } from './space-canvas-editor'
import { NodeLayoutProvider, useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6: the Space page builder's rail tiles take the website Layers keyboard model. One tab stop, arrows
// walk the tiles, Alt and Up or Down moves a block in its column, Delete removes it. Measured on the store.

const doc = upgradeLayout({
  rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }],
  content: { text: { text: 'First words' } },
})!

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() { const s = useNodeLayout()!; useEffect(() => { store = s }, [s]); return null }

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  globalThis.ResizeObserver = class { constructor(_callback?: unknown) {} observe() {} disconnect() {} unobserve() {} } as never
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

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
const tiles = () => Array.from(container.querySelectorAll<HTMLButtonElement>('li button[data-layer-id]'))
const nids = () => store.layout!.rows[0].cells[0].map((n) => n.nid)
async function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  await act(async () => { target.dispatchEvent(event) })
  return event
}

describe('Space page builder rail keys', () => {
  it('gives the rail one tab stop and walks it with the arrows', async () => {
    await mount()
    expect(tiles().map((t) => t.tabIndex)).toEqual([0, -1])
    await press(tiles()[0], 'ArrowDown')
    expect(document.activeElement).toBe(tiles()[1])
    expect(tiles().map((t) => t.tabIndex)).toEqual([-1, 0])
    await press(tiles()[1], 'Home')
    expect(document.activeElement).toBe(tiles()[0])
  })

  it('moves a block down its column with Alt and Down, keeping focus on it', async () => {
    await mount()
    const [a, b] = nids()
    await press(tiles()[0], 'ArrowDown', { altKey: true })
    expect(nids()).toEqual([b, a])
    expect(document.activeElement?.getAttribute('data-layer-id')).toBe(a)
  })

  it('removes a block with Delete and passes focus on', async () => {
    await mount()
    const [a] = nids()
    await press(tiles()[1], 'Delete')
    expect(nids()).toEqual([a])
    expect(document.activeElement).toBe(tiles()[0])
  })

  it('leaves the website-only shortcuts to the browser, and takes Alt and Left so Back does not fire', async () => {
    await mount()
    expect((await press(tiles()[0], 'd', { ctrlKey: true })).defaultPrevented).toBe(false)
    expect(nids()).toHaveLength(2)
    expect((await press(tiles()[0], 'ArrowLeft', { altKey: true })).defaultPrevented).toBe(true)
  })
})
