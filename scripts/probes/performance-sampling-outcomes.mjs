import assert from 'node:assert/strict'
import { sampleRoute } from '../perf-baseline.mjs'
const options = { baseUrl: 'https://fixture.invalid', samples: 1, warmup: 0 }
const route = { route: '/events', authed: false }
for (const status of [302, 401, 503]) {
  let released = 0
  const result = await sampleRoute(route, { ...options, fetcher: async (_, init) => {
    assert.equal(init.redirect, 'manual')
    return { ok: false, status, body: { cancel: async () => { released++ } } }
  } })
  assert.equal(result.samples, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.p50, null)
  assert.equal(result.failures.http[status], 1)
  assert.equal(released, 1)
}
for (const name of ['Error', 'TimeoutError']) {
  const result = await sampleRoute(route, { ...options, fetcher: async () => { throw Object.assign(new Error('fixture failure'), { name }) } })
  assert.equal(result.samples, 0)
  assert.equal(result.failed, 1)
  assert.equal(result.p95, null)
  assert.equal(result.failures[name === 'Error' ? 'network' : 'timeout'], 1)
}
let requests = 0
assert.ok((await sampleRoute({ ...route, authed: true }, { ...options, fetcher: async () => { requests++; throw new Error('must not request') } })).skipped)
assert.equal(requests, 0)
let clock = 0
const result = await sampleRoute(route, { ...options, now: () => clock, fetcher: async () => {
  clock += 12
  return { ok: true, status: 200, body: { cancel: async () => { clock += 1000 } } }
} })
assert.equal(result.samples, 1)
assert.equal(result.failed, 0)
assert.equal(result.p50, 12)
assert.equal(clock, 1012)
console.log('Actual sampler skips anonymous auth probes, excludes HTTP/network/timeout failures from percentiles, and releases response bodies after timing headers.')
