import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { sampleRoute } from './perf-baseline.mjs'

const path = { route: '/events', authed: false }
const settings = { baseUrl: 'https://fixture.invalid', samples: 1, warmup: 0 }

describe('performance sampler outcomes', () => {
  it('does not request authenticated routes anonymously', async () => {
    const fetcher = vi.fn()
    expect(await sampleRoute({ ...path, authed: true }, { ...settings, fetcher })).toMatchObject({ skipped: expect.stringContaining('authenticated') })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([302, 401, 404, 500, 503])('reports HTTP%s as failure without a latency percentile', async status => {
    const body = { cancel: vi.fn().mockResolvedValue(undefined) }
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status, body })
    expect(await sampleRoute(path, { ...settings, fetcher })).toMatchObject({ attempted: 1, samples: 0, failed: 1, failures: { http: { [status]: 1 } }, p50: null, p95: null, p99: null })
    expect(fetcher).toHaveBeenCalledWith('https://fixture.invalid/events', expect.objectContaining({ method: 'GET', redirect: 'manual' }))
    expect(body.cancel).toHaveBeenCalledOnce()
  })
  it.each(['Error', 'TimeoutError', 'AbortError'])('reports %s rather than a fast successful sample', async name => {
    const error = Object.assign(new Error('synthetic failure'), { name })
    const result = await sampleRoute(path, { ...settings, fetcher: vi.fn().mockRejectedValue(error) })
    expect(result).toMatchObject({ samples: 0, failed: 1, p50: null, failures: name === 'Error' ? { network: 1 } : { timeout: 1 } })
  })
  it('measures successful headers before releasing the body and reports mixed outcomes', async () => {
    let clock = 0
    const cancel = vi.fn(async () => { clock += 1000 })
    const answers = [{ ok: true, status: 200 }, { ok: false, status: 503 }, { ok: true, status: 200 }]
    const fetcher = vi.fn(async () => { clock += 10; return { ...answers.shift()!, body: { cancel } } })
    expect(await sampleRoute(path, { ...settings, samples: 3, fetcher, now: () => clock })).toMatchObject({ samples: 2, failed: 1, p50: 10, p95: 10, p99: 10, failures: { http: { 503: 1 } }, cleanupFailures: 0 })
    expect(cancel).toHaveBeenCalledTimes(3)
  })
  it('reports cleanup failures and discarded warmup failures separately', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, body: { cancel: async () => {} } })
      .mockResolvedValueOnce({ ok: true, status: 200, body: { cancel: async () => { throw new Error('synthetic cleanup failure') } } })
    expect(await sampleRoute(path, { ...settings, warmup: 1, fetcher })).toMatchObject({ samples: 1, failed: 0, warmupFailures: 1, cleanupFailures: 1 })
  })
  it.each([{ samples: 0 }, { samples: -1 }, { samples: NaN }, { samples: 1.5 }, { warmup: -1 }])('rejects invalid sample configuration %j before requesting', async input => {
    const fetcher = vi.fn()
    await expect(sampleRoute(path, { ...settings, ...input, fetcher })).rejects.toThrow('positive integer')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('makes the real CLI fail visibly on HTTP errors while still writing JSON', async () => {
    const requested: string[] = []
    const server = createServer((req, res) => { requested.push(req.url ?? ''); res.writeHead(503); res.end('synthetic unavailable') })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing loopback port')
    try {
      const outcome = await promisify(execFile)(process.execPath, ['scripts/perf-baseline.mjs', '--json'], {
        env: { ...process.env, PERF_BASELINE_BASE_URL: `http://127.0.0.1:${address.port}`, PERF_BASELINE_SAMPLES: '1', PERF_BASELINE_WARMUP: '0' },
      }).then(() => { throw new Error('Expected CLI failure') }, error => error)
      expect(outcome.code).toBe(1)
      const result = JSON.parse(outcome.stdout)
      const publicResult = result.paths.find((entry: { id: string }) => entry.id === 'events-catalog')
      expect(publicResult.latency).toMatchObject({ samples: 0, failed: 1, p50: null, failures: { http: { 503: 1 } } })
      expect(requested).toEqual(['/events'])
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
