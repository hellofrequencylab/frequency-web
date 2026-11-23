// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
const saveSpaceGridLayout = vi.hoisted(() => vi.fn(async (_slug: string, _layout: unknown) => ({})))
vi.mock('@/app/(main)/spaces/[slug]/settings/profile/actions', () => ({ saveSpaceGridLayout }))
vi.mock('@/components/entity-blocks/space-publish-fab', () => ({ SpacePublishFab: () => null }))
import { SpaceCanvasEditorMount } from './space-canvas-editor-mount'
import { NodeSpaceCanvasEditor } from './space-canvas-editor'
import { NodeLayoutProvider, useNodeLayout } from '@/components/entity-blocks/node-layout-store'
import { upgradeLayout, type NodeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6G: a block crosses columns in the Space page builder. Alt and Left or Right on a rail tile, and a
// 44px button with its words on it for a pointer or a finger. Measured on the store and on what is saved.

const rows = [
  { id: 'r0', columns: 1 as const, cells: [['editorial']] },
  { id: 'r1', columns: 2 as const, cells: [['text', 'callout'], []] },
]
const doc = upgradeLayout({ rows, content: { text: { text: 'Left words' } } })!

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() { const s = useNodeLayout()!; useEffect(() => { store = s }, [s]); return null }
const saved = vi.fn(async (_layout: NodeLayout) => ({}))

beforeEach(() => {
  vi.useFakeTimers()
  saved.mockClear(); saveSpaceGridLayout.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
  globalThis.ResizeObserver = class { constructor(_callback?: unknown) {} observe() {} disconnect() {} unobserve() {} } as never
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })

async function mountNodes() {
  await act(async () => {
    root.render(
      <NodeLayoutProvider save={saved}>
        <Probe />
        <NodeSpaceCanvasEditor loomScope="acme" />
      </NodeLayoutProvider>,
    )
  })
  await act(async () => store.seed(doc))
}
const tile = (nid: string) => container.querySelector<HTMLButtonElement>(`li button[data-layer-id="${nid}"]`)!
const across = (side: 'left' | 'right') => container.querySelector<HTMLButtonElement>(`button[data-across="${side}"]`)
const columns = () => store.layout!.rows[1].cells.map((stack) => stack.map((n) => n.nid))
async function press(target: HTMLElement, key: string) {
  const event = new KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true })
  await act(async () => { target.dispatchEvent(event) })
  await frame()
  return event
}
// Focus is handed back on the next frame, after the tile is drawn in its new column.
const frame = () => act(async () => { await vi.advanceTimersByTimeAsync(20) })
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(700) })

describe('Space page builder, a move across columns', () => {
  it('moves a block to the empty column with Alt and Right, keeps focus on it, and saves the draft', async () => {
    await mountNodes()
    const [text, callout] = doc.rows[1].cells[0].map((n) => n.nid)
    const event = await press(tile(text), 'ArrowRight')
    expect(event.defaultPrevented).toBe(true)
    expect(columns()).toEqual([[callout], [text]])
    expect(store.layout!.rows[1].cells[1][0].content).toEqual({ text: 'Left words' })
    expect(document.activeElement).toBe(tile(text))
    expect(container.querySelector('[role="status"].sr-only')?.textContent).toBe('Text moved to column 2.')
    await settle()
    expect(saved).toHaveBeenCalledTimes(1)
    expect(saved.mock.calls[0][0].rows[1].cells.map((stack) => stack.map((n) => n.nid))).toEqual([[callout], [text]])
    // And back again with Alt and Left, to the end of the column it came from.
    await press(tile(text), 'ArrowLeft')
    expect(columns()).toEqual([[callout, text], []])
  })

  it('takes the key at the edge and in a section with one column, and moves nothing', async () => {
    await mountNodes()
    const before = store.layout
    const alone = doc.rows[0].cells[0][0].nid
    expect((await press(tile(alone), 'ArrowRight')).defaultPrevented).toBe(true)
    expect((await press(tile(doc.rows[1].cells[0][0].nid), 'ArrowLeft')).defaultPrevented).toBe(true)
    expect(store.layout).toBe(before)
    await settle()
    expect(saved).not.toHaveBeenCalled()
  })

  it('offers a labelled 44px button on the selected tile, only for the side that exists', async () => {
    await mountNodes()
    const [text, callout] = doc.rows[1].cells[0].map((n) => n.nid)
    expect(across('right')).toBeNull()
    await act(async () => tile(text).click())
    const right = across('right')!
    expect(across('left')).toBeNull()
    expect(right.textContent).toContain('Move right')
    expect(right.className).toContain('min-h-11')
    expect(right.className).toContain('min-w-11')
    await act(async () => right.click())
    await frame()
    expect(columns()).toEqual([[callout], [text]])
    // The tile is drawn again in the other column, still open, now offering the way back.
    expect(document.activeElement).toBe(tile(text))
    expect(across('right')).toBeNull()
    expect(across('left')!.textContent).toContain('Move left')
  })

  it('offers no button in a section with one column', async () => {
    await mountNodes()
    await act(async () => tile(doc.rows[0].cells[0][0].nid).click())
    expect(across('left')).toBeNull()
    expect(across('right')).toBeNull()
  })

  it('moves a block on the type-keyed store too, through the same Space draft save', async () => {
    await act(async () => {
      root.render(<SpaceCanvasEditorMount slug="acme" rows={rows} content={{ text: { text: 'Left words' } }} />)
    })
    await act(async () => tile('text').click())
    await act(async () => across('right')!.click())
    await settle()
    expect(saveSpaceGridLayout).toHaveBeenCalled()
    const [slug, layout] = saveSpaceGridLayout.mock.calls.at(-1)!
    expect(slug).toBe('acme')
    const sent = layout as { rows: { cells: string[][] }[]; content: Record<string, unknown> }
    expect(sent.rows[1].cells).toEqual([['callout'], ['text']])
    expect(sent.content.text).toEqual({ text: 'Left words' })
  })
})
