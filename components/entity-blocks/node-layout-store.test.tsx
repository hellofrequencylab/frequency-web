// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { NodeLayoutProvider, useNodeLayout } from './node-layout-store'
import { addNode, removeNode, setNodeContent, getNode } from '@/lib/entity-blocks/node-ops'
import { upgradeLayout } from '@/lib/entity-blocks/node-tree'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root, container: HTMLDivElement
let store: NonNullable<ReturnType<typeof useNodeLayout>>
const save = vi.fn<(layout: unknown) => Promise<{ error?: string }>>()
function Probe() { const current = useNodeLayout()!; useEffect(() => { store = current }, [current]); return <div>{current.error}</div> }
async function tick(ms = 600) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const doc = upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }], content: { text: { title: 'Both' } } })!

beforeEach(() => {
  vi.useFakeTimers(); save.mockReset().mockResolvedValue({})
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  act(() => root.render(<NodeLayoutProvider save={save}><Probe /></NodeLayoutProvider>))
  act(() => store.seed(doc))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); vi.clearAllTimers(); vi.useRealTimers()
})

describe('node layout store', () => {
  it('selects one of two Text blocks by node id, not by type', () => {
    const [a, b] = store.layout!.rows[0].cells[0]
    expect(a.nid).not.toBe(b.nid)
    act(() => store.select(b.nid))
    expect(store.selectedNid).toBe(b.nid)
  })
  it('folds two edits in one tick over the freshest layout and saves the whole node document once', async () => {
    const [a, b] = store.layout!.rows[0].cells[0]
    act(() => {
      store.edit((l) => setNodeContent(l, a.nid, { title: 'First' }))
      store.edit((l) => setNodeContent(l, b.nid, { title: 'Second' }))
    })
    expect(getNode(store.layout!, a.nid)!.content).toEqual({ title: 'First' })
    expect(getNode(store.layout!, b.nid)!.content).toEqual({ title: 'Second' })
    expect(store.dirty).toBe(true)
    await tick()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toBe(store.layout)
    expect(store.dirty).toBe(false)
  })
  it('clears a selection whose node was removed', () => {
    const [a] = store.layout!.rows[0].cells[0]
    act(() => store.select(a.nid))
    act(() => store.edit((l) => removeNode(l, a.nid)))
    expect(store.selectedNid).toBeNull()
  })
  it('undo restores the prior document and saves it', async () => {
    const before = store.layout
    act(() => store.edit((l) => addNode(l, 'text', 'r1', 0).layout))
    expect(store.canUndo).toBe(true)
    await tick()
    act(() => store.undo())
    expect(store.layout).toBe(before)
    await tick()
    expect(save).toHaveBeenCalledTimes(2)
  })
  it('keeps a failed draft dirty without a retry loop, then saves it with the next edit', async () => {
    save.mockResolvedValueOnce({ error: 'Cannot save' })
    const [a] = store.layout!.rows[0].cells[0]
    act(() => store.edit((l) => setNodeContent(l, a.nid, { title: 'Draft' })))
    await tick()
    expect(store.error).toBe('Cannot save'); expect(store.dirty).toBe(true)
    await tick(20_000)
    expect(save).toHaveBeenCalledTimes(1)
    act(() => store.edit((l) => setNodeContent(l, a.nid, { title: 'Later' })))
    await tick()
    expect(save).toHaveBeenCalledTimes(2)
    expect(store.dirty).toBe(false); expect(store.error).toBeNull()
  })
  it('the first seed wins', () => {
    const other = upgradeLayout({ rows: [{ id: 'r9', columns: 1, cells: [['links']] }] })!
    act(() => store.seed(other))
    expect(store.layout).toBe(doc)
  })
})
