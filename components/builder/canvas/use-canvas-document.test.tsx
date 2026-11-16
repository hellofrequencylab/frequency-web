// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const save = vi.hoisted(() => vi.fn())
vi.mock('@/app/(main)/pages/canvas/document-actions', () => ({ saveCanvasNodeDraft: save }))

import type { CanvasDocumentView } from '@/lib/builder/canvas-document'
import { useCanvasDocument } from './use-canvas-document'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E5B. The client half of the draft write: an edit is saved a moment later carrying the base the tab holds,
// the next save carries the base the last one returned, and a conflict stops this tab from saving again.

const A = 'ntext0000001'
const B = 'ntext0000002'
const FIELD = [{ key: 'text', label: 'Text', kind: 'textarea' as const }]
const view = (over: Partial<CanvasDocumentView> = {}): CanvasDocumentView => ({
  spaceId: 'space-1', spaceName: 'Calm Studio', source: 'draft', canSave: true, notice: null,
  base: { revision: 2, fingerprint: 'f2' },
  layers: [{ id: A, label: 'Text' }, { id: B, label: 'Text 2' }],
  nodes: [
    { nid: A, title: 'Text', fields: FIELD, elsewhere: 0, node: { nid: A, type: 'text', content: { text: 'First', list: ['kept'] } } },
    { nid: B, title: 'Text', fields: FIELD, elsewhere: 0, node: { nid: B, type: 'text', content: { text: 'Second' } } },
  ],
  ...over,
})

type Api = ReturnType<typeof useCanvasDocument>
let api: Api
const keep = (next: Api) => { api = next }
/** Hands the hook's latest value out after each render, so a test reads what the canvas would. */
function Harness({ document, sink }: { document?: CanvasDocumentView; sink: (api: Api) => void }) {
  const value = useCanvasDocument(document)
  useEffect(() => { sink(value) })
  return null
}
let root: ReturnType<typeof createRoot>
const mount = async (document?: CanvasDocumentView) => {
  root = createRoot(globalThis.document.createElement('div'))
  await act(async () => root.render(<Harness document={document} sink={keep} />))
}
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(1000) })

beforeEach(() => { vi.useFakeTimers(); save.mockReset() })
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })

it('does nothing without a document', async () => {
  await mount()
  expect(api.selected).toBeNull()
  await act(async () => api.edit({ desktop: { text: 'x' } }))
  await settle()
  expect(save).not.toHaveBeenCalled()
})

it('saves an edit once the typing stops, with the base it loaded, then builds the next save on the returned base', async () => {
  save.mockResolvedValueOnce({ ok: true, base: { revision: 3, fingerprint: 'f3' }, node: { nid: A, type: 'text', content: { text: 'Edited' } } })
  save.mockResolvedValueOnce({ ok: true, base: { revision: 4, fingerprint: 'f4' }, node: { nid: B, type: 'text', content: { text: 'Other' } } })
  await mount(view())
  expect(api.selected?.nid).toBe(A)
  await act(async () => api.edit({ desktop: { text: 'Edit' } }))
  await act(async () => api.edit({ desktop: { text: 'Edited ', list: ['kept'] } as never }))
  expect(api.save).toBe('unsaved')
  expect(save).not.toHaveBeenCalled()
  await settle()
  // One save for the burst; only strings and booleans cross (the list stays the server's to keep).
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenLastCalledWith({ spaceId: 'space-1', nid: A, base: { revision: 2, fingerprint: 'f2' }, values: { desktop: { text: 'Edited ' } } })
  expect(api.save).toBe('saved')
  expect(api.selected?.node.content).toEqual({ text: 'Edited' })

  await act(async () => api.select(B))
  await act(async () => api.edit({ desktop: { text: 'Other' }, phone: { text: '' } }))
  await settle()
  expect(save).toHaveBeenLastCalledWith({ spaceId: 'space-1', nid: B, base: { revision: 3, fingerprint: 'f3' }, values: { desktop: { text: 'Other' }, phone: { text: '' } } })
})

it('stops saving after a conflict and says why, keeping what was typed on the page', async () => {
  save.mockResolvedValue({ ok: false, conflict: true, error: 'This page was changed somewhere else.' })
  await mount(view())
  await act(async () => api.edit({ desktop: { text: 'Mine' } }))
  await settle()
  expect(api.save).toBe('conflict')
  expect(api.problem).toBe('This page was changed somewhere else.')
  expect(api.selected?.node.content).toEqual({ text: 'Mine' })
  await act(async () => api.edit({ desktop: { text: 'Mine again' } }))
  await settle()
  expect(save).toHaveBeenCalledTimes(1)
})

it('retries a failed save with the next change, and never calls the server when the viewer cannot save', async () => {
  save.mockRejectedValueOnce(new Error('offline'))
  save.mockResolvedValueOnce({ ok: true, base: { revision: 3, fingerprint: 'f3' }, node: { nid: A, type: 'text', content: { text: 'Two' } } })
  await mount(view())
  await act(async () => api.edit({ desktop: { text: 'One' } }))
  await settle()
  expect(api.save).toBe('error')
  await act(async () => api.edit({ desktop: { text: 'Two' } }))
  await settle()
  expect(save).toHaveBeenCalledTimes(2)
  expect(api.save).toBe('saved')
  await act(async () => root.unmount())

  save.mockReset()
  await mount(view({ canSave: false }))
  expect(api.save).toBe('read-only')
  await act(async () => api.edit({ desktop: { text: 'Look only' } }))
  await settle()
  expect(save).not.toHaveBeenCalled()
  expect(api.selected?.node.content).toEqual({ text: 'Look only' })
})

// PROG-E6B. The page's shape goes through the same action and the same base as a field edit.

const C = 'nprose000003'
const TREE = [{ id: 'r1', label: 'Row 1', columns: [[{ id: A, label: 'Text' }, { id: B, label: 'Text 2' }]] }, { id: 'r2', label: 'Row 2', columns: [[], []] }]
const shaped = (over: Partial<CanvasDocumentView> = {}) => view({ tree: TREE, inserter: { presets: [{ id: 'welcome', label: 'Welcome note' }], blanks: [] }, ...over })
const treeIds = () => api.tree?.map((row) => row.columns.map((stack) => stack.map((layer) => layer.id)))
const stored = (ids: string[][][]) => ({
  layers: ids.flat(2).map((id) => ({ id, label: id })),
  tree: ids.map((columns, i) => ({ id: `r${i + 1}`, label: `Row ${i + 1}`, columns: columns.map((stack) => stack.map((id) => ({ id, label: id }))) })),
  nodes: ids.flat(2).map((nid) => ({ nid, title: 'Text', fields: FIELD, elsewhere: 0, node: { nid, type: 'text', content: { text: `stored ${nid}` } } })),
  inserter: { presets: [], blanks: [] },
})

it('shows a move at once and saves it as a slot through the same action, then builds the next save on the returned base', async () => {
  save.mockResolvedValueOnce({ ok: true, base: { revision: 3, fingerprint: 'f3' }, node: { nid: A, type: 'text' }, view: stored([[[B, A]], [[], []]]) })
  save.mockResolvedValueOnce({ ok: true, base: { revision: 4, fingerprint: 'f4' }, node: { nid: B, type: 'text' }, view: stored([[[A]], [[], [B]]]) })
  await mount(shaped())
  await act(async () => { api.move(A, { rowId: 'r1', col: 0, index: 1 }) })
  // No waiting for the typing pause: a move is sent as it is made.
  expect(save).toHaveBeenCalledTimes(1)
  expect(save).toHaveBeenLastCalledWith({ spaceId: 'space-1', nid: A, base: { revision: 2, fingerprint: 'f2' }, values: {}, change: { kind: 'move', to: { rowId: 'r1', col: 0, index: 1 } } })
  await settle()
  expect(treeIds()).toEqual([[[B, A]], [[], []]])
  expect(api.layers.map((layer) => layer.id)).toEqual([B, A])
  expect(api.save).toBe('saved')
  await act(async () => { api.move(B, { rowId: 'r2', col: 1, index: 0 }) })
  await settle()
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ nid: B, base: { revision: 3, fingerprint: 'f3' }, change: { kind: 'move', to: { rowId: 'r2', col: 1, index: 0 } } }))
  expect(treeIds()).toEqual([[[A]], [[], [B]]])
})

it('puts a refused move back where the server has it, and does not send a move that goes nowhere', async () => {
  save.mockResolvedValueOnce({ ok: false, conflict: false, error: 'That block cannot go there. The draft was left as it was.' })
  await mount(shaped())
  await act(async () => { api.move(A, { rowId: 'r9', col: 0, index: 0 }) })
  await act(async () => { api.move('nmissing0001', { rowId: 'r1', col: 0, index: 0 }) })
  expect(save).not.toHaveBeenCalled()
  await act(async () => { api.move(A, { rowId: 'r2', col: 0, index: 0 }) })
  await settle()
  expect(treeIds()).toEqual([[[A, B]], [[], []]])
  expect(api.save).toBe('error')
  expect(api.problem).toContain('cannot go there')
})

it('stops for good on a conflict from a move, and keeps a move local when the viewer cannot save', async () => {
  save.mockResolvedValue({ ok: false, conflict: true, error: 'This page was changed somewhere else.' })
  await mount(shaped())
  await act(async () => { api.move(A, { rowId: 'r2', col: 0, index: 0 }) })
  await settle()
  expect(api.save).toBe('conflict')
  await act(async () => { api.move(B, { rowId: 'r2', col: 1, index: 0 }) })
  await act(async () => { api.insert('preset', 'welcome') })
  await settle()
  expect(save).toHaveBeenCalledTimes(1)
  await act(async () => root.unmount())

  save.mockReset()
  await mount(shaped({ canSave: false }))
  await act(async () => { api.move(A, { rowId: 'r2', col: 0, index: 0 }) })
  await act(async () => { api.space('mt', 'lg') })
  await act(async () => { api.insert('preset', 'welcome') })
  await settle()
  expect(save).not.toHaveBeenCalled()
  expect(treeIds()).toEqual([[[B]], [[A], []]])
  expect(api.save).toBe('read-only')
})

it('saves a spacing step on the selected block as a named step, and collapses steps made faster than they save', async () => {
  let release: (value: unknown) => void = () => {}
  save.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
  save.mockResolvedValueOnce({ ok: true, base: { revision: 4, fingerprint: 'f4' }, node: { nid: A, type: 'text', content: { text: 'First', list: ['kept'] }, style: { mt: 'xl' } } })
  await mount(shaped())
  await act(async () => { api.space('mt', 'sm') })
  expect(api.selected?.node.style).toEqual({ mt: 'sm' })
  expect(save).toHaveBeenLastCalledWith({ spaceId: 'space-1', nid: A, base: { revision: 2, fingerprint: 'f2' }, values: {}, change: { kind: 'spacing', edge: 'mt', step: 'sm' } })
  // Three more steps while the first is in flight: only the last is sent.
  await act(async () => { api.space('mt', 'md') })
  await act(async () => { api.space('mt', 'lg') })
  await act(async () => { api.space('mt', 'xl') })
  await act(async () => { api.space('mt', 'xl') })
  expect(save).toHaveBeenCalledTimes(1)
  await act(async () => { release({ ok: true, base: { revision: 3, fingerprint: 'f3' }, node: { nid: A, type: 'text', content: { text: 'First', list: ['kept'] }, style: { mt: 'sm' } } }) })
  await settle()
  expect(save).toHaveBeenCalledTimes(2)
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ base: { revision: 3, fingerprint: 'f3' }, change: { kind: 'spacing', edge: 'mt', step: 'xl' } }))
  expect(api.selected?.node.style).toEqual({ mt: 'xl' })
  expect(api.selected?.node.content).toEqual({ text: 'First', list: ['kept'] })
  expect(api.save).toBe('saved')
})

it('adds a block under the selected one once the server has stored it, and selects the new block', async () => {
  const after = stored([[[A, C, B]], [[], []]])
  save.mockResolvedValueOnce({ ok: true, base: { revision: 3, fingerprint: 'f3' }, node: { nid: C, type: 'text', content: { text: 'stored' } }, view: after })
  await mount(shaped())
  await act(async () => { api.insert('preset', 'welcome') })
  expect(save).toHaveBeenLastCalledWith({ spaceId: 'space-1', nid: A, base: { revision: 2, fingerprint: 'f2' }, values: {}, change: { kind: 'insert', source: 'preset', id: 'welcome' } })
  await settle()
  expect(treeIds()).toEqual([[[A, C, B]], [[], []]])
  expect(api.selectedId).toBe(C)
  expect(api.selected?.node.content).toEqual({ text: `stored ${C}` })
  expect(api.inserter).toEqual(after.inserter)
})

it('keeps what is being typed in a block when a move lands while it waits to be saved', async () => {
  save.mockResolvedValueOnce({ ok: true, base: { revision: 3, fingerprint: 'f3' }, node: { nid: B, type: 'text' }, view: stored([[[B, A]], [[], []]]) })
  save.mockResolvedValueOnce({ ok: true, base: { revision: 4, fingerprint: 'f4' }, node: { nid: A, type: 'text', content: { text: 'Typing' } } })
  await mount(shaped())
  await act(async () => api.edit({ desktop: { text: 'Typing' } }))
  await act(async () => { api.move(B, { rowId: 'r1', col: 0, index: 0 }) })
  await settle()
  // The move went first, then the edit, each on the base before it; the typed words were never replaced.
  expect(save.mock.calls.map(([call]) => [call.nid, call.base.revision, call.change?.kind ?? 'edit'])).toEqual([[B, 2, 'move'], [A, 3, 'edit']])
  expect(save.mock.calls[1]![0].values).toEqual({ desktop: { text: 'Typing' } })
  expect(api.selected?.node.content).toEqual({ text: 'Typing' })
})
