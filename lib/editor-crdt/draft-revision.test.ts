import { expect, it } from 'vitest'
import * as Y from 'yjs'
import { getNode, setNodeContent } from '../entity-blocks/node-ops'
import { upgradeLayout } from '../entity-blocks/node-tree'
import { planDraftSnapshot } from './draft-revision'
import { applyRemote, createClientUndo, encodeState, reconcileDoc, serializeLayout, toYDoc } from './node-ydoc'

const localId = 'nlocal001'
const peerId = 'npeer0001'
const unknownId = 'nopaque01'
const unknownContent = { z: [' leading  space ', { q: '雪', a: null }], a: 0 }
const unknownStyle = { align: 'center' as const }
const tree = {
  rows: [{ id: 'r1', columns: 1 as const, cells: [[
    { nid: localId, type: 'text', content: { body: 'first' } },
    { nid: peerId, type: 'text', content: { body: 'second' } },
    { nid: unknownId, type: 'retiredBlock', content: unknownContent, style: unknownStyle },
  ]] }],
  bench: [],
}

it.each([
  [0, 0, { status: 'ready', baseRevision: 0, nextRevision: 1 }],
  [7, 7, { status: 'ready', baseRevision: 7, nextRevision: 8 }],
  [6, 7, { status: 'conflict', currentRevision: 7 }],
  [8, 7, { status: 'conflict', currentRevision: 7 }],
  [-1, 0, { status: 'invalid-revision' }],
  [0, 1.5, { status: 'invalid-revision' }],
  [Number.NaN, 0, { status: 'invalid-revision' }],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, { status: 'invalid-revision' }],
] as const)('plans base revision %s against stored revision %s', (baseRevision, currentRevision, expected) => {
  const doc = toYDoc(tree)
  try {
    expect(planDraftSnapshot({ doc, kind: 'space', baseRevision, currentRevision })).toMatchObject(expected)
  } finally {
    doc.destroy()
  }
})

it('rejects an invalid document at the correct revision', () => {
  const doc = new Y.Doc()
  try {
    expect(planDraftSnapshot({ doc, kind: 'space', baseRevision: 0, currentRevision: 0 }))
      .toEqual({ status: 'invalid-document' })
  } finally {
    doc.destroy()
  }
})

it.each(['legacy', 'native'] as const)('keeps distinct same-type placements and their IDs for a %s layout', (shape) => {
  const input = shape === 'native' ? tree : {
    rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }],
    content: { text: { body: 'legacy first' } },
  }
  const upgraded = upgradeLayout(input)
  expect(upgraded).not.toBeNull()
  const first = upgraded!.rows[0].cells[0].slice(0, 2)
  expect(first[0].nid).not.toBe(first[1].nid)
  expect(first.map((node) => node.nid))
    .toEqual(upgradeLayout(upgraded)!.rows[0].cells[0].slice(0, 2).map((node) => node.nid))
  expect(first.map((node) => node.content?.body))
    .toEqual(shape === 'native' ? ['first', 'second'] : ['legacy first', undefined])
})

it('keeps opaque unknown payload bytes and peer edits when preparing an undo', () => {
  const doc = toYDoc(tree)
  const peer = new Y.Doc()
  const undo = createClientUndo(doc)
  try {
    applyRemote(peer, encodeState(doc))
    reconcileDoc(doc, setNodeContent(serializeLayout(doc), localId, { body: 'local edit' }))
    undo.stopCapturing()
    reconcileDoc(peer, setNodeContent(serializeLayout(peer), peerId, { body: 'peer edit' }))
    applyRemote(doc, encodeState(peer))
    undo.undo()

    const restored = serializeLayout(doc)
    expect(getNode(restored, localId)?.content).toEqual({ body: 'first' })
    expect(getNode(restored, peerId)?.content).toEqual({ body: 'peer edit' })
    expect(planDraftSnapshot({ doc, kind: 'space', baseRevision: 2, currentRevision: 3 }))
      .toEqual({ status: 'conflict', currentRevision: 3 })
    const accepted = planDraftSnapshot({ doc, kind: 'space', baseRevision: 3, currentRevision: 3 })
    expect(accepted.status).toBe('ready')
    if (accepted.status !== 'ready') return
    const opaque = getNode(accepted.tree, unknownId)
    expect(opaque?.type).toBe('retiredBlock')
    expect(JSON.stringify(opaque?.content)).toBe(JSON.stringify(unknownContent))
    expect(JSON.stringify(opaque?.style)).toBe(JSON.stringify(unknownStyle))
  } finally {
    undo.destroy()
    doc.destroy()
    peer.destroy()
  }
})
