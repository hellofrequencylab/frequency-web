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
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6H: a block tile in the Space page builder rail is dragged, by a mouse (HTML drag) and by a long
// press on touch, to a place in its column or in another column of its section. Measured on the store and
// on what the draft save is sent.

const TEXT = 'ntext000001', CALLOUT = 'ncallout001', ALONE = 'nalone00001'
const page = (right: { nid: string; type: string }[] = []): NodeLayout => ({
  rows: [
    { id: 'r0', columns: 1, cells: [[{ nid: ALONE, type: 'editorial' }]] },
    { id: 'r1', columns: 2, cells: [[{ nid: TEXT, type: 'text', content: { text: 'Left words' } }, { nid: CALLOUT, type: 'callout' }], right] },
  ],
  bench: [],
})
const twelve = Array.from({ length: 12 }, (_, i) => ({ nid: `nfull${String(i).padStart(6, '0')}`, type: 'text' }))

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
function Probe() { const s = useNodeLayout()!; useEffect(() => { store = s }, [s]); return null }
const saved = vi.fn(async (_layout: NodeLayout) => ({}))
const pointAt = document.elementFromPoint

beforeEach(() => {
  vi.useFakeTimers()
  saved.mockClear(); saveSpaceGridLayout.mockClear()
  Element.prototype.scrollIntoView = vi.fn()
  globalThis.ResizeObserver = class { constructor(_callback?: unknown) {} observe() {} disconnect() {} unobserve() {} } as never
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals()
  Object.assign(document, { elementFromPoint: pointAt })
})

async function mountNodes(doc: NodeLayout = page()) {
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
const tile = (key: string) => container.querySelector<HTMLButtonElement>(`li button[data-layer-id="${key}"]`)!
const column = (rowId: string, col: number) => container.querySelector<HTMLElement>(`[data-drop-key="${rowId}:${col}"]`)!
const columns = () => store.layout!.rows[1].cells.map((stack) => stack.map((n) => n.nid))
const said = () => container.querySelector('[role="status"].sr-only')?.textContent
const landing = () => Array.from(container.querySelectorAll<HTMLElement>('[data-landing]')).map((el) => el.dataset.landing)
const frame = () => act(async () => { await vi.advanceTimersByTimeAsync(20) })
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(700) })

// A finger: HTML drag never starts from one, so it presses, holds still, then drags.
function finger(target: HTMLElement, type: string, x = 10, y = 10, pointerType = 'touch') {
  act(() => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, clientX: x, clientY: y })) })
}
const hold = () => act(() => { vi.advanceTimersByTime(400) })
function under(target: Element | null) { Object.assign(document, { elementFromPoint: () => target }) }
// A mouse: the browser's own drag, on the tile header.
function drag(target: HTMLElement, type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { dataTransfer: { setData: () => {}, getData: () => '', effectAllowed: '', dropEffect: '' } })
  act(() => { target.dispatchEvent(event) })
  return event
}
const handle = (key: string) => tile(key).parentElement!

describe('Space page builder, a long press drag on touch', () => {
  it('drops a block into the empty column, shows where it will land, says so, and saves the draft', async () => {
    await mountNodes()
    finger(tile(TEXT), 'pointerdown')
    hold()
    under(column('r1', 1))
    finger(tile(TEXT), 'pointermove', 10, 80)
    expect(landing()).toEqual(['end'])
    expect(column('r1', 1).querySelector('[data-landing="end"]')).not.toBeNull()
    expect(tile(TEXT).closest('li')!.dataset.dragged).toBe('true')
    finger(tile(TEXT), 'pointerup', 10, 80)
    await frame()
    expect(columns()).toEqual([[CALLOUT], [TEXT]])
    expect(store.layout!.rows[1].cells[1][0].content).toEqual({ text: 'Left words' })
    expect(landing()).toEqual([])
    expect(said()).toBe('Text moved to place 1 in column 2.')
    expect(document.activeElement).toBe(tile(TEXT))
    await settle()
    expect(saved).toHaveBeenCalledTimes(1)
    expect(saved.mock.calls[0][0].rows[1].cells.map((stack) => stack.map((n) => n.nid))).toEqual([[CALLOUT], [TEXT]])
  })

  it('reorders inside a column by dropping on another tile, and the lift is not a pick', async () => {
    await mountNodes()
    finger(tile(CALLOUT), 'pointerdown')
    hold()
    under(tile(TEXT))
    finger(tile(CALLOUT), 'pointermove', 10, 0)
    expect(landing()).toEqual(['before'])
    expect(tile(TEXT).closest('li')!.querySelector('[data-landing="before"]')).not.toBeNull()
    finger(tile(CALLOUT), 'pointerup', 10, 0)
    await act(async () => tile(CALLOUT).click())
    await frame()
    expect(columns()).toEqual([[CALLOUT, TEXT], []])
    expect(tile(CALLOUT).getAttribute('aria-expanded')).toBe('false')
    expect(said()).toBe('Callout moved to place 1 in column 1.')
  })

  it('lets a finger that moves before the press lands scroll, and a mouse press moves nothing', async () => {
    await mountNodes()
    const before = store.layout
    under(column('r1', 1))
    finger(tile(TEXT), 'pointerdown')
    finger(tile(TEXT), 'pointermove', 10, 60)
    hold()
    finger(tile(TEXT), 'pointermove', 10, 80)
    expect(landing()).toEqual([])
    finger(tile(TEXT), 'pointerup', 10, 80)
    finger(tile(TEXT), 'pointerdown', 10, 10, 'mouse')
    hold()
    finger(tile(TEXT), 'pointermove', 10, 80, 'mouse')
    finger(tile(TEXT), 'pointerup', 10, 80, 'mouse')
    expect(store.layout).toBe(before)
    await settle()
    expect(saved).not.toHaveBeenCalled()
  })

  it('cancels on Escape and on a lift off every landing place, with nothing moved', async () => {
    await mountNodes()
    const before = store.layout
    finger(tile(TEXT), 'pointerdown')
    hold()
    under(column('r1', 1))
    finger(tile(TEXT), 'pointermove', 10, 80)
    expect(landing()).toEqual(['end'])
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(landing()).toEqual([])
    finger(tile(TEXT), 'pointerup', 10, 80)
    expect(store.layout).toBe(before)
    // Held again, dragged off the rail, let go.
    finger(tile(TEXT), 'pointerdown')
    hold()
    under(document.body)
    finger(tile(TEXT), 'pointermove', 300, 300)
    expect(landing()).toEqual([])
    finger(tile(TEXT), 'pointerup', 300, 300)
    // And a place in another section is not a place for this block.
    finger(tile(TEXT), 'pointerdown')
    hold()
    under(column('r0', 0))
    finger(tile(TEXT), 'pointermove', 10, 0)
    expect(landing()).toEqual([])
    finger(tile(TEXT), 'pointerup', 10, 0)
    expect(said()).toBe('Text stayed where it was.')
    expect(store.layout).toBe(before)
    await settle()
    expect(saved).not.toHaveBeenCalled()
  })

  it('refuses a column at the 12 block cap, says why, and drops nothing', async () => {
    await mountNodes(page(twelve))
    const before = store.layout
    finger(tile(TEXT), 'pointerdown')
    hold()
    under(column('r1', 1))
    finger(tile(TEXT), 'pointermove', 10, 80)
    expect(landing()).toEqual(['full'])
    expect(column('r1', 1).textContent).toContain('This column is full. It holds 12 blocks.')
    finger(tile(TEXT), 'pointerup', 10, 80)
    expect(store.layout).toBe(before)
    expect(said()).toBe('Column 2 is full. Text stayed where it was.')
    await settle()
    expect(saved).not.toHaveBeenCalled()
  })
})

describe('Space page builder, a mouse drag', () => {
  it('drags a tile by its header to another column and saves the draft', async () => {
    await mountNodes()
    expect(handle(TEXT).draggable).toBe(true)
    drag(handle(TEXT), 'dragstart')
    expect(drag(column('r1', 1), 'dragover').defaultPrevented).toBe(true)
    expect(landing()).toEqual(['end'])
    drag(column('r1', 1), 'drop')
    await frame()
    expect(columns()).toEqual([[CALLOUT], [TEXT]])
    expect(said()).toBe('Text moved to place 1 in column 2.')
    await settle()
    expect(saved).toHaveBeenCalledTimes(1)
  })

  it('reorders by dropping on a tile, and takes no drop on the dragged tile or in another section', async () => {
    await mountNodes()
    drag(handle(CALLOUT), 'dragstart')
    expect(drag(tile(CALLOUT).closest('li')!, 'dragover').defaultPrevented).toBe(false)
    expect(drag(column('r0', 0), 'dragover').defaultPrevented).toBe(false)
    expect(landing()).toEqual([])
    expect(drag(tile(TEXT).closest('li')!, 'dragover').defaultPrevented).toBe(true)
    expect(landing()).toEqual(['before'])
    drag(tile(TEXT).closest('li')!, 'drop')
    expect(columns()).toEqual([[CALLOUT, TEXT], []])
  })

  it('ends with nothing moved when the drag is let go off a landing place or Escape ends it', async () => {
    await mountNodes()
    const before = store.layout
    drag(handle(TEXT), 'dragstart')
    drag(column('r1', 1), 'dragover')
    // The browser ends an HTML drag with dragend and no drop on Escape or a release outside a target.
    drag(handle(TEXT), 'dragend')
    expect(landing()).toEqual([])
    expect(store.layout).toBe(before)
    expect(said()).toBe('Text stayed where it was.')
    // A drop that arrives with no drag of ours in hand (a file, a stray element) moves nothing.
    drag(column('r1', 1), 'drop')
    expect(store.layout).toBe(before)
  })

  it('does not let a full column take the drop', async () => {
    await mountNodes(page(twelve))
    const before = store.layout
    drag(handle(TEXT), 'dragstart')
    expect(drag(column('r1', 1), 'dragover').defaultPrevented).toBe(false)
    expect(landing()).toEqual(['full'])
    drag(handle(TEXT), 'dragend')
    expect(store.layout).toBe(before)
  })

  it('leaves a finger to the long press: a touch never starts the HTML drag', async () => {
    await mountNodes()
    finger(tile(TEXT), 'pointerdown')
    expect(drag(handle(TEXT), 'dragstart').defaultPrevented).toBe(true)
    finger(tile(TEXT), 'pointerup')
  })
})

describe('Space page builder, a drag on the type-keyed store', () => {
  it('saves a long press drop through the Space draft save', async () => {
    const rows = [
      { id: 'r0', columns: 1 as const, cells: [['editorial']] },
      { id: 'r1', columns: 2 as const, cells: [['text', 'callout'], []] },
    ]
    await act(async () => {
      root.render(<SpaceCanvasEditorMount slug="acme" rows={rows} content={{ text: { text: 'Left words' } }} />)
    })
    finger(tile('callout'), 'pointerdown')
    hold()
    under(tile('text'))
    finger(tile('callout'), 'pointermove', 10, 0)
    finger(tile('callout'), 'pointerup', 10, 0)
    await settle()
    expect(saveSpaceGridLayout).toHaveBeenCalled()
    const [slug, layout] = saveSpaceGridLayout.mock.calls.at(-1)!
    expect(slug).toBe('acme')
    const sent = layout as { rows: { cells: string[][] }[]; content: Record<string, unknown> }
    expect(sent.rows[1].cells).toEqual([['callout', 'text'], []])
    expect(sent.content.text).toEqual({ text: 'Left words' })
  })
})
