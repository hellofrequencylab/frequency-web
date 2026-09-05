import { describe, it, expect, afterEach, vi } from 'vitest'
import { gaEventName, gaServerEnabled, sendGa4Event } from './ga-server'

// The ids are read at MODULE LOAD, so the deployment-gate cases below stub the env, reset the
// module registry and re-import (the lib/rate-limit.test.ts pattern).
async function loadGaServer() {
  vi.resetModules()
  return import('./ga-server')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('ga-server', () => {
  it('normalizes dotted taxonomy names to GA4 snake_case', () => {
    expect(gaEventName('qr.scanned')).toBe('qr_scanned')
    expect(gaEventName('qr.referral_signup')).toBe('qr_referral_signup')
    expect(gaEventName('nav.page_view')).toBe('nav_page_view')
  })

  it('is inert without configuration (no env in test)', () => {
    expect(gaServerEnabled()).toBe(false)
  })

  it('no-ops (resolves, never throws) when GA is not configured', async () => {
    await expect(sendGa4Event('qr.scanned', { purpose: 'connect' }, 'p1')).resolves.toBeUndefined()
  })
})

// 2026-09-05 (scan2 L3-03). "Production" is the Vercel production deployment, not NODE_ENV: Next
// forces NODE_ENV=production on every Vercel build, previews included, and the header comment
// promises preview traffic never reaches the property.
describe('gaServerEnabled deployment gate', () => {
  function configure() {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123')
    vi.stubEnv('GA_API_SECRET', 'secret')
  }

  it('stays OFF on a Vercel PREVIEW even though NODE_ENV is production', async () => {
    configure()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const mod = await loadGaServer()
    expect(mod.gaServerEnabled()).toBe(false)
  })

  it('is ON for the Vercel PRODUCTION deployment', async () => {
    configure()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    const mod = await loadGaServer()
    expect(mod.gaServerEnabled()).toBe(true)
  })

  it('falls back to NODE_ENV only when VERCEL_ENV is unset (a non-Vercel production host)', async () => {
    configure()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    const mod = await loadGaServer()
    expect(mod.gaServerEnabled()).toBe(true)
  })

  it('stays OFF with both ids set when the deployment is not production', async () => {
    configure()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VERCEL_ENV', '')
    const mod = await loadGaServer()
    expect(mod.gaServerEnabled()).toBe(false)
  })
})
