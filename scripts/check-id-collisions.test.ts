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
  blobOids,
  fetchPullHeads,
  gitNewIdsForPull,
  prRef,
  couldNotRun,
  decide,
  declaredAdrs,
  fetchFileAt,
  fetchNewIdsForPull,
  fetchOpenPulls,
  findCollisions,
  idSets,
  limitHeaders,
  main,
  newIdSets,
  RETRY_ATTEMPTS,
  RETRY_BUDGET_MS,
  retryDelayMs,
  retryingFetch,
} from './check-id-collisions.mjs'
import { loadBacklog, loadDecisions } from './lib/ledger.mjs'

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
//
// 2026-09-29 (HYG-133, ADR-1603): the first 60s budget was shorter than the weather. #3011 and
// #3017 went red with "HTTP 403 (attempt 1 of 3) looks transient; retrying in 60.0s" then "the 60s
// retry budget is spent": GitHub asked for the whole budget on its first reply. The budget is now
// five minutes over six attempts, and these cases pin both numbers and a long wait inside them.

/** Exponential backoff from 1s for every retry RETRY_ATTEMPTS allows: [1000, 2000, 4000, ...]. */
const backoffs = Array.from({ length: RETRY_ATTEMPTS - 1 }, (_, i) => 1000 * 2 ** i)

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

  it('gives a secondary limit room to clear: at least six attempts under at least five minutes', () => {
    expect(RETRY_ATTEMPTS).toBeGreaterThanOrEqual(6)
    expect(RETRY_BUDGET_MS).toBeGreaterThanOrEqual(300_000)
    // Still a cap: the checks job has a 20-minute timeout and a budget that eats it is a hang.
    expect(RETRY_BUDGET_MS).toBeLessThanOrEqual(600_000)
  })

  it('retries a 403, a 429 and a 5xx, RETRY_ATTEMPTS at most, and reports each retry', async () => {
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
      expect(calls).toHaveLength(RETRY_ATTEMPTS)
      expect(slept).toEqual(backoffs)
      expect(lines.join('\n')).toContain(`HTTP ${status} (attempt 1 of ${RETRY_ATTEMPTS})`)
      expect(http.state).toMatchObject({ attempts: RETRY_ATTEMPTS, retries: RETRY_ATTEMPTS - 1, lastStatus: status })
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
    expect(slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(RETRY_BUDGET_MS)
    expect(slept.reduce((a, b) => a + b, 0)).toBe(RETRY_BUDGET_MS)
  })

  it('waits out a long retry-after inside the budget, the 2026-09-29 shape the 60s budget could not', async () => {
    // GitHub asks for two minutes on the first reply; the old budget capped that at 60s and failed.
    const { impl, calls } = counting([reply(403, [], { 'retry-after': '120' }), reply(200)])
    const slept: number[] = []
    const lines: string[] = []
    const http = retryingFetch(impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0, log: (l: string) => lines.push(l) })
    const res = await http('https://api.github.com/x', {})
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)
    expect(slept).toEqual([120_000])
    expect(lines.join('\n')).toContain('retrying in 120.0s. [retry-after: 120]')
  })

  it('outlasts four one-minute secondary limits in a row, then answers', async () => {
    const limitedFor = (n: number) => [...Array.from({ length: n }, () => reply(403, [], { 'retry-after': '60' })), reply(200)]
    const { impl, calls } = counting(limitedFor(4))
    const slept: number[] = []
    const http = retryingFetch(impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0, log: () => {} })
    expect((await http('https://api.github.com/x', {})).status).toBe(200)
    expect(calls).toHaveLength(5)
    expect(slept).toEqual([60_000, 60_000, 60_000, 60_000])
  })

  it('says when GitHub asked for more than the budget left, and prints the quota headers it sent', async () => {
    const { impl } = counting([reply(403, [], { 'retry-after': '3600', 'x-ratelimit-remaining': '812' })])
    const lines: string[] = []
    const http = retryingFetch(impl, { sleep: async () => {}, now: () => 0, log: (l: string) => lines.push(l) })
    await http('https://api.github.com/x', {})
    const out = lines.join('\n')
    expect(out).toContain(`retrying in ${(RETRY_BUDGET_MS / 1000).toFixed(1)}s (asked for 3600.0s, capped by the ${RETRY_BUDGET_MS / 1000}s budget).`)
    expect(out).toContain('[retry-after: 3600, x-ratelimit-remaining: 812]')
    expect(out).toContain(`the ${RETRY_BUDGET_MS / 1000}s retry budget is spent`)
    expect(limitHeaders(reply(503))).toBe('')
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

  it('reads a fragment PR’s ids from its file names, downloading nothing (HYG-145)', async () => {
    const none = reader({})
    const ids = await fetchNewIdsForPull({
      pr: pull,
      files: ['docs/ledger/rows/HYG-150.json', 'docs/ledger/rows/LIVE-440.json', 'docs/ledger/adr/ADR-1300.md', 'app/page.tsx'],
      baseSets: base,
      token: 't',
      fetchImpl: none.impl,
    })
    expect(none.reads).toHaveLength(0)
    // LIVE-440 is on the base tip, so its fragment is an edit and introduces nothing.
    expect([...ids.rows]).toEqual(['HYG-150'])
    expect([...ids.adrs]).toEqual(['1300'])
    expect(ids.touched).toBe(true)
    const clash = findCollisions({ adrs: new Set(['1300']), rows: new Set() }, [{ number: 9, title: 'x', createdAt: '2026-09-29T00:00:00Z', ...ids }])
    expect(clash.map((c) => c.id)).toEqual(['ADR-1300'])
  })
})

describe('main under a rate limit: retries, then fails loudly rather than answering clean', () => {
  // `main`'s first parameter defaults to `process.env`, so TypeScript types it as NodeJS.ProcessEnv,
  // which this project declares NODE_ENV on as required. A test env literal has to carry it.
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
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
  // These drive the REST path, which since HYG-150 is the per-PR FALLBACK: a git seam that always
  // fails puts every read there, and keeps the tests off the network and off this repo's refs.
  const noGit = () => {
    throw new Error('git: not in this test')
  }

  it('a 403 then a 200: the run completes, the retry is reported, and the gate answers', async () => {
    const { impl, calls } = limited(403, 1)
    const slept: number[] = []
    await main(env, impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0, git: noGit })
    expect(slept).toEqual([1000])
    expect(calls.length).toBeGreaterThan(1)
    const out = logged.join('\n')
    expect(out).toContain(`HTTP 403 (attempt 1 of ${RETRY_ATTEMPTS}) looks transient; retrying in 1.0s.`)
    expect(out).toContain('✓ check:id-collisions')
  })

  it('a 429 with retry-after: 1 is honoured, and the test waits for nothing', async () => {
    const { impl } = limited(429, 1, { 'retry-after': '1' })
    const slept: number[] = []
    await main(env, impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0, git: noGit })
    expect(slept).toEqual([1000])
    expect(logged.join('\n')).toContain('✓ check:id-collisions')
  })

  it('403 on every attempt: RETRY_ATTEMPTS tries, then exit 1 with the loud never-skip message', async () => {
    const { impl, calls } = limited(403, 99)
    const slept: number[] = []
    const err = await main(env, impl, { sleep: async (ms: number) => void slept.push(ms), now: () => 0, git: noGit }).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(err).toBeInstanceOf(Error)
    expect(calls).toHaveLength(RETRY_ATTEMPTS)
    expect(slept).toEqual(backoffs)
    expect(err?.message).toContain('HTTP 403')
    expect(err?.message).toContain(`${RETRY_ATTEMPTS} attempt(s), last status 403`)
    expect(err?.message).toContain('secondary rate limiting, not a permissions defect')
    const loud = couldNotRun(err)
    expect(loud).toContain('the cross-PR arm could not RUN')
    expect(loud).toContain('gate that answers "clean" when it could not look')
    expect(loud).toContain(`${RETRY_ATTEMPTS} attempt(s), last status 403`)
  })

  it('a PR that introduces no ids does not spend the pulls listing', async () => {
    // The base tip is served as this checkout's MERGED view (its files plus its docs/ledger
    // fragments, HYG-145), so the PR introduces nothing against it.
    const calls: string[] = []
    const mergedBacklog = JSON.stringify(loadBacklog())
    const mergedLedger = loadDecisions()
    const mirror = (async (url: string) => {
      calls.push(String(url))
      const text = String(url).includes(`/contents/${BACKLOG}`) ? mergedBacklog : mergedLedger
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => [], text: async () => text }
    }) as unknown as typeof fetch
    await main(env, mirror, { sleep: async () => {}, now: () => 0, git: noGit })
    expect(calls.some((u) => u.includes('/pulls?state=open'))).toBe(false)
    expect(logged.join('\n')).toContain('the pulls listing was not read')
  })

  it('reads the other PR ONCE when its files listing names only the backlog', async () => {
    const { impl, calls } = limited(200, 0)
    await main(env, impl, { sleep: async () => {}, now: () => 0, git: noGit })
    const headReads = calls.filter((u) => u.includes('/contents/') && u.includes('ref=bbb'))
    expect(headReads).toHaveLength(1)
    expect(headReads[0]).toContain('/contents/docs/BUILD-BACKLOG.json')
    expect(calls.filter((u) => u.includes('/contents/docs/DECISIONS.md') && u.includes('ref=bbb'))).toHaveLength(0)
  })
})

// ── HYG-150 (ADR-1668): the other PRs are read through git, so the REST cost is ONE listing ───────

/** A fake `git` for one base tip and a set of PR heads. Each head is its ledger fragment paths plus
 *  the text of whichever watched files it holds; a watched file's blob id is derived from its text,
 *  so an unchanged file has the base tip's id exactly as in a real tree. Every call is recorded. */
function fakeGit({
  baseFiles,
  baseFrags = [],
  heads,
  fetchFails = [],
  readFails = [],
}: {
  baseFiles: Record<string, string>
  baseFrags?: string[]
  heads: Record<number, { frags?: string[]; files?: Record<string, string> }>
  fetchFails?: number[]
  readFails?: number[]
}) {
  const calls: string[][] = []
  const blobs = new Map<string, string>()
  const oid = (text: string) => {
    let h = 0
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const id = h.toString(16).padStart(8, '0').repeat(5)
    blobs.set(id, text)
    return id
  }
  const treeAt = (rev: string) => {
    if (rev.startsWith('origin/')) return { frags: baseFrags, files: baseFiles }
    const n = Number(rev.slice(prRef(0).length - 1))
    if (readFails.includes(n) || !heads[n]) throw new Error(`fatal: Not a valid object name ${rev}`)
    return { frags: heads[n].frags ?? [], files: heads[n].files ?? baseFiles }
  }
  const git = (args: string[]) => {
    calls.push(args)
    if (args[0] === 'fetch') {
      const wanted = args.filter((a) => a.startsWith('+refs/pull/')).map((a) => Number(/refs\/pull\/(\d+)\//.exec(a)![1]))
      const bad = wanted.find((n) => fetchFails.includes(n))
      if (bad) throw Object.assign(new Error('Command failed'), { stderr: `fatal: couldn't find remote ref refs/pull/${bad}/head\n` })
      return ''
    }
    if (args[0] === 'show') return baseFiles[args[1].split(':')[1]] ?? ''
    if (args[0] === 'ls-tree' && args[1] === '-r') return treeAt(args[3]).frags.join('\n')
    if (args[0] === 'ls-tree') {
      const { files } = treeAt(args[1])
      return args
        .slice(3)
        .filter((p) => files[p] !== undefined)
        .map((p) => `100644 blob ${oid(files[p])}\t${p}`)
        .join('\n')
    }
    if (args[0] === 'cat-file') return blobs.get(args[2]) ?? ''
    throw new Error(`unexpected git ${args.join(' ')}`)
  }
  return { git, calls }
}

describe('fetchPullHeads: one git fetch for every other PR, and one bad ref costs one PR', () => {
  it('fetches every head in ONE call, depth 1 with no blobs, into a private ref namespace', () => {
    const { git, calls } = fakeGit({ baseFiles: {}, heads: {} })
    const { fetched, notes } = fetchPullHeads({ numbers: [3070, 3079], git })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual(expect.arrayContaining(['fetch', '--depth=1', '--filter=blob:none', 'origin']))
    expect(calls[0]).toContain(`+refs/pull/3079/head:${prRef(3079)}`)
    expect(prRef(3079)).toBe('refs/id-collisions/pr/3079')
    expect([...fetched]).toEqual([3070, 3079])
    expect(notes).toEqual([])
  })

  it('when the one fetch fails, fetches each alone and leaves only the bad ref unfetched', () => {
    const { git, calls } = fakeGit({ baseFiles: {}, heads: {}, fetchFails: [3075] })
    const { fetched, notes } = fetchPullHeads({ numbers: [3070, 3075, 3079], git })
    expect(calls).toHaveLength(4)
    expect([...fetched]).toEqual([3070, 3079])
    expect(notes.join('\n')).toContain("couldn't find remote ref refs/pull/3075/head")
  })

  it('never hands git anything but a positive integer PR number', () => {
    const { git, calls } = fakeGit({ baseFiles: {}, heads: {} })
    const { fetched } = fetchPullHeads({ numbers: [Number.NaN, -1, 1.5, 3070] as number[], git })
    expect(calls).toHaveLength(1)
    expect(calls[0].filter((a) => a.startsWith('+refs/pull/'))).toEqual([`+refs/pull/3070/head:${prRef(3070)}`])
    expect([...fetched]).toEqual([3070])
  })
})

describe('gitNewIdsForPull: a head read through git, base subtracted, legacy files only when changed', () => {
  const baseFiles = { [LEDGER]: ledger('1490', '1491', '1492'), [BACKLOG]: backlog('LIVE-440', 'HYG-106') }
  const baseOidsFor = (git: (a: string[]) => string) => blobOids({ rev: 'origin/main', paths: WATCHED, git })

  it('reads fragment ids from the head tree names and downloads no legacy file main already has', () => {
    const { git, calls } = fakeGit({
      baseFiles,
      baseFrags: ['docs/ledger/rows/HYG-145.json'],
      heads: { 9: { frags: ['docs/ledger/rows/HYG-145.json', 'docs/ledger/rows/HYG-150.json', 'docs/ledger/rows/LIVE-440.json', 'docs/ledger/adr/ADR-1668.md'] } },
    })
    const baseSets = { adrs: base.adrs, rows: new Set([...base.rows, 'HYG-145']) }
    const ids = gitNewIdsForPull({ rev: prRef(9), baseSets, baseOids: baseOidsFor(git), git })
    expect([...ids.rows]).toEqual(['HYG-150'])
    expect([...ids.adrs]).toEqual(['1668'])
    expect(ids.read).toEqual([])
    expect(calls.some((a) => a[0] === 'cat-file')).toBe(false)
    expect(ids.via).toBe('git')
  })

  it('reads a legacy file whose blob differs from the base tip, and subtracts the base ids', () => {
    const { git, calls } = fakeGit({
      baseFiles,
      heads: { 9: { files: { [LEDGER]: ledger('1490', '1491', '1492', '1300'), [BACKLOG]: baseFiles[BACKLOG] } } },
    })
    const ids = gitNewIdsForPull({ rev: prRef(9), baseSets: base, baseOids: baseOidsFor(git), git })
    expect(ids.read).toEqual([LEDGER])
    expect([...ids.adrs]).toEqual(['1300'])
    expect(ids.rows.size).toBe(0)
    expect(calls.filter((a) => a[0] === 'cat-file')).toHaveLength(1)
  })

  it('reads a blob many stale PRs share ONCE, and a stale head introduces nothing', () => {
    const stale = { [LEDGER]: ledger('1490', '1491'), [BACKLOG]: backlog('LIVE-440') }
    const { git, calls } = fakeGit({ baseFiles, heads: { 7: { files: stale }, 8: { files: stale } } })
    const cache = new Map()
    const baseOids = baseOidsFor(git)
    const a = gitNewIdsForPull({ rev: prRef(7), baseSets: base, baseOids, cache, git })
    const b = gitNewIdsForPull({ rev: prRef(8), baseSets: base, baseOids, cache, git })
    expect(calls.filter((c) => c[0] === 'cat-file')).toHaveLength(2)
    for (const ids of [a, b]) expect([...ids.adrs, ...ids.rows]).toEqual([])
  })

  it('throws when the head cannot be read, so the caller falls back rather than answering clean', () => {
    const { git } = fakeGit({ baseFiles, heads: {}, readFails: [9] })
    expect(() => gitNewIdsForPull({ rev: prRef(9), baseSets: base, git })).toThrow()
  })
})

describe('main reads the other PRs through git: ONE REST call on the normal path (HYG-150)', () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: 'test',
    GITHUB_TOKEN: 't',
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_BASE_REF: 'main',
    PR_NUMBER: '2840',
  }
  const pulls = [
    { number: 2840, title: 'mine', created_at: '2026-09-29T22:00:00Z', head: { sha: 'aaa', repo: { full_name: 'o/r' } } },
    { number: 2841, title: 'fragments', created_at: '2026-09-29T19:00:00Z', head: { sha: 'bbb', repo: { full_name: 'o/r' } } },
    { number: 2842, title: 'nothing', created_at: '2026-09-29T19:00:00Z', head: { sha: 'ccc', repo: { full_name: 'o/r' } } },
    { number: 2843, title: 'more', created_at: '2026-09-29T19:00:00Z', head: { sha: 'ddd', repo: { full_name: 'o/r' } } },
  ]
  // The base tip carries no ids, so everything in this checkout's merged view is "introduced" and
  // the listing is read. A head fragment named after a real tree row is a collision.
  const baseFiles = { [LEDGER]: '', [BACKLOG]: '' }
  const rest = (calls: string[], filesFor: Record<number, string[]> = {}) =>
    (async (url: string) => {
      calls.push(String(url))
      const body = (b: unknown) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => b, text: async () => '' })
      if (String(url).includes('/pulls?state=open')) return body(pulls)
      const m = /\/pulls\/(\d+)\/files/.exec(String(url))
      if (m) return body((filesFor[Number(m[1])] ?? []).map((filename) => ({ filename })))
      return { ok: false, status: 500, headers: { get: () => null }, json: async () => [], text: async () => '' }
    }) as unknown as typeof fetch
  let logged: string[] = []
  beforeEach(() => {
    logged = []
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(' ')))
  })
  afterEach(() => {
    vi.restoreAllMocks()
    process.exitCode = 0
  })

  it('clean: three other PRs cost the pulls listing and nothing else', async () => {
    const calls: string[] = []
    const { git, calls: gitCalls } = fakeGit({
      baseFiles,
      heads: { 2841: { frags: ['docs/ledger/rows/ZZZ-1.json', 'docs/ledger/adr/ADR-99999.md'] }, 2842: {}, 2843: { frags: ['docs/ledger/rows/ZZZ-2.json'] } },
    })
    await main(env, rest(calls), { sleep: async () => {}, now: () => 0, git })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('/pulls?state=open')
    expect(gitCalls.filter((a) => a[0] === 'fetch')).toHaveLength(1)
    const out = logged.join('\n')
    expect(out).toContain('3 of 3 other open PR(s) read through git (no REST call each); 0 through the REST files listing.')
    expect(out).toContain('#2841 "fragments": introduces 1 ADR(s) [ADR-99999], 1 row(s) [ZZZ-1] (git)')
    expect(out).toContain('✓ check:id-collisions')
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('a collision read through git still fails the later-opened PR', async () => {
    const calls: string[] = []
    const { git } = fakeGit({ baseFiles, heads: { 2841: { frags: ['docs/ledger/rows/HYG-145.json'] }, 2842: {}, 2843: {} } })
    await main(env, rest(calls), { sleep: async () => {}, now: () => 0, git })
    expect(calls).toHaveLength(1)
    expect(logged.join('\n')).toContain('::error title=id collision::backlog id HYG-145 is also introduced by open PR #2841')
    expect(process.exitCode).toBe(1)
  })

  it('a PR whose head git cannot read falls back to REST for THAT PR only, and still sees its ids', async () => {
    const calls: string[] = []
    const { git } = fakeGit({ baseFiles, heads: { 2841: {}, 2843: {} }, fetchFails: [2842] })
    await main(env, rest(calls, { 2842: ['docs/ledger/rows/HYG-145.json'] }), { sleep: async () => {}, now: () => 0, git })
    expect(calls.filter((u) => /\/pulls\/\d+\/files/.test(u))).toEqual([expect.stringContaining('/pulls/2842/files')])
    const out = logged.join('\n')
    expect(out).toContain("git: git fetch of refs/pull/2842/head failed (fatal: couldn't find remote ref refs/pull/2842/head); #2842 is read through REST instead.")
    expect(out).toContain('2 of 3 other open PR(s) read through git')
    expect(out).toContain('backlog id HYG-145 is also introduced by open PR #2842')
    expect(process.exitCode).toBe(1)
  })

  it('when git AND the REST fallback both cannot answer, the run throws: could-not-look is red', async () => {
    const { git } = fakeGit({ baseFiles, heads: { 2841: {}, 2843: {} }, readFails: [2842] })
    const failing = (async (url: string) => {
      if (String(url).includes('/pulls?state=open')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => pulls, text: async () => '' }
      }
      return { ok: false, status: 401, headers: { get: () => null }, json: async () => [], text: async () => '' }
    }) as unknown as typeof fetch
    const err = await main(env, failing, { sleep: async () => {}, now: () => 0, git }).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toContain('GET pulls/2842/files page 1: HTTP 401')
    expect(logged.join('\n')).not.toContain('✓ check:id-collisions')
  })
})
