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
  vi.unstubAllGlobals()
})

describe('ga-server', () => {
  it('normalizes dotted taxonomy names to GA4 snake_case', () => {
    expect(gaEventName('qr.scanned')).toBe('qr_scanned')
    expect(gaEventName('qr.referral_signup')).toBe('qr_referral_signup')
    expect(gaEventName('nav.page_view')).toBe('nav_page_view')
  })

  it('maps commerce.purchase to the recommended GA4 purchase event', () => {
    expect(gaEventName('commerce.purchase')).toBe('purchase')
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

describe('sendGa4Event uses the browser client id for a purchase', () => {
  it('prefers opts.clientId over the profile id, and names the event purchase', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123')
    vi.stubEnv('GA_API_SECRET', 'secret')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    const { sendGa4Event } = await loadGaServer()
    await sendGa4Event(
      'commerce.purchase',
      { value: 8, currency: 'usd', transaction_id: 'cs_1' },
      'profile-1',
      { clientId: '123.456' },
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      client_id: string
      user_id: string
      events: Array<{ name: string; params: Record<string, unknown> }>
    }
    expect(body.client_id).toBe('123.456')
    expect(body.user_id).toBe('profile-1')
    expect(body.events[0].name).toBe('purchase')
    expect(body.events[0].params).toEqual({ value: 8, currency: 'usd', transaction_id: 'cs_1' })
  })
})
