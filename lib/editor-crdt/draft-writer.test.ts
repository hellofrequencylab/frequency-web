import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Y from 'yjs'
import { upgradeLayout, type NodeLayout } from '../entity-blocks/node-tree'
import { toYDoc, editLocal } from './node-ydoc'
import { createDraftWriter } from './draft-writer'

const layout = () => upgradeLayout({ rows: [{ id: 'r1', columns: 1, cells: [['about']] }] })!
const touch = (doc: Y.Doc, v: string) => editLocal(doc, root => (root.get('meta') as Y.Map<unknown>).set('template', v))

describe('draft writer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('saves once after a burst of edits, with the sanitized tree', async () => {
    const doc = toYDoc(layout())
    const save = vi.fn(async (_t: NodeLayout) => {})
    createDraftWriter({ doc, kind: 'site', save, waitMs: 500 })
    touch(doc, 'a')
    touch(doc, 'b')
    touch(doc, 'c')
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(499)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].rows[0].cells[0][0].type).toBe('about')
  })

  it('does not save an unchanged tree twice', async () => {
    const doc = toYDoc(layout())
    const save = vi.fn(async (_t: NodeLayout) => {})
    const w = createDraftWriter({ doc, kind: 'site', save, waitMs: 100 })
    touch(doc, 'a')
    await w.flush()
    await w.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reports a failed save and retries it on the next flush', async () => {
    const doc = toYDoc(layout())
    const onError = vi.fn()
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const w = createDraftWriter({ doc, kind: 'site', save, onError })
    touch(doc, 'a')
    await w.flush()
    expect(onError).toHaveBeenCalledTimes(1)
    await w.flush()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('skips a doc that sanitizes to nothing, so the previous draft stays', async () => {
    const doc = new Y.Doc()
    const save = vi.fn(async (_t: NodeLayout) => {})
    const w = createDraftWriter({ doc, kind: 'site', save })
    doc.getMap('layout').set('junk', 1)
    await w.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('stops after dispose', async () => {
    const doc = toYDoc(layout())
    const save = vi.fn(async (_t: NodeLayout) => {})
    const w = createDraftWriter({ doc, kind: 'site', save, waitMs: 50 })
    w.dispose()
    touch(doc, 'a')
    await vi.advanceTimersByTimeAsync(200)
    expect(save).not.toHaveBeenCalled()
  })
})
