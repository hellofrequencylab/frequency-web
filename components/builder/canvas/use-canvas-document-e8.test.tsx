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

// PROG-E8 on a real document: the block this tab just added is the one Vera may speak first about. A copy is not a
// creation, and picking a block by hand ends the moment.

const A = 'ntext0000001'
const B = 'ntext0000002'
const C = 'ntext0000003'
const FIELD = [{ key: 'text', label: 'Text', kind: 'textarea' as const }]
const node = (nid: string) => ({ nid, title: 'Text', fields: FIELD, elsewhere: 0, node: { nid, type: 'text', content: { text: nid } } })
const shape = (ids: string[]) => {
  const tree: LayerTree = [{ id: 'r1', label: 'Row 1', columns: [ids.map((id) => ({ id, label: 'Text' }))] }]
  return { tree, layers: tree[0]!.columns[0]!.map(({ id, label }) => ({ id, label })), nodes: ids.map(node), inserter: { presets: [], blanks: [] } }
}
const view = (): CanvasDocumentView => ({ spaceId: 'space-1', spaceName: 'Calm', source: 'draft', canSave: true, notice: null, base: { revision: 2, fingerprint: 'f2' }, ...shape([A, B]) })
let revision = 2
const answer = (ids: string[], selected: string) => {
  revision += 1
  return { ok: true, base: { revision, fingerprint: `f${revision}` }, node: { nid: selected, type: 'text' }, view: shape(ids) }
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

beforeEach(async () => {
  vi.useFakeTimers()
  save.mockReset()
  revision = 2
  root = createRoot(globalThis.document.createElement('div'))
  await act(async () => root.render(<Harness document={view()} />))
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers() })

it('marks the block an insert made, and forgets it once another block is picked', async () => {
  save.mockResolvedValueOnce(answer([A, C, B], C))
  expect(api.createdId).toBeNull()
  await act(async () => api.insert('blank', 'text'))
  await settle()
  expect(api.selectedId).toBe(C)
  expect(api.createdId).toBe(C)
  await act(async () => api.select(A))
  expect(api.createdId).toBeNull()
  await act(async () => api.select(C))
  expect(api.createdId).toBeNull()
})

it('does not count a copy as a creation', async () => {
  save.mockResolvedValueOnce(answer([A, C, B], C))
  await act(async () => api.duplicate())
  await settle()
  expect(api.selectedId).toBe(C)
  expect(api.createdId).toBeNull()
})
