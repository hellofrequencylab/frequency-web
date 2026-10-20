import { describe, expect, it } from 'vitest'
import { parseEntityLayout } from './layout'
import { ownerNodeLayout } from './node-seed'

describe('ownerNodeLayout', () => {
  it('reads a stored document as nodes and keeps two Text bags apart', () => {
    const saved = parseEntityLayout({
      rows: [{ id: 'r1', columns: 1, cells: [['text', 'text']] }],
      content: { text: { text: 'Only the first' } },
    })
    const out = ownerNodeLayout(saved, { text: { text: 'must not leak' } })
    const [a, b] = out.rows[0].cells[0]
    expect(a.content).toEqual({ text: 'Only the first' })
    expect(b.content).toBeUndefined()
  })

  it('fills a data block with its effective content, node content winning', () => {
    const saved = parseEntityLayout({
      rows: [{ id: 'r1', columns: 1, cells: [['about']] }],
      content: { about: { title: 'Mine' } },
    })
    const out = ownerNodeLayout(saved, { about: { title: 'Default', body: 'From the profile' } })
    expect(out.rows[0].cells[0][0].content).toEqual({ title: 'Mine', body: 'From the profile' })
  })

  it('gives a Space with no saved layout the starter rows as nodes', () => {
    const out = ownerNodeLayout(null)
    expect(out.rows.length).toBeGreaterThan(0)
  })
})
