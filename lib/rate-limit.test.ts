import { describe, it, expect, afterEach, vi } from 'vitest'

// The limiter reads its env (Upstash creds + prod flag) at MODULE LOAD, so each case stubs the env,
// resets the module registry, and re-imports. With no KV_REST_API_* configured the limiter is
// unconfigured — the behavior under test is what an unconfigured limiter returns.
async function loadRateLimit() {
  vi.resetModules()
  return import('./rate-limit')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('rateLimitOk (unconfigured limiter)', () => {
  it('no-ops (allows) in dev/test when Upstash is absent', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', '')
    const { rateLimitOk } = await loadRateLimit()
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m')).toBe(true)
  })

  it('fails CLOSED (denies) in production when Upstash is absent', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    const { rateLimitOk } = await loadRateLimit()
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m')).toBe(false)
  })

  it('fails CLOSED (denies) when VERCEL_ENV is production', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', 'production')
    const { rateLimitOk } = await loadRateLimit()
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m')).toBe(false)
  })
})
