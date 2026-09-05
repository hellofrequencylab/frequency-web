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

  // 2026-09-05 (scan2 L3-03). Next forces NODE_ENV=production on every Vercel build, previews
  // included, so a preview without KV used to DENY the 29 default-policy call sites. A preview is
  // not production: the limiter must no-op there, exactly as the header comment promises.
  it('no-ops (allows) on a Vercel PREVIEW even though NODE_ENV is production', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const { rateLimitOk } = await loadRateLimit()
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m')).toBe(true)
  })

  it('no-ops (allows) on a Vercel DEVELOPMENT deploy even though NODE_ENV is production', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'development')
    const { rateLimitOk } = await loadRateLimit()
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m')).toBe(true)
  })
})

describe('rateLimitOk whenUnconfigured: allow', () => {
  // The escape hatch sign-in needed (LIVE-043). Fail-closed is right for a public write and
  // catastrophic for the front door: an absent KV token would deny every sign-in and every
  // sign-up on a product that is otherwise up. These two cases are the whole contract — the
  // override changes the UNCONFIGURED answer in production and changes nothing else.
  it('allows in production when Upstash is absent, where the default would deny', async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    const { rateLimitOk } = await loadRateLimit()
    // Same call, same env, opposite answers: that IS the option.
    expect(await rateLimitOk('signin:ip', '1.2.3.4', 10, '10 m')).toBe(false)
    expect(await rateLimitOk('signin:ip', '1.2.3.4', 10, '10 m', { whenUnconfigured: 'allow' })).toBe(true)
  })

  it("passing 'deny' explicitly is the default, so no existing caller changed", async () => {
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    const { rateLimitOk } = await loadRateLimit()
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m', { whenUnconfigured: 'deny' })).toBe(false)
    expect(await rateLimitOk('subscribe', '1.2.3.4', 5, '10 m', {})).toBe(false)
  })
})

