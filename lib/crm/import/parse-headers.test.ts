import { describe, it, expect, vi } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// FIX 5 — duplicate CSV header de-dup. `papaparse` isn't installed in this sandbox, so we mock it
// with a tiny array-of-arrays splitter (parse.ts now parses WITHOUT header mode and builds the row
// objects itself). This isolates the header de-dup logic from Papa, mirroring xlsx.ts's behavior:
// a repeated column name is suffixed ("Email" -> "Email 2") so a second same-named column is never
// collapsed onto the first (last-wins data loss).
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('papaparse', () => ({
  default: {
    parse: (input: unknown) => {
      const rows = String(input)
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .map((l) => l.split(','))
      return { data: rows }
    },
  },
}))

import { parseCsvText } from './parse'

describe('parseCsvText — duplicate header de-dup', () => {
  it('suffixes a repeated header so the second column is not collapsed away', () => {
    const src = parseCsvText('Name,Email,Email\nSarah,a@x.com,b@x.com')
    expect(src.headers).toEqual(['Name', 'Email', 'Email 2'])
    expect(src.rows[0]).toEqual({ Name: 'Sarah', Email: 'a@x.com', 'Email 2': 'b@x.com' })
  })

  it('leaves unique headers untouched', () => {
    const src = parseCsvText('Name,Email\nAda,ada@x.com')
    expect(src.headers).toEqual(['Name', 'Email'])
    expect(src.rows[0]).toEqual({ Name: 'Ada', Email: 'ada@x.com' })
  })

  it('handles three same-named columns (Email, Email 2, Email 3)', () => {
    const src = parseCsvText('Email,Email,Email\na@x.com,b@x.com,c@x.com')
    expect(src.headers).toEqual(['Email', 'Email 2', 'Email 3'])
    expect(src.rows[0]).toEqual({ Email: 'a@x.com', 'Email 2': 'b@x.com', 'Email 3': 'c@x.com' })
  })
})
