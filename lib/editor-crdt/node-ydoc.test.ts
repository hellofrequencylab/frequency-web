import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as Y from 'yjs'
import { upgradeLayout, type NodeLayout } from '../entity-blocks/node-tree'
import {
  applyRemote, createClientUndo, editLocal, encodeState, reconcileDoc, serializeLayout, toYDoc,
} from './node-ydoc'

type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const CORPUS = JSON.parse(readFileSync('scripts/entity-layout-corpus.json', 'utf8')) as { documents: Array<Row> }

function rehydrate(d: Row) {
  const bag = (fields: string[], t: string) => Object.fromEntries(fields.map((f) => [f, `${t}.${f}`]))
  const doc: Record<string, unknown> = { rows: d.rows.map((r: object) => ({ ...r })) }
  if (Object.keys(d.contentKeys).length) doc.content = Object.fromEntries(Object.entries(d.contentKeys).map(([t, f]) => [t, bag(f as string[], t)]))
  if (Object.keys(d.styleKeys).length) doc.style = Object.fromEntries(Object.entries(d.styleKeys).map(([t, f]) => [t, bag(f as string[], t)]))
  if (d.hidden.length) doc.hidden = [...d.hidden]
  return doc
}

// key-order-insensitive canonical form
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x)

const LAYOUTS = CORPUS.documents.map((d) => upgradeLayout(rehydrate(d))).filter((l): l is NodeLayout => !!l)

describe('node tree <-> Y.Doc', () => {
  it('covers the whole frozen corpus', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(30)
  })
  it('round-trips every corpus document exactly', () => {
    for (const l of LAYOUTS) expect(canon(serializeLayout(toYDoc(l)))).toBe(canon(l))
  })
  it('survives a state encode and decode into a fresh doc', () => {
    for (const l of LAYOUTS) {
      const b = new Y.Doc()
      applyRemote(b, encodeState(toYDoc(l)))
      expect(canon(serializeLayout(b))).toBe(canon(l))
    }
  })
  it('reads a corrupt peer document as empty rather than throwing', () => {
    const d = new Y.Doc()
    d.getMap('layout').set('rows', 'nope')
    expect(serializeLayout(d)).toEqual({ rows: [], bench: [] })
  })
})

describe('two clients', () => {
  const base = LAYOUTS.find((l) => l.rows.some((r) => r.cells.flat().length > 1)) ?? LAYOUTS[0]
  const pair = () => {
    const a = toYDoc(base)
    const b = new Y.Doc()
    applyRemote(b, encodeState(a))
    const relay = (from: Y.Doc, to: Y.Doc) => from.on('update', (u: Uint8Array, origin: unknown) => { if (origin !== 'remote') applyRemote(to, u) })
    relay(a, b); relay(b, a)
    return { a, b }
  }
  type AnyVal = any // eslint-disable-line @typescript-eslint/no-explicit-any
  const firstNode = (d: Y.Doc) => ((d.getMap('layout').get('rows') as Y.Array<Y.Map<AnyVal>>).get(0).get('cells') as Y.Array<Y.Array<Y.Map<AnyVal>>>).get(0).get(0)

  it('converge when they edit different fields of one block', () => {
    const { a, b } = pair()
    editLocal(a, () => { (firstNode(a).get('content') ?? firstNode(a).set('content', new Y.Map())).set?.('alpha', 1) })
    editLocal(b, () => { (firstNode(b).get('content') ?? firstNode(b).set('content', new Y.Map())).set?.('beta', 2) })
    expect(canon(serializeLayout(a))).toBe(canon(serializeLayout(b)))
    const c = serializeLayout(a).rows[0].cells[0][0].content as Record<string, unknown>
    expect(c.alpha).toBe(1)
    expect(c.beta).toBe(2)
  })
  it('undo reverts only your own edit', () => {
    const { a, b } = pair()
    const undoA = createClientUndo(a)
    editLocal(a, (r) => { (r.get('meta') as Y.Map<unknown>).set('template', 'from-a') })
    editLocal(b, (r) => { (r.get('meta') as Y.Map<unknown>).set('other', 'from-b') })
    undoA.undo()
    const metaB = b.getMap('layout').get('meta') as Y.Map<unknown>
    expect(metaB.get('template')).toBeUndefined()
    expect(metaB.get('other')).toBe('from-b')
  })
})

describe('reconcileDoc', () => {
  const rich = LAYOUTS.find((l) => l.rows.length > 1 && l.rows.some((r) => r.cells.flat().length > 1)) ?? LAYOUTS[0]
  const clone = (l: NodeLayout): NodeLayout => JSON.parse(JSON.stringify(l))

  it('writes any corpus document onto an empty doc and onto a different one', () => {
    for (const l of LAYOUTS) {
      const d = new Y.Doc()
      reconcileDoc(d, l)
      expect(canon(serializeLayout(d))).toBe(canon(l))
      reconcileDoc(d, rich)
      expect(canon(serializeLayout(d))).toBe(canon(rich))
    }
  })
  it('is a no-op for an unchanged layout', () => {
    const d = toYDoc(rich)
    let updates = 0
    d.on('update', () => { updates++ })
    reconcileDoc(d, clone(rich))
    expect(updates).toBe(0)
  })
  it('reorders, removes and adds rows', () => {
    const d = toYDoc(rich)
    const next = clone(rich)
    next.rows.reverse()
    reconcileDoc(d, next)
    expect(canon(serializeLayout(d))).toBe(canon(next))
    next.rows = next.rows.slice(1)
    reconcileDoc(d, next)
    expect(canon(serializeLayout(d))).toBe(canon(next))
    reconcileDoc(d, rich)
    expect(canon(serializeLayout(d))).toBe(canon(rich))
  })
  it('handles bench changes and the template', () => {
    const d = toYDoc(rich)
    const next = clone(rich)
    next.bench = []
    next.template = 'other'
    reconcileDoc(d, next)
    expect(canon(serializeLayout(d))).toBe(canon(next))
  })
  it('keeps a peer edit to a field the local change did not touch', () => {
    const a = toYDoc(rich)
    const b = new Y.Doc()
    applyRemote(b, encodeState(a))
    // peer b restyles the first node
    const node = (d: Y.Doc) => ((d.getMap('layout').get('rows') as Y.Array<Y.Map<any>>).get(0).get('cells') as Y.Array<Y.Array<Y.Map<any>>>).get(0).get(0) // eslint-disable-line @typescript-eslint/no-explicit-any
    node(b).set('hidden', true)
    // local a changes only the template
    const next = clone(rich)
    next.template = 'changed'
    reconcileDoc(a, next)
    applyRemote(a, encodeState(b))
    applyRemote(b, encodeState(a))
    expect(canon(serializeLayout(a))).toBe(canon(serializeLayout(b)))
    expect(node(a).get('hidden')).toBe(true)
    expect(serializeLayout(a).template).toBe('changed')
  })
})
