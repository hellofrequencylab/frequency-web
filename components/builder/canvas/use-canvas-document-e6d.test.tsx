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

// PROG-E6D. Row changes go through the same queue as every other change, keep the block selected, and Undo sends
// the opposite of the last one, a new row's removal once the server has named it. The server is a stub that answers with the shape the tab should take.

const A = 'ntext0000001'
const B = 'ntext0000002'
const FIELD = [{ key: 'text', label: 'Text', kind: 'textarea' as const }]
const node = (nid: string) => ({ nid, title: 'Text', fields: FIELD, elsewhere: 0, node: { nid, type: 'text', content: { text: nid } } })
const shape = (ids: string[], hidden: string[] = []) => {
  const tree: LayerTree = [{ id: 'r1', label: 'Row 1', columns: [ids.map((id, i) => ({ id, label: i ? `Text ${i + 1}` : 'Text', ...(hidden.includes(id) ? { hidden: true as const } : {}) }))] }]
  return { tree, layers: tree[0]!.columns[0]!.map(({ id, label }) => ({ id, label })), nodes: ids.map(node), inserter: { presets: [], blanks: [] } }
}
const view = (): CanvasDocumentView => ({ spaceId: 'space-1', spaceName: 'Calm', source: 'draft', canSave: true, notice: null, base: { revision: 2, fingerprint: 'f2' }, ...shape([A, B]) })
let revision = 2

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

const rowsAnswer = (rowIds: string[]) => {
  revision += 1
  const tree: LayerTree = rowIds.map((id, i) => ({ id, label: `Row ${i + 1}`, split: 'full', columns: [id === 'r1' ? [{ id: A, label: 'Text' }, { id: B, label: 'Text 2' }] : []] }))
  return { ok: true, base: { revision, fingerprint: `f${revision}` }, node: { nid: A, type: 'text' }, view: { tree, layers: tree[0]!.columns[0]!, nodes: [A, B].map(node), inserter: { presets: [], blanks: [] } } }
}

it('adds a row, moves it, re-splits it, and undoes all three in reverse', async () => {
  save
    .mockResolvedValueOnce(rowsAnswer(['r1', 'rnew']))   // add a row below r1
    .mockResolvedValueOnce(rowsAnswer(['rnew', 'r1']))   // move it up
    .mockResolvedValueOnce(rowsAnswer(['rnew', 'r1']))   // split it
    .mockResolvedValueOnce(rowsAnswer(['rnew', 'r1']))   // undo: split back
    .mockResolvedValueOnce(rowsAnswer(['r1', 'rnew']))   // undo: move back
    .mockResolvedValueOnce(rowsAnswer(['r1']))           // undo: take the new row off
  await act(async () => api.select(A))
  await act(async () => api.row({ kind: 'row-add', at: 1 }))
  await settle()
  expect(api.undoLabel).toBe('Undo add row')
  expect(api.tree?.map((row) => row.id)).toEqual(['r1', 'rnew'])
  await act(async () => api.row({ kind: 'row-move', rowId: 'rnew', by: -1 }))
  await settle()
  expect(api.undoLabel).toBe('Undo row move')
  await act(async () => api.row({ kind: 'row-split', rowId: 'rnew', split: 'even' }))
  await settle()
  expect(api.undoLabel).toBe('Undo columns')
  expect(api.selectedId).toBe(A)
  for (let i = 0; i < 3; i++) { await act(async () => api.undo()); await settle() }
  expect(api.undoLabel).toBeNull()
  expect(sent()).toEqual([
    [A, { kind: 'row-add', at: 1 }],
    [A, { kind: 'row-move', rowId: 'rnew', by: -1 }],
    [A, { kind: 'row-split', rowId: 'rnew', split: 'even' }],
    [A, { kind: 'row-split', rowId: 'rnew', split: 'full' }],
    [A, { kind: 'row-move', rowId: 'rnew', by: 1 }],
    [A, { kind: 'row-remove', rowId: 'rnew' }],
  ])
  expect(api.tree?.map((row) => row.id)).toEqual(['r1'])
})

it('drops the undo of a row change the server refused', async () => {
  save.mockResolvedValueOnce({ ok: false, conflict: false, error: 'That row is already at the edge of the page.' })
  await act(async () => api.select(A))
  await act(async () => api.row({ kind: 'row-move', rowId: 'r1', by: -1 }))
  await settle()
  expect(api.undoLabel).toBeNull()
  expect(api.problem).toBe('That row is already at the edge of the page.')
})
