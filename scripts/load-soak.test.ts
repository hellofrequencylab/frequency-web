import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { SLOS } from '@/lib/observability/slos'
import {
  HOT_PATHS,
  MAX_RPS,
  REQUIRED_SLOS,
  buildPhases,
  classifyHost,
  guardBuildEnv,
  main,
  parseArgs,
  percentile,
  preflightTarget,
  readSloTable,
  requestFor,
  runLoad,
  startMockTarget,
  summarizePath,
  validateSlos,
} from './load-soak.mjs'

// Self-test for the load and soak harness (LIVE-551, ADR-1621). Every case runs against an
// in-process mock on 127.0.0.1 or no target at all: nothing here loads a deployment, and no CI job
// does either, because a preview shares production's database (docs/WORKFLOW.md).

const slos = SLOS as unknown as Parameters<typeof validateSlos>[0]
const readSlo = SLOS.find((s) => s.id === 'latency.read-hot-paths')!
const errorSlo = SLOS.find((s) => s.id === 'error-rate.requests')!
const feed = HOT_PATHS.find((p) => p.id === 'feed')!
const fullCtx = { cookie: 'sb=1', circleSlug: 'c', writes: true, practiceAction: 'act', practiceId: 'p' }

describe('the two locks against production', () => {
  it('classifies hosts from the name alone', () => {
    expect(classifyHost('frequencylocal.com')).toBe('production')
    expect(classifyHost('www.frequencylocal.com')).toBe('production')
    expect(classifyHost('frequency-web-git-x-team.vercel.app')).toBe('preview')
    expect(classifyHost('localhost')).toBe('local')
    expect(classifyHost('127.0.0.1')).toBe('local')
    expect(classifyHost('example.com')).toBe('other')
    expect(classifyHost('frequency.example', ['frequency.example'])).toBe('production')
  })

  it('refuses a production host before any request, unless explicitly allowed', () => {
    expect(preflightTarget('https://frequencylocal.com').ok).toBe(false)
    expect(preflightTarget('https://frequencylocal.com', { allowProduction: true }).ok).toBe(true)
    expect(preflightTarget('http://x.vercel.app').ok).toBe(false) // plain http only for local
    expect(preflightTarget('not a url').ok).toBe(false)
    expect(preflightTarget('https://x-git-y.vercel.app').ok).toBe(true)
  })

  it('refuses a build that says production, and a remote build that cannot say', () => {
    expect(guardBuildEnv({ hostKind: 'preview', statusEnv: 'production' }).ok).toBe(false)
    expect(guardBuildEnv({ hostKind: 'preview', statusEnv: null }).ok).toBe(false)
    expect(guardBuildEnv({ hostKind: 'preview', statusEnv: 'preview' }).ok).toBe(true)
    expect(guardBuildEnv({ hostKind: 'local', statusEnv: null }).ok).toBe(true)
    expect(guardBuildEnv({ hostKind: 'preview', statusEnv: 'production', allowProduction: true }).ok).toBe(true)
  })

  it('main sends nothing at all to a production host', async () => {
    let calls = 0
    const code = await main(['--target', 'https://frequencylocal.com'], {
      env: {},
      fetchImpl: (async () => {
        calls++
        return new Response('')
      }) as typeof fetch,
      log: () => {},
      err: () => {},
      readSlos: () => slos,
    })
    expect(code).toBe(2)
    expect(calls).toBe(0)
  })

  it('main refuses a preview whose /api/status reports production, after exactly one request', async () => {
    const urls: string[] = []
    const code = await main(['--target', 'https://x-git-y.vercel.app'], {
      env: {},
      fetchImpl: (async (u: string) => {
        urls.push(String(u))
        return new Response(JSON.stringify({ build: { env: 'production' } }), { status: 200 })
      }) as unknown as typeof fetch,
      log: () => {},
      err: () => {},
      readSlos: () => slos,
    })
    expect(code).toBe(2)
    expect(urls).toEqual(['https://x-git-y.vercel.app/api/status'])
  })

  it('has no default target', async () => {
    expect(await main([], { env: {}, log: () => {}, err: () => {}, readSlos: () => slos })).toBe(2)
  })
})

describe('profiles', () => {
  it('spike runs the base rate, then ten times it, then the base rate', () => {
    expect(buildPhases('spike', 2, 60).map((p) => p.rps)).toEqual([2, 20, 2])
  })
  it('refuses any phase over the ceiling, the spike included', () => {
    expect(() => buildPhases('spike', MAX_RPS / 10 + 1, 60)).toThrow(/ceiling/)
    expect(() => buildPhases('steady', MAX_RPS + 1, 60)).toThrow(/ceiling/)
    expect(() => buildPhases('bogus', 1, 1)).toThrow(/unknown profile/)
  })
})

describe('the SLO table', () => {
  it('is read from the shipped slos.ts, and matches what the module exports', () => {
    const read = readSloTable()
    for (const id of REQUIRED_SLOS) {
      expect(read.find((s: { id: string }) => s.id === id)?.target).toBe(SLOS.find((s) => s.id === id)?.target)
    }
  })
  it('refuses a table missing a row it judges against', () => {
    expect(() => validateSlos(SLOS.filter((s) => s.id !== 'latency.practice-log-write'))).toThrow(/practice-log-write/)
  })
})

describe('judging a path', () => {
  const ok = (ms: number) => ({ ms, status: 200 })
  it('nearest-rank percentiles', () => {
    expect(percentile([], 95)).toBeNull()
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5)
  })
  it('passes under the target and breaches over it', () => {
    expect(summarizePath({ path: feed, samples: [ok(100), ok(200)], slo: readSlo, errorSlo }).verdict).toBe('pass')
    const slow = summarizePath({ path: feed, samples: [ok(100), ok(900)], slo: readSlo, errorSlo })
    expect(slow.verdict).toBe('breach')
    expect(slow.reason).toMatch(/p95 900 ms over the 800 ms/)
  })
  it('counts a 5xx and a lost response as errors against the error-rate SLO', () => {
    const r = summarizePath({ path: feed, samples: [ok(10), { ms: 10, status: 503 }, { ms: 15000, status: null }], slo: readSlo, errorSlo })
    expect(r.errors).toBe(2)
    expect(r.verdict).toBe('breach')
    expect(r.reason).toMatch(/error rate/)
  })
  it('calls a path that mostly bounced to login unmeasured, never a pass', () => {
    const r = summarizePath({ path: feed, samples: [{ ms: 5, status: 307 }, { ms: 5, status: 307 }, ok(5)], slo: readSlo, errorSlo })
    expect(r.verdict).toBe('unmeasured')
  })
  it('counts drops at the concurrency cap as a breach', () => {
    expect(summarizePath({ path: feed, samples: [ok(5)], dropped: 3, slo: readSlo, errorSlo }).verdict).toBe('breach')
  })
  it('keeps the write path off unless --writes, a session and the action id are all given', () => {
    const write = HOT_PATHS.find((p) => p.write)!
    expect(requestFor(write, { origin: 'http://127.0.0.1:1' })).toHaveProperty('skip')
    expect(requestFor(write, { origin: 'http://127.0.0.1:1', writes: true })).toHaveProperty('skip')
    const r = requestFor(write, { ...fullCtx, origin: 'http://127.0.0.1:1' }) as { init: { headers: Record<string, string>; body: string } }
    expect(r.init.headers['next-action']).toBe('act')
    expect(JSON.parse(r.init.body)[0]).toBe('p')
  })
  it('never lets a secret into the parsed options it prints', () => {
    const o = parseArgs(['--target', 'https://x.vercel.app'], { LOAD_SOAK_COOKIE: 'secret-cookie' })
    expect(o.cookie).toBe('secret-cookie')
    expect(() => parseArgs(['--rps', 'fast'])).toThrow(/number/)
  })
})

describe('against a local mock target', () => {
  it('measures every hot path and passes the real SLO table', async () => {
    const t = await startMockTarget()
    try {
      const r = await runLoad({ origin: t.origin, phases: [{ name: 't', rps: 50, durationS: 0.2 }], slos, ctx: fullCtx })
      expect(r.verdict).toBe('pass')
      expect(r.phases[0].paths.map((p: { id: string }) => p.id)).toEqual(HOT_PATHS.map((p) => p.id))
      expect(r.phases[0].paths.every((p: { requests: number; p95: number | null }) => p.requests > 0 && p.p95 != null)).toBe(true)
      expect(t.hits()).toBe(10)
    } finally {
      await t.close()
    }
  })

  it('reports a breach when the target is slower than the SLO', async () => {
    const t = await startMockTarget({ delayMs: 30 })
    const tight = SLOS.map((s) => (s.id === 'latency.read-hot-paths' ? { ...s, target: 5 } : s))
    try {
      const r = await runLoad({ origin: t.origin, phases: [{ name: 't', rps: 50, durationS: 0.2 }], slos: tight, ctx: fullCtx })
      expect(r.verdict).toBe('breach')
      expect(r.phases[0].paths.find((p: { id: string }) => p.id === 'feed').verdict).toBe('breach')
      expect(r.phases[0].paths.find((p: { id: string }) => p.id === 'practice-log-write').verdict).toBe('pass')
    } finally {
      await t.close()
    }
  })

  it('reports an error-rate breach when one path answers 500', async () => {
    const t = await startMockTarget({ statusFor: (p: string) => (p === '/events' ? 500 : 200) })
    try {
      const r = await runLoad({ origin: t.origin, phases: [{ name: 't', rps: 50, durationS: 0.2 }], slos, ctx: fullCtx })
      expect(r.verdict).toBe('breach')
      expect(r.phases[0].errorRateVerdict).toBe('breach')
      expect(r.phases[0].paths.find((p: { id: string }) => p.id === 'events-catalog').errorRatePct).toBe(100)
    } finally {
      await t.close()
    }
  })

  it('is incomplete, not passing, when paths are skipped', async () => {
    const t = await startMockTarget()
    try {
      const r = await runLoad({ origin: t.origin, phases: [{ name: 't', rps: 50, durationS: 0.2 }], slos, ctx: { cookie: 'x' } })
      expect(r.verdict).toBe('incomplete')
      expect(r.phases[0].paths.filter((p: { verdict: string }) => p.verdict === 'skipped').map((p: { id: string }) => p.id)).toEqual([
        'circle-detail',
        'practice-log-write',
      ])
    } finally {
      await t.close()
    }
  })
})

describe('the command', () => {
  it('--smoke runs end to end, reads slos.ts and writes a machine-readable report', () => {
    const out = execFileSync(process.execPath, ['scripts/load-soak.mjs', '--smoke', '--json'], { encoding: 'utf8' })
    const report = JSON.parse(out)
    expect(report.mode).toBe('smoke')
    expect(report.verdict).toBe('pass')
    expect(report.target.env).toBe('mock')
    expect(report.slos.source).toBe('lib/observability/slos.ts')
    expect(report.phases[0].paths).toHaveLength(HOT_PATHS.length)
    expect(JSON.stringify(report)).not.toContain('smoke=1') // the cookie never reaches the report
  })
  it('exits 2 on a production target', () => {
    const r = spawnSync(process.execPath, ['scripts/load-soak.mjs', '--target', 'https://frequencylocal.com'], { encoding: 'utf8' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/production/)
  })
})
