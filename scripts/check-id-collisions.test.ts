// Non-triviality tests for the cross-PR id collision gate (HYG-111, ADR-1509).
//
// The gate's IO (the pulls listing, the contents API, `git show`) is not what these prove. They
// drive the exported pure functions against fixtures that must FAIL and fixtures that must PASS,
// arm by arm, so the comparison cannot go quietly vacuous: two PR sets colliding, two not
// colliding, and the case the convention exists for — a later PR that renumbered and no longer
// collides. The real ledger is read once as a control that the declaration regex sees it.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  backlogIds,
  decide,
  declaredAdrs,
  fetchFileAt,
  fetchOpenPulls,
  findCollisions,
  idSets,
  newIdSets,
} from './check-id-collisions.mjs'

const ledger = (...ids: string[]) => ids.map((id) => `## ADR-${id}: a decision (ROW-1)\n\n**Status.** Accepted.\n`).join('\n')
const backlog = (...ids: string[]) =>
  JSON.stringify({ meta: {}, entries: ids.map((id) => ({ id, title: id, status: 'open', verify: { kind: 'manual', evidence: 'x', checked: '2026-09-21' } })) }, null, 2)

/** main's ledger and backlog, as the base tip. Every fixture below subtracts this. */
const base = idSets({ ledger: ledger('1490', '1491', '1492'), backlog: backlog('LIVE-440', 'HYG-106') })

const pr = (number: number, createdAt: string, adrs: string[], rows: string[]) => ({
  number,
  title: `PR ${number}`,
  createdAt,
  ...newIdSets(idSets({ ledger: ledger('1490', '1491', '1492', ...adrs), backlog: backlog('LIVE-440', 'HYG-106', ...rows) }), base),
})

describe('what counts as a declaration and an id', () => {
  it('reads ## and ### ADR headings with check-adr.mjs regex, and a letter suffix is its own id', () => {
    const ids = declaredAdrs('## ADR-100: a\n### ADR-101b: b\nsee ADR-102 in prose\n## ADR-103 trailing\n')
    expect([...ids].sort()).toEqual(['100', '101b', '103'])
  })

  it('reads entries[].id from the backlog, and an absent file is an empty set, not a crash', () => {
    expect([...backlogIds(backlog('A-1', 'B-2'))]).toEqual(['A-1', 'B-2'])
    expect(backlogIds('').size).toBe(0)
  })

  it('refuses a backlog that does not parse rather than reading it as "no rows"', () => {
    expect(() => backlogIds('{ not json')).toThrow()
  })

  it('CONTROL: the real ledger declares ADR-1488, the entry that records the convention', () => {
    const real = declaredAdrs(readFileSync('docs/DECISIONS.md', 'utf8'))
    expect(real.size).toBeGreaterThan(1000)
    expect(real.has('1488')).toBe(true)
  })
})

describe('newIdSets subtracts the base tip', () => {
  it('an id already on main is nobody\'s claim to make', () => {
    const mine = pr(1, '2026-09-21T10:00:00Z', ['1492', '1493'], ['HYG-106', 'HYG-111'])
    expect([...mine.adrs]).toEqual(['1493'])
    expect([...mine.rows]).toEqual(['HYG-111'])
  })
})

describe('findCollisions — the comparison', () => {
  it('must FAIL: two PRs that both introduce ADR-1493 and both claim LIVE-442', () => {
    const mine = pr(2824, '2026-09-21T14:00:00Z', ['1493'], ['LIVE-442'])
    const other = pr(2822, '2026-09-21T13:00:00Z', ['1493'], ['LIVE-442'])
    const hits = findCollisions(mine, [other])
    expect(hits.map((h) => h.id)).toEqual(['ADR-1493', 'LIVE-442'])
    expect(hits.every((h) => h.pr.number === 2822)).toBe(true)
  })

  it('must PASS: two PRs introducing different numbers and different rows', () => {
    const mine = pr(1, '2026-09-21T14:00:00Z', ['1493'], ['LIVE-442'])
    const other = pr(2, '2026-09-21T13:00:00Z', ['1494'], ['LIVE-443'])
    expect(findCollisions(mine, [other])).toEqual([])
  })

  it('must PASS: the renumbered case — the later PR moved 1493 → 1495 and the overlap is gone', () => {
    const mine = pr(2827, '2026-09-21T15:00:00Z', ['1495'], ['PROG-D3'])
    const other = pr(2822, '2026-09-21T13:00:00Z', ['1493'], ['PROG-R6'])
    expect(findCollisions(mine, [other])).toEqual([])
  })

  it('names every PR that shares an id, sorted by PR number then id, so the report is stable', () => {
    // 1300 rather than a fresh number: check:adr's citation scan reads this file too, and a
    // fixture number that is not on the ledger is a dangling citation to it.
    const mine = pr(9, '2026-09-21T16:00:00Z', ['1300'], ['HYG-107'])
    const a = pr(5, '2026-09-21T12:00:00Z', ['1300'], [])
    const b = pr(3, '2026-09-21T11:00:00Z', [], ['HYG-107'])
    const hits = findCollisions(mine, [a, b])
    expect(hits.map((h) => `${h.pr.number}:${h.id}`)).toEqual(['3:HYG-107', '5:ADR-1300'])
  })
})

describe('decide — the later-opened PR renumbers (ADR-1488)', () => {
  // 1493, not 1492: the fixture base already declares 1492, so `pr()` would subtract it and
  // there would be nothing to collide on — which is the newIdSets contract, not a collision.
  const me = { number: 2824, createdAt: '2026-09-21T14:00:00Z' }
  const earlier = pr(2822, '2026-09-21T13:00:00Z', ['1493'], [])
  const later = pr(2830, '2026-09-21T15:00:00Z', ['1493'], [])
  const mine = { adrs: new Set(['1493']), rows: new Set<string>() }

  it('FAILS this PR when it was opened after the other claimant', () => {
    const v = decide({ me, collisions: findCollisions(mine, [earlier]) })
    expect(v.ok).toBe(false)
    expect(v.lines[0]).toContain('::error')
    expect(v.lines[0]).toContain('THIS PR (#2824) renumbers')
    expect(v.lines[0]).toContain('#2822')
    expect(v.lines[0]).toContain('ADR-1488')
  })

  it('WARNS but passes this PR when it was opened first — it keeps the number', () => {
    const v = decide({ me, collisions: findCollisions(mine, [later]) })
    expect(v.ok).toBe(true)
    expect(v.lines[0]).toContain('::warning')
    expect(v.lines[0]).toContain('PR #2830 renumbers')
    expect(v.lines[0]).toContain('keeps ADR-1493')
  })

  it('reads an unknown own creation time as LATER, the conservative side', () => {
    const v = decide({ me: { number: 1, createdAt: null }, collisions: findCollisions(mine, [earlier, later]) })
    expect(v.ok).toBe(false)
    expect(v.lines).toHaveLength(2)
    expect(v.lines.every((l) => l.startsWith('::error'))).toBe(true)
  })

  it('no collisions is ok with nothing to say', () => {
    expect(decide({ me, collisions: [] })).toEqual({ ok: true, lines: [] })
  })
})

describe('the reads fail rather than skip', () => {
  const token = 't'
  it('a non-2xx pulls page throws', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 502, json: async () => [] })) as unknown as typeof fetch
    await expect(fetchOpenPulls({ repo: 'o/r', base: 'main', token, fetchImpl })).rejects.toThrow('HTTP 502')
  })

  it('a non-2xx, non-404 contents read throws; a 404 is empty text', async () => {
    const at = (status: number) => (async () => ({ ok: status < 300, status, text: async () => 'x' })) as unknown as typeof fetch
    await expect(fetchFileAt({ repo: 'o/r', path: 'docs/DECISIONS.md', ref: 'abc', token, fetchImpl: at(403) })).rejects.toThrow('HTTP 403')
    await expect(fetchFileAt({ repo: 'o/r', path: 'docs/DECISIONS.md', ref: 'abc', token, fetchImpl: at(404) })).resolves.toBe('')
  })

  it('asks the contents API for the RAW media type, which both watched files need past 1 MB', async () => {
    let accept = ''
    const fetchImpl = (async (_url: string, init: { headers: Record<string, string> }) => {
      accept = init.headers.Accept
      return { ok: true, status: 200, text: async () => '' }
    }) as unknown as typeof fetch
    await fetchFileAt({ repo: 'o/r', path: 'docs/DECISIONS.md', ref: 'abc', token, fetchImpl })
    expect(accept).toBe('application/vnd.github.raw+json')
  })
})
