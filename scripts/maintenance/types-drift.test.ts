import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { byObject, diffTypes, driftedObjects, readPayload, report, TYPES_PATH } from './types-drift.mjs'

// ─────────────────────────────────────────────────────────────────────────────────────────────
// HYG-052 — does lib/database.types.ts still describe the LIVE database?
//
// Every other gate in this repo checks that the CODE agrees with the FILE. None checked that the
// FILE agrees with the DATABASE, so the file drifted and nothing went red. The detector below is
// therefore driven against BROKEN inputs rather than assumed to fire, the same discipline
// check-stored-blocks.test.ts applies to the block census.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const ROOT = path.join(import.meta.dirname, '..', '..')

const TABLE = (extra = '') => `export type Database = {
  public: {
    Tables: {
      claim_outbox_jobs: {
        Row: {
          id: string
${extra}        }
      }
    }
  }
}`

describe('the detector fires on real drift', () => {
  it('🔴 names a column the database has and the file does not', () => {
    const r = diffTypes(TABLE(), TABLE('          dedupe_key: string | null\n'))
    expect(r.drifted).toBe(true)
    expect(r.onlyLive).toEqual(['          dedupe_key: string | null'])
    expect(r.onlyCommitted).toEqual([])
  })

  it('🔴 names a column the file has and the database does not — drift runs both ways', () => {
    const r = diffTypes(TABLE('          ghost: string\n'), TABLE())
    expect(r.drifted).toBe(true)
    expect(r.onlyCommitted).toEqual(['          ghost: string'])
  })

  // 🔴 THE FIRST DRAFT ATTRIBUTED ORPHANS BY CONTENT and named all ~600 objects in the file,
  // because the orphan set includes lines like `}`, `Args: {` and `Returns: Json` that sit under
  // hundreds of them. A report that names everything names nothing.
  it('names the OBJECT that differs, not every object containing a similar line', () => {
    const d = driftedObjects(TABLE(), TABLE('          dedupe_key: string | null\n'))
    expect(d.changed).toEqual(['Tables.claim_outbox_jobs'])
    expect(d.onlyLive).toEqual([])
  })

  it('separates an object the database has entirely from one merely described differently', () => {
    // Built explicitly rather than by string-splicing: a first attempt inserted the new table
    // BEFORE the closing braces, which are lines the parser attributes to the table above it, so
    // the fixture reported a spurious change in a table it had not touched.
    const two = (extra: string) => `export type Database = {
  public: {
    Tables: {
      claim_outbox_jobs: {
        Row: {
          id: string
        }
      }
${extra}    }
  }
}`
    const d = driftedObjects(two(''), two('      brand_new: {\n        Row: {\n          id: string\n        }\n      }\n'))
    expect(d.onlyLive).toEqual(['Tables.brand_new'])
    expect(d.changed).toEqual([])
  })

  it('keys an object by its SECTION, so a table and a function may share a name', () => {
    expect([...byObject(TABLE()).keys()]).toContain('Tables.claim_outbox_jobs')
  })

  it('reports the repair, not just the finding', () => {
    const r = report({ committed: TABLE(), live: TABLE('          dedupe_key: string | null\n') })
    expect(r.drifted).toBe(true)
    expect(r.text).toContain('claim_outbox_jobs')
    expect(r.text).toContain('supabase gen types typescript')
  })
})

describe('the detector does NOT fire on things that are not drift', () => {
  // ⚠️ THE POSITIVE CONTROL THAT MATTERS. On the first real run `cron_run_markers` moved ~390
  // lines with no schema change behind it. A detector that called that drift would have been noise
  // from its first day, and noise is how a check stops being read (ADR-970).
  it('ignores a pure REORDER of the same objects', () => {
    const a = 'export type Database = {\n  A: 1\n  B: 2\n}'
    const b = 'export type Database = {\n  B: 2\n  A: 1\n}'
    expect(diffTypes(a, b).drifted).toBe(false)
  })

  it('ignores blank lines and TRAILING whitespace', () => {
    expect(diffTypes('a\n\n  b  \n', 'a\n  b\n').drifted).toBe(false)
  })

  // ⚠️ LEADING whitespace is deliberately NOT ignored, and the first draft of this test assumed it
  // was. Indentation in the generated file encodes NESTING DEPTH — the same `id: string` under a
  // table, under that table's `Insert`, and under a function's `Args` are three different facts.
  // Collapsing them would let a real structural change pass as formatting, which is the failure
  // this whole step exists to catch.
  it('🔴 treats a change of nesting depth as drift, not as formatting', () => {
    expect(diffTypes('a\n  b\n', 'a\n        b\n').drifted).toBe(true)
  })

  it('reports a match plainly when the two agree', () => {
    expect(report({ committed: TABLE(), live: TABLE() }).text).toContain('matches the live schema')
  })
})

describe('it refuses to guess when it cannot look', () => {
  // 🔴 An unreadable payload is INDETERMINATE, never "no drift" — the exact failure ADR-970 names.
  it('returns null for a payload carrying no types string', () => {
    expect(readPayload('{"error":"unauthorized"}')).toBeNull()
    expect(readPayload('{"types":""}')).toBeNull()
  })

  it('unwraps the API shape, and accepts an already-unwrapped source', () => {
    expect(readPayload('{"types":"export type X = 1"}')).toBe('export type X = 1')
    expect(readPayload('export type X = 1')).toBe('export type X = 1')
  })

  it('builds the Management API path the workflow fetches', () => {
    expect(TYPES_PATH('abc123')).toBe('/v1/projects/abc123/types/typescript')
  })
})

describe('the real committed file is the shape the detector expects', () => {
  // A floor, so a detector pointed at a file it can no longer parse cannot pass by finding nothing.
  it('parses lib/database.types.ts and finds its top-level objects', () => {
    const src = readFileSync(path.join(ROOT, 'lib/database.types.ts'), 'utf8')
    expect(src).toContain('export type Database')
    const keys = [...byObject(src).keys()]
    expect(keys, 'expected the six-space declarations the object-namer keys on').toContain('Tables.profiles')
    expect(keys.length).toBeGreaterThan(200)
  })
})
