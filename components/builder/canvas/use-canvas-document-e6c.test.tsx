// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const save = vi.hoisted(() => vi.fn())
vi.mock('@/app/(main)/pages/canvas/document-actions', () => ({ saveCanvasNodeDraft: save }))

import type { CanvasDocumentView } from '@/lib/builder/canvas-document'
import type { LayerTree } from '@/lib/builder/canvas-tree'
import { useCanvasDocument } from './use-canvas-document'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// PROG-E6C. Duplicate, hide and remove go through the same queue as every other change, and Undo sends the opposite
// of the last one. The server is a stub that answers with the shape the tab should take.

const A = 'ntext0000001'
const B = 'ntext0000002'
const C = 'ntext0000003'
const FIELD = [{ key: 'text', label: 'Text', kind: 'textarea' as const }]
const node = (nid: string) => ({ nid, title: 'Text', fields: FIELD, elsewhere: 0, node: { nid, type: 'text', content: { text: nid } } })
const shape = (ids: string[], hidden: string[] = []) => {
  const tree: LayerTree = [{ id: 'r1', label: 'Row 1', columns: [ids.map((id, i) => ({ id, label: i ? `Text ${i + 1}` : 'Text', ...(hidden.includes(id) ? { hidden: true as const } : {}) }))] }]
  return { tree, layers: tree[0]!.columns[0]!.map(({ id, label }) => ({ id, label })), nodes: ids.map(node), inserter: { presets: [], blanks: [] } }
}
const view = (): CanvasDocumentView => ({ spaceId: 'space-1', spaceName: 'Calm', source: 'draft', canSave: true, notice: null, base: { revision: 2, fingerprint: 'f2' }, ...shape([A, B]) })
let revision = 2
const answer = (ids: string[], selected: string, hidden: string[] = []) => {
  revision += 1
  return { ok: true, base: { revision, fingerprint: `f${revision}` }, node: { nid: selected, type: 'text' }, view: shape(ids, hidden) }
}

type Api = ReturnType<typeof useCanvasDocument>
let api: Api
function Harness({ document }: { document: CanvasDocumentView }) {
  const value = useCanvasDocument(document)
  useEffect(() => { api = value })
  return null
}
let root: ReturnType<typeof createRoot>
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(1000) })
const sent = () => save.mock.calls.map(([input]) => [input.nid, input.change])

beforeEach(async () => {
  vi.useFakeTimers()
  save.mockReset()
  revision = 2
  root = createRoot(globalThis.document.createElement('div'))
  await act(async () => root.render(<Harness document={view()} />))
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })

it('duplicates, hides and removes, then undoes all three in reverse through the same write', async () => {
  save
    .mockResolvedValueOnce(answer([A, C, B], C))        // duplicate A -> C
    .mockResolvedValueOnce(answer([A, C, B], C, [C]))   // hide C
    .mockResolvedValueOnce(answer([A, B], B))           // remove C (kept on the bench)
    .mockResolvedValueOnce(answer([A, C, B], C, [C]))   // undo: put C back
    .mockResolvedValueOnce(answer([A, C, B], C))        // undo: show C
    .mockResolvedValueOnce(answer([A, B], A))           // undo: take the copy away for good
  expect(api.undoLabel).toBeNull()
  await act(async () => api.duplicate())
  await settle()
  expect(api.selectedId).toBe(C)
  expect(api.undoLabel).toBe('Undo add')
  await act(async () => api.toggleHidden())
  await settle()
  expect(api.selectedHidden).toBe(true)
  expect(api.undoLabel).toBe('Undo hide')
  await act(async () => api.remove())
  await settle()
  expect(api.selectedId).toBe(B)
  expect(api.undoLabel).toBe('Undo remove')
  for (let i = 0; i < 3; i++) { await act(async () => api.undo()); await settle() }
  expect(api.undoLabel).toBeNull()
  expect(api.layers.map((layer) => layer.id)).toEqual([A, B])
  expect(sent()).toEqual([
    [A, { kind: 'duplicate' }],
    [C, { kind: 'hide', hidden: true }],
    [C, { kind: 'remove', keep: true }],
    [C, { kind: 'restore', to: { rowId: 'r1', col: 0, index: 1 } }],
    [C, { kind: 'hide', hidden: false }],
    [C, { kind: 'remove', keep: false }],
  ])
  // Each save built on the base the last one returned.
  expect(save.mock.calls.map(([input]) => input.base.revision)).toEqual([2, 3, 4, 5, 6, 7])
})

it('undoes a move back to its slot, and a run of spacing steps back to the first step', async () => {
  save.mockImplementation(async (input) => (input.change.kind === 'move' ? answer(input.change.to.index === 0 ? [B, A] : [A, B], input.nid) : { ok: true, base: { revision: ++revision, fingerprint: 'f' }, node: { nid: A, type: 'text', content: { text: A }, ...(input.change.step === 'default' ? {} : { style: { mt: input.change.step } }) } }))
  await act(async () => api.move(A, { rowId: 'r1', col: 0, index: 1 }))
  await settle()
  expect(api.undoLabel).toBe('Undo move')
  await act(async () => api.space('mt', 'sm'))
  await act(async () => api.space('mt', 'md'))
  await act(async () => api.space('mt', 'lg'))
  await settle()
  expect(api.undoLabel).toBe('Undo spacing')
  await act(async () => api.undo())
  await settle()
  expect(save.mock.calls.at(-1)![0].change).toEqual({ kind: 'spacing', edge: 'mt', step: 'default' })
  await act(async () => api.undo())
  await settle()
  expect(save.mock.calls.at(-1)![0]).toMatchObject({ nid: A, change: { kind: 'move', to: { rowId: 'r1', col: 0, index: 0 } } })
  expect(api.undoLabel).toBeNull()
})

it('drops the undo of a change the server refused', async () => {
  save.mockResolvedValueOnce({ ok: false, conflict: false, error: 'A page keeps at least one block.' })
  await act(async () => api.remove())
  await settle()
  expect(api.undoLabel).toBeNull()
  expect(api.problem).toBe('A page keeps at least one block.')
})
