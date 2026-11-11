import { describe, expect, it } from 'vitest'
import type { Data } from '@/lib/page-editor/types'
import type { NodeLayout } from '@/lib/entity-blocks/node-tree'
import { restoreSection, restoreWhole, sectionOutline, type HistoryDoc } from './history-restore'

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const v of Object.values(value)) freeze(v)
  }
  return value
}

// A block whose type left the library, with key order and odd values that a sanitizer would disturb.
const UNKNOWN = { type: 'RetiredMarquee', props: { id: 'u1', zeta: 1, alpha: [null, { deep: '' }], speed: -0 } }

const pageOld: Data = {
  root: { props: { title: 'About' } },
  content: [
    { type: 'Hero', props: { id: 'h1', headline: 'We started small' } },
    UNKNOWN,
    { type: 'Text', props: { id: 't1', body: 'First words' } },
  ],
  zones: { 'Columns-1:left': [{ type: 'Card', props: { id: 'c1', title: 'Left card' } }] },
}

const pageNew: Data = {
  root: { props: { title: 'About us' } },
  content: [
    { type: 'Hero', props: { id: 'h1', headline: 'We grew', image: 'x.png' } },
    { ...UNKNOWN, props: { ...UNKNOWN.props, zeta: 2 } },
    { type: 'Text', props: { id: 't1', body: 'New words' } },
  ],
  zones: { 'Columns-1:left': [{ type: 'Card', props: { id: 'c1', title: 'Renamed' } }] },
}

const layoutOld: NodeLayout = {
  rows: [{ id: 'r1', columns: 2, cells: [[{ nid: 'naaaaaa1', type: 'about', content: { title: 'Old about' } }], [{ nid: 'nbbbbbb1', type: 'ghostBlock', content: { z: 1, a: [2] } }]] }],
  bench: [{ nid: 'ncccccc1', type: 'story', content: { body: 'kept' } }],
}

const layoutNew: NodeLayout = {
  rows: [{ id: 'r1', columns: 2, cells: [[{ nid: 'naaaaaa1', type: 'about', content: { title: 'New about' }, hidden: true }], [{ nid: 'nbbbbbb1', type: 'ghostBlock', content: { z: 9 } }]] }],
  bench: [{ nid: 'ncccccc1', type: 'story' }],
}

const ids = (doc: HistoryDoc) => sectionOutline(doc, doc).map((s) => s.id)

const CASES: [string, HistoryDoc, HistoryDoc][] = [
  ['page, back to the older version', freeze(pageNew), freeze(pageOld)],
  ['page, forward to the newer version', freeze(pageOld), freeze(pageNew)],
  ['node tree, back to the older version', freeze(layoutNew), freeze(layoutOld)],
  ['node tree, forward to the newer version', freeze(layoutOld), freeze(layoutNew)],
]

describe('Restore produces a document equal to the chosen version', () => {
  it.each(CASES)('whole page: %s', (_name, _draft, version) => {
    const doc = restoreWhole(version)
    expect(doc).toEqual(version)
    expect(JSON.stringify(doc)).toBe(JSON.stringify(version))
    expect(doc).not.toBe(version)
  })

  it.each(CASES)('every section in turn: %s', (_name, draft, version) => {
    let doc: HistoryDoc = draft
    for (const id of ids(version)) {
      const r = restoreSection(doc, version, id)
      if (!r.ok) throw new Error(r.reason)
      doc = r.doc
    }
    // The page root is not a section; everything else now matches the version byte for byte.
    if ('content' in version && 'content' in doc) doc = { ...doc, root: version.root }
    expect(JSON.stringify(doc)).toBe(JSON.stringify(version))
  })
})

describe('restoreSection', () => {
  it('changes only the chosen section and keeps an unknown block byte for byte', () => {
    const r = restoreSection(freeze(pageNew), freeze(pageOld), 'h1')
    if (!r.ok) throw new Error(r.reason)
    const doc = r.doc as Data
    expect(doc.content[0]).toEqual(pageOld.content[0])
    expect(JSON.stringify(doc.content[1])).toBe(JSON.stringify(pageNew.content[1]))
    expect(doc.content[2]).toBe(pageNew.content[2])
    expect(doc.zones).toBe(pageNew.zones)
    expect(r.inserted).toBe(false)
  })

  it('restores an unknown block from the version exactly as stored', () => {
    const r = restoreSection(freeze(pageNew), freeze(pageOld), 'u1')
    if (!r.ok) throw new Error(r.reason)
    expect(JSON.stringify((r.doc as Data).content[1])).toBe(JSON.stringify(UNKNOWN))
  })

  it('puts a deleted section back where the version had it', () => {
    const draft: Data = freeze({ root: {}, content: [pageOld.content[0], pageOld.content[2]] })
    const r = restoreSection(draft, freeze(pageOld), 'u1')
    if (!r.ok) throw new Error(r.reason)
    expect((r.doc as Data).content.map((c) => c.props.id)).toEqual(['h1', 'u1', 't1'])
    expect(r.inserted).toBe(true)
  })

  it('puts a deleted node back in its row, or on the bench when the row is gone', () => {
    const noRow: NodeLayout = freeze({ rows: [], bench: [] })
    const r = restoreSection(noRow, freeze(layoutOld), 'nbbbbbb1')
    if (!r.ok) throw new Error(r.reason)
    expect((r.doc as NodeLayout).bench).toEqual([layoutOld.rows[0].cells[1][0]])

    const emptyCol: NodeLayout = freeze({ rows: [{ id: 'r1', columns: 2, cells: [[], []] }], bench: [] })
    const back = restoreSection(emptyCol, freeze(layoutOld), 'nbbbbbb1')
    if (!back.ok) throw new Error(back.reason)
    expect((back.doc as NodeLayout).rows[0].cells[1]).toEqual([layoutOld.rows[0].cells[1][0]])
  })

  it('refuses a section the version does not have, and mixed shapes', () => {
    expect(restoreSection(pageNew, pageOld, 'nope')).toEqual({ ok: false, reason: 'missing' })
    expect(restoreSection(pageNew, layoutOld, 'naaaaaa1')).toEqual({ ok: false, reason: 'shape' })
    expect(restoreWhole({ nope: true })).toBeNull()
  })
})

describe('sectionOutline', () => {
  it('marks each version section against the draft', () => {
    const draft: Data = { root: {}, content: [pageOld.content[0], { type: 'Text', props: { id: 't1', body: 'edited' } }] }
    expect(sectionOutline(pageOld, draft).map((s) => [s.id, s.state, s.label])).toEqual([
      ['h1', 'same', 'We started small'],
      ['u1', 'missing', 'RetiredMarquee'],
      ['t1', 'changed', 'Text'],
      ['c1', 'missing', 'Left card'],
    ])
  })
})
