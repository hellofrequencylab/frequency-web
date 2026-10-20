import { describe, expect, it } from 'vitest'
import { upgradeLayout } from './node-tree'
import {
  addNodeRow,
  moveNodeRow,
  removeNodeRow,
  setNodeRowColumns,
  setNodeRowHeaderOn,
  setNodeRowMargin,
  setNodeRowRatio,
  setNodeRowTitle,
} from './node-row-ops'

const doc = () =>
  upgradeLayout({
    rows: [
      { id: 'r1', columns: 2, cells: [['text'], ['quote']] },
      { id: 'r2', columns: 1, cells: [['heading']] },
    ],
    content: { text: { text: 'Keep me' } },
  })!

describe('node row ops', () => {
  it('adds an empty row at an index and respects the cap', () => {
    const out = addNodeRow(doc(), 1)
    expect(out.rows).toHaveLength(3)
    expect(out.rows[1].cells).toEqual([[]])
    let full = doc()
    for (let i = 0; i < 40; i++) full = addNodeRow(full)
    expect(full.rows.length).toBe(24)
  })

  it('removes a row and benches its nodes with their content', () => {
    const out = removeNodeRow(doc(), 'r1')
    expect(out.rows.map((r) => r.id)).toEqual(['r2'])
    expect(out.bench.map((n) => n.type).sort()).toEqual(['quote', 'text'])
    expect(out.bench.find((n) => n.type === 'text')!.content).toEqual({ text: 'Keep me' })
    expect(removeNodeRow(doc(), 'nope')).toEqual(doc())
  })

  it('moves a row and clamps the destination', () => {
    expect(moveNodeRow(doc(), 0, 1).rows.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(moveNodeRow(doc(), 0, 99).rows.map((r) => r.id)).toEqual(['r2', 'r1'])
    expect(moveNodeRow(doc(), 7, 0)).toEqual(doc())
  })

  it('folds a narrowed row onto its last column so no node is lost', () => {
    const out = setNodeRowColumns(doc(), 'r1', 1)
    expect(out.rows[0].columns).toBe(1)
    expect(out.rows[0].cells[0].map((n) => n.type)).toEqual(['text', 'quote'])
    const wide = setNodeRowColumns(doc(), 'r2', 3)
    expect(wide.rows[1].cells).toHaveLength(3)
  })

  it('sets a ratio on a 2-column row only and clears it when leaving 2 columns', () => {
    const lead = setNodeRowRatio(doc(), 'r1', 'lead')
    expect(lead.rows[0].ratio).toBe('lead')
    expect(setNodeRowRatio(doc(), 'r2', 'lead').rows[1].ratio).toBeUndefined()
    expect(setNodeRowColumns(lead, 'r1', 1).rows[0].ratio).toBeUndefined()
    expect(setNodeRowRatio(lead, 'r1', 'even').rows[0].ratio).toBeUndefined()
  })

  it('keeps the header toggle only beside a title', () => {
    const titled = setNodeRowHeaderOn(setNodeRowTitle(doc(), 'r1', 'Hello'), 'r1', true)
    expect(titled.rows[0].headerOn).toBe(true)
    expect(setNodeRowTitle(titled, 'r1', '  ').rows[0].headerOn).toBeUndefined()
    expect(setNodeRowHeaderOn(doc(), 'r1', true).rows[0].headerOn).toBeUndefined()
  })

  it('sets and clears a margin', () => {
    const out = setNodeRowMargin(doc(), 'r1', 'mt', 'lg')
    expect(out.rows[0].mt).toBe('lg')
    expect(setNodeRowMargin(out, 'r1', 'mt', 'none').rows[0].mt).toBeUndefined()
  })
})
