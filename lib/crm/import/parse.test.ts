import { describe, it, expect } from 'vitest'
import { sourceFromContacts, mergeSources, looksLikeTable, EXTRACTED_HEADERS } from './parse'
import type { ParsedSource } from './types'

// The client-safe staging helpers: AI-extracted contacts -> a ParsedSource, many files
// merged into one column set, and the table-vs-freetext heuristic that routes a file.

describe('sourceFromContacts', () => {
  it('projects extracted contacts onto the canonical headers, dropping empty rows', () => {
    const src = sourceFromContacts([
      { name: 'A', email: 'a@x.com', phone: '', company: '', notes: '' },
      {}, // all-empty -> dropped
      { phone: '555-2222' },
    ])
    expect(src.headers).toEqual([...EXTRACTED_HEADERS])
    expect(src.rows).toHaveLength(2)
    expect(src.rows[0]).toEqual({ Name: 'A', Email: 'a@x.com', Phone: '', Company: '', Notes: '' })
    expect(src.rows[1].Phone).toBe('555-2222')
    expect(src.rowCount).toBe(2)
  })
})

describe('mergeSources', () => {
  it('unions headers (first-seen order) and pads every row across files', () => {
    const a: ParsedSource = { headers: ['Name', 'Email'], rows: [{ Name: 'A', Email: 'a@x.com' }], rowCount: 1 }
    const b: ParsedSource = {
      headers: ['Email', 'Phone'],
      rows: [{ Email: 'b@x.com', Phone: '555' }],
      rowCount: 1,
    }
    const merged = mergeSources([a, b])
    expect(merged.headers).toEqual(['Name', 'Email', 'Phone'])
    expect(merged.rows).toEqual([
      { Name: 'A', Email: 'a@x.com', Phone: '' },
      { Name: '', Email: 'b@x.com', Phone: '555' },
    ])
    expect(merged.rowCount).toBe(2)
  })

  it('handles an empty list', () => {
    expect(mergeSources([])).toEqual({ headers: [], rows: [], rowCount: 0 })
  })
})

describe('looksLikeTable', () => {
  it('is true for a multi-column table with rows', () => {
    expect(looksLikeTable({ headers: ['Name', 'Email'], rows: [{ Name: 'A', Email: 'a' }], rowCount: 1 })).toBe(true)
  })
  it('is false for a single-column blob or an empty parse (routes to AI extraction)', () => {
    expect(looksLikeTable({ headers: ['line'], rows: [{ line: 'just a note' }], rowCount: 1 })).toBe(false)
    expect(looksLikeTable({ headers: [], rows: [], rowCount: 0 })).toBe(false)
  })
})
