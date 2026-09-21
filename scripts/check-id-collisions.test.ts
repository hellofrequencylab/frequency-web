// Non-triviality tests for the cross-PR id collision gate (HYG-111, ADR-1509).
//
// The gate's IO (the pulls listing, the contents API, `git show`) is not what these prove. They
// drive the exported pure functions against fixtures that must FAIL and fixtures that must PASS,
// arm by arm, so the comparison cannot go quietly vacuous: two PR sets colliding, two not
// colliding, and the case the convention exists for — a later PR that renumbered and no longer
// collides. The real ledger is read once as a control that the declaration regex sees it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BACKLOG,
  LEDGER,
  WATCHED,
  backlogIds,
  couldNotRun,
  decide,
  declaredAdrs,
  fetchFileAt,
  fetchNewIdsForPull,
  fetchOpenPulls,
  findCollisions,
  idSets,
  main,
  newIdSets,
  retryDelayMs,
  retryingFetch,
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

// ── The transient-limit arm (HYG-113) ─────────────────────────────────────────────────────────
// 2026-09-21 20:31 UTC: this gate failed on #2840 with `GET pulls (page 1): HTTP 403`, eighteen
// minutes after the same gate on the same job with the same permissions listed four open PRs and
// ticked on #2842. A 403 with no scope change is GitHub secondary rate limiting, not a
// permissions defect. These prove the retry that answers it AND the never-skip contract it must
// not weaken: retried statuses are retried, a 404 and a 401 are answers, the budget is bounded,
// and when every attempt fails the gate still refuses to say clean.

describe('the fetch helper retries a transient limit and never an answer', () => {
  const reply = (status: number, body: unknown = [], head: Record<string, string> = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => head[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })

  const counting = (queue: ReturnType<typeof reply>[]) => {
    const calls: string[] = []
    const impl = (async (url: string) => {
      calls.push(String(url))
      return queue[Math.min(calls.length - 1, queue.length - 1)]
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  it('retries a 403, a 429 and a 5xx, three attempts at most, and reports each retry', async () => {
    for (const status of [403, 429, 503]) {
      const { impl, calls } = counting([reply(status)])
      const slept: number[] = []
      const lines: string[] = []
      const http = retryingFetch(impl, {
        sleep: async (ms: number) => void slept.push(ms),
        now: () => 0,
        log: (l: string) => lines.push(l),
      })
      const res = await http('https://api.github.com/x', {})
      expect(res.status).toBe(status)
      expect(calls).toHaveLength(3)
      expect(slept).toEqual([1000, 2000])
      expect(lines.join('\n')).toContain(`HTTP ${status} (attempt 1 of 3)`)
      expect(http.state).toMatchObject({ attempts: 3, retries: 2, lastStatus: status })
    }
  })

  it('does NOT retry a 404 or a 401: those are answers, not weather', async () => {
    const notFound = counting([reply(404, 'x')])
    const httpNotFound = retryingFetch(notFound.impl, { sleep: async () => {}, now: () => 0, log: () => {} })
    await expect(
      fetchFileAt({ repo: 'o/r', path: BACKLOG, ref: 'abc', token: 't', fetchImpl: httpNotFound as unknown as typeof fetch }),
    ).resolves.toBe('')
    expect(notFound.calls).toHaveLength(1)

    const denied = counting([reply(401, 'x')])
    const httpDenied = retryingFetch(denied.impl, { sleep: async () => {}, now: () => 0, log: () => {} })
    await expect(
      fetchFileAt({ repo: 'o/r', path: BACKLOG, ref: 'abc', token: 't', fetchImpl: httpDenied as unknown as typeof fetch }),
    ).rejects.toThrow('HTTP 401')
    expect(denied.calls).toHaveLength(1)
  })

  it('honours retry-after in seconds, an HTTP date, and x-ratelimit-reset once the quota is 0', () => {
    const at = (head: Record<string, string>) => retryDelayMs({ res: reply(429, [], head), attempt: 1, nowMs: 1_000_000 })
    expect(at({})).toBe(1000) // plain exponential backoff
    expect(at({ 'retry-after': '7' })).toBe(7000)
    expect(at({ 'retry-after': new Date(1_000_000 + 9000).toUTCString() })).toBe(9000)
    expect(at({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(1000 + 12) })).toBe(12_000)
    // A reset header with quota still on it is not a wait instruction.
    expect(at({ 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': String(1000 + 12) })).toBe(1000)
  })

  it('cannot add more than the whole-run budget however long the API asks for', async () => {
    const { impl } = counting([reply(429, [], { 'retry-after': '3600' })])
    const slept: number[] = []
    const http = retryingFetch(impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0, log: () => {} })
    await http('https://api.github.com/x', {})
    await http('https://api.github.com/y', {})
    expect(slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(60_000)
  })
})

describe('a PR is read only for the watched files its own diff names', () => {
  const pull = { number: 2842, title: 'other', createdAt: '2026-09-21T19:00:00Z', headSha: 'bbb', headRepo: 'o/r' }
  const reader = (bodies: Record<string, string>) => {
    const reads: string[] = []
    const impl = (async (url: string) => {
      reads.push(String(url))
      const path = WATCHED.find((p) => String(url).includes(`/contents/${p}?`)) ?? ''
      return { ok: true, status: 200, text: async () => bodies[path] ?? '' }
    }) as unknown as typeof fetch
    return { impl, reads }
  }

  it('reads ONE file, the backlog, when the files listing names only the backlog', async () => {
    const { impl, reads } = reader({ [BACKLOG]: backlog('LIVE-440', 'HYG-106', 'HYG-113') })
    const ids = await fetchNewIdsForPull({
      pr: pull,
      files: ['docs/BUILD-BACKLOG.json', 'scripts/check-id-collisions.mjs'],
      baseSets: base,
      token: 't',
      fetchImpl: impl,
    })
    expect(reads).toHaveLength(1)
    expect(reads[0]).toContain('/contents/docs/BUILD-BACKLOG.json?')
    expect([...ids.rows]).toEqual(['HYG-113'])
    expect(ids.adrs.size).toBe(0)
    expect(ids.read).toEqual([BACKLOG])
  })

  it('reads ONE file, the ledger, when the files listing names only the ledger', async () => {
    const { impl, reads } = reader({ [LEDGER]: ledger('1490', '1491', '1492', '1300') })
    const ids = await fetchNewIdsForPull({ pr: pull, files: ['docs/DECISIONS.md'], baseSets: base, token: 't', fetchImpl: impl })
    expect(reads).toHaveLength(1)
    expect(reads[0]).toContain('/contents/docs/DECISIONS.md?')
    expect([...ids.adrs]).toEqual(['1300'])
  })

  it('reads both when both are in the diff, and neither when neither is', async () => {
    const both = reader({ [LEDGER]: ledger('1490', '1300'), [BACKLOG]: backlog('HYG-113') })
    const two = await fetchNewIdsForPull({ pr: pull, files: [LEDGER, BACKLOG], baseSets: base, token: 't', fetchImpl: both.impl })
    expect(both.reads).toHaveLength(2)
    expect([...two.adrs]).toEqual(['1300'])
    expect([...two.rows]).toEqual(['HYG-113'])

    const none = reader({})
    const zero = await fetchNewIdsForPull({ pr: pull, files: ['app/page.tsx'], baseSets: base, token: 't', fetchImpl: none.impl })
    expect(none.reads).toHaveLength(0)
    expect(zero).toMatchObject({ touched: false })
  })
})

describe('main under a rate limit: retries, then fails loudly rather than answering clean', () => {
  const env = {
    GITHUB_TOKEN: 't',
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_BASE_REF: 'no-such-base-in-this-worktree',
    PR_NUMBER: '2840',
  }
  const pulls = [
    { number: 2840, title: 'mine', created_at: '2026-09-21T20:00:00Z', head: { sha: 'aaa', repo: { full_name: 'o/r' } } },
    { number: 2842, title: 'other', created_at: '2026-09-21T19:00:00Z', head: { sha: 'bbb', repo: { full_name: 'o/r' } } },
  ]
  const served = (url: string) => {
    const body = (b: unknown) => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => b,
      text: async () => (typeof b === 'string' ? b : JSON.stringify(b)),
    })
    if (url.includes('/pulls?state=open')) return body(pulls)
    if (/\/pulls\/\d+\/files/.test(url)) return body([{ filename: 'docs/BUILD-BACKLOG.json' }])
    if (url.includes('/contents/docs/BUILD-BACKLOG.json')) return body(backlog('AN-ID-NO-TREE-HAS'))
    return body(ledger('1490'))
  }
  const limited = (status: number, times: number, head: Record<string, string> = {}) => {
    const calls: string[] = []
    const impl = (async (url: string) => {
      calls.push(String(url))
      if (calls.length <= times) {
        return { ok: false, status, headers: { get: (k: string) => head[k.toLowerCase()] ?? null }, json: async () => [], text: async () => '' }
      }
      return served(String(url))
    }) as unknown as typeof fetch
    return { impl, calls }
  }
  let logged: string[] = []
  beforeEach(() => {
    logged = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')))
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a 403 then a 200: the run completes, the retry is reported, and the gate answers', async () => {
    const { impl, calls } = limited(403, 1)
    const slept: number[] = []
    await main(env, impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0 })
    expect(slept).toEqual([1000])
    expect(calls.length).toBeGreaterThan(1)
    const out = logged.join('\n')
    expect(out).toContain('HTTP 403 (attempt 1 of 3) looks transient; retrying in 1.0s.')
    expect(out).toContain('✓ check:id-collisions')
  })

  it('a 429 with retry-after: 1 is honoured, and the test waits for nothing', async () => {
    const { impl } = limited(429, 1, { 'retry-after': '1' })
    const slept: number[] = []
    await main(env, impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0 })
    expect(slept).toEqual([1000])
    expect(logged.join('\n')).toContain('✓ check:id-collisions')
  })

  it('three 403s: three attempts, then exit 1 with the loud never-skip message', async () => {
    const { impl, calls } = limited(403, 99)
    const slept: number[] = []
    const err = await main(env, impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0 }).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(err).toBeInstanceOf(Error)
    expect(calls).toHaveLength(3)
    expect(slept).toEqual([1000, 2000])
    expect(err?.message).toContain('HTTP 403')
    expect(err?.message).toContain('3 attempt(s), last status 403')
    expect(err?.message).toContain('secondary rate limiting, not a permissions defect')
    const loud = couldNotRun(err)
    expect(loud).toContain('the cross-PR arm could not RUN')
    expect(loud).toContain('gate that answers "clean" when it could not look')
    expect(loud).toContain('3 attempt(s), last status 403')
  })

  it('reads the other PR ONCE when its files listing names only the backlog', async () => {
    const { impl, calls } = limited(200, 0)
    await main(env, impl, { sleep: async () => {}, now: () => 0 })
    const headReads = calls.filter((u) => u.includes('/contents/') && u.includes('ref=bbb'))
    expect(headReads).toHaveLength(1)
    expect(headReads[0]).toContain('/contents/docs/BUILD-BACKLOG.json')
    expect(calls.filter((u) => u.includes('/contents/docs/DECISIONS.md') && u.includes('ref=bbb'))).toHaveLength(0)
  })
})
