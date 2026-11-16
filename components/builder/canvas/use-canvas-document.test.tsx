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
