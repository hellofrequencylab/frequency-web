import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  DIRECTORY_PAGE_SIZE,
  directoryPageCount,
  directoryWindow,
  isDirectoryRole,
  parseDirectoryPage,
  scopeDirectoryQuery,
  scopeIsEmpty,
  type DirectoryQuery,
} from './directory-page'
import { ONLINE_MS } from '@/lib/presence'

// LIVE-661: the /network directory filters in the query and pages with a range, so a member past
// the old 500-row cap can be found and reached. Two halves: the pure rules (what one read asks the
// database for, and where a page lands), and the page's source shape (it uses them).

type Call = [string, ...unknown[]]

// A recording stand-in for the PostgREST builder: every call is logged and returns the builder.
interface Recorder extends DirectoryQuery<Recorder> {
  calls: Call[]
}
function recorder(): Recorder {
  const calls: Call[] = []
  const q: Recorder = {
    calls,
    eq: (...a) => (calls.push(['eq', ...a]), q),
    in: (...a) => (calls.push(['in', ...a]), q),
    gte: (...a) => (calls.push(['gte', ...a]), q),
    contains: (...a) => (calls.push(['contains', ...a]), q),
    or: (...a) => (calls.push(['or', ...a]), q),
    not: (...a) => (calls.push(['not', ...a]), q),
  }
  return q
}

// An in-memory evaluator for the same calls, so a test can ask the consequence directly: given a
// community larger than the old cap, does the scoped read find the member at the far end?
type Row = {
  id: string
  display_name: string
  handle: string
  is_active: boolean
  directory_visible: boolean
  ghost_mode: boolean
  is_demo: boolean
  community_role: string | null
  entity_types: string[] | null
  last_seen_at: string | null
  nexus_region_id: string | null
}
function evaluate(rows: Row[], calls: Call[]): Row[] {
  const like = (v: string, pat: string) => v.toLowerCase().includes(pat.replace(/^%|%$/g, '').replace(/\\(.)/g, '$1').toLowerCase())
  return rows.filter((r) =>
    calls.every(([op, col, a, b]) => {
      const v = (r as unknown as Record<string, unknown>)[col as string]
      if (op === 'eq') return v === a
      if (op === 'in') return (a as unknown[]).includes(v)
      if (op === 'gte') return typeof v === 'string' && v >= (a as string)
      if (op === 'not') return !String(b).slice(1, -1).split(',').includes(String(v))
      if (op === 'contains') {
        const tag = JSON.parse(String(a).slice(1, -1)) as string
        return (r.entity_types ?? []).includes(tag)
      }
      if (op === 'or') {
        return String(col).split(',').some((clause) => {
          const [c, o, ...rest] = clause.split('.')
          const val = rest.join('.')
          const cell = (r as unknown as Record<string, unknown>)[c]
          if (o === 'is') return cell === null
          if (o === 'eq') return cell === val
          if (o === 'ilike') return typeof cell === 'string' && like(cell, val)
          return false
        })
      }
      return false
    }),
  )
}

function community(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i).padStart(4, '0')}`,
    display_name: `Member ${String(i).padStart(4, '0')}`,
    handle: `m${i}`,
    is_active: true,
    directory_visible: true,
    ghost_mode: false,
    is_demo: false,
    community_role: i % 7 === 0 ? 'host' : null,
    entity_types: i % 5 === 0 ? ['breathwork'] : null,
    last_seen_at: null,
    nexus_region_id: null,
  }))
}

describe('scopeDirectoryQuery: every filter runs in the query', () => {
  it('always applies the listing gate (active, listed, not ghosting)', () => {
    const q = recorder()
    scopeDirectoryQuery(q, {})
    expect(q.calls).toEqual([
      ['eq', 'is_active', true],
      ['eq', 'directory_visible', true],
      ['eq', 'ghost_mode', false],
    ])
  })

  it('finds a member past the old 500-row cap by name', () => {
    const rows = community(900)
    const q = recorder()
    scopeDirectoryQuery(q, { q: 'member 0842' })
    expect(evaluate(rows, q.calls).map((r) => r.id)).toEqual(['p0842'])
  })

  it('never lists an opted-out or ghosting member, even by exact name', () => {
    const rows = community(10)
    rows[3].directory_visible = false
    rows[4].ghost_mode = true
    for (const name of ['Member 0003', 'Member 0004']) {
      const q = recorder()
      scopeDirectoryQuery(q, { q: name })
      expect(evaluate(rows, q.calls)).toEqual([])
    }
  })

  it('sanitises the search term into one or() clause over name and handle', () => {
    const q = recorder()
    scopeDirectoryQuery(q, { q: '  a,b)(c%  ' })
    const or = q.calls.find((c) => c[0] === 'or')
    expect(or?.[1]).toBe('display_name.ilike.%a b  c\\%%,handle.ilike.%a b  c\\%%')
  })

  it('maps the Member facet onto null rungs too, and other rungs exactly', () => {
    const rows = community(14)
    const member = recorder()
    scopeDirectoryQuery(member, { role: 'member' })
    expect(evaluate(rows, member.calls).length).toBe(12)
    const host = recorder()
    scopeDirectoryQuery(host, { role: 'host' })
    expect(evaluate(rows, host.calls).map((r) => r.id)).toEqual(['p0000', 'p0007'])
  })

  it('quotes the topic as one array element', () => {
    const q = recorder()
    scopeDirectoryQuery(q, { topic: 'a,"b}' })
    expect(q.calls.find((c) => c[0] === 'contains')).toEqual(['contains', 'entity_types', '{"a,\\"b}"}'])
    const rows = community(20)
    const t = recorder()
    scopeDirectoryQuery(t, { topic: 'breathwork' })
    expect(evaluate(rows, t.calls).length).toBe(4)
  })

  it('reads Online now as a last_seen_at cutoff', () => {
    const q = recorder()
    scopeDirectoryQuery(q, { online: true, now: 1_000_000_000 })
    expect(q.calls).toContainEqual(['gte', 'last_seen_at', new Date(1_000_000_000 - ONLINE_MS).toISOString()])
  })

  it('applies the demo gate, the region ids, and the id include / exclude lists', () => {
    const q = recorder()
    scopeDirectoryQuery(q, { hideDemo: true, regionIds: ['r1'], onlyIds: ['a', 'b'], excludeIds: ['c', 'd'] })
    expect(q.calls).toContainEqual(['eq', 'is_demo', false])
    expect(q.calls).toContainEqual(['in', 'nexus_region_id', ['r1']])
    expect(q.calls).toContainEqual(['in', 'id', ['a', 'b']])
    expect(q.calls).toContainEqual(['not', 'id', 'in', '(c,d)'])
  })
})

describe('scopeIsEmpty', () => {
  it('answers an empty id or region set, or a role that is not a rung, without a read', () => {
    expect(scopeIsEmpty({})).toBe(false)
    expect(scopeIsEmpty({ onlyIds: [] })).toBe(true)
    expect(scopeIsEmpty({ regionIds: [] })).toBe(true)
    expect(scopeIsEmpty({ role: 'wizard' })).toBe(true)
    expect(scopeIsEmpty({ role: 'guide' })).toBe(false)
    expect(isDirectoryRole('member')).toBe(true)
    expect(isDirectoryRole('')).toBe(false)
  })
})

describe('paging', () => {
  it('parses ?page= to a positive integer', () => {
    expect(parseDirectoryPage(undefined)).toBe(1)
    expect(parseDirectoryPage('3')).toBe(3)
    expect(parseDirectoryPage('0')).toBe(1)
    expect(parseDirectoryPage('-2')).toBe(1)
    expect(parseDirectoryPage('2.5')).toBe(1)
    expect(parseDirectoryPage('abc')).toBe(1)
  })

  it('ranges straight through the alphabetical read with no nearby lead', () => {
    expect(directoryWindow(1, 48, 0)).toEqual({ lead: null, rest: { from: 0, to: 47 } })
    expect(directoryWindow(12, 48, 0)).toEqual({ lead: null, rest: { from: 528, to: 575 } })
  })

  it('puts the nearby lead first and shifts the alphabetical range by its length', () => {
    expect(directoryWindow(1, 48, 10)).toEqual({ lead: [0, 10], rest: { from: 0, to: 37 } })
    expect(directoryWindow(2, 48, 10)).toEqual({ lead: null, rest: { from: 38, to: 85 } })
    expect(directoryWindow(1, 48, 60)).toEqual({ lead: [0, 48], rest: null })
    expect(directoryWindow(2, 48, 60)).toEqual({ lead: [48, 60], rest: { from: 0, to: 35 } })
  })

  it('reaches every member of a community larger than the old cap exactly once', () => {
    const total = 1234
    const lead = 17
    const seen: number[] = []
    for (let p = 1; p <= directoryPageCount(total); p++) {
      const w = directoryWindow(p, DIRECTORY_PAGE_SIZE, lead)
      if (w.lead) for (let i = w.lead[0]; i < w.lead[1]; i++) seen.push(i)
      if (w.rest) for (let i = w.rest.from; i <= Math.min(w.rest.to, total - lead - 1); i++) seen.push(lead + i)
    }
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => i))
  })

  it('counts pages, with an empty directory as page 1 of 1', () => {
    expect(directoryPageCount(0)).toBe(1)
    expect(directoryPageCount(48)).toBe(1)
    expect(directoryPageCount(49)).toBe(2)
  })
})

describe('/network uses the paged read', () => {
  const PAGE = readFileSync(path.join(process.cwd(), 'app/(main)/network/page.tsx'), 'utf8')

  it('has no capped slice and no client-side name filter', () => {
    expect(PAGE).not.toContain('DIRECTORY_FETCH_LIMIT')
    expect(PAGE).not.toMatch(/\.toLowerCase\(\)\.includes\(needle\)/)
  })

  it('ranges the alphabetical read and streams it behind Suspense, keyed on the query', () => {
    expect(PAGE).toMatch(/\.range\(from, to\)/)
    expect(PAGE).toMatch(/<Suspense key=\{listingKey\} fallback=\{<DirectoryListingSkeleton \/>\}>/)
  })

  it('carries the page in the URL next to the filters', () => {
    expect(PAGE).toMatch(/p\.set\('page', params\.page\)/)
  })
})
