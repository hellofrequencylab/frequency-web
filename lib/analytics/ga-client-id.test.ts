import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'

const jar = vi.hoisted(() => ({ get: vi.fn(), audience: vi.fn(async () => true) }))
vi.mock('./audience', () => ({ currentViewerAllowsAnalytics: jar.audience }))
vi.mock('next/headers', () => ({ cookies: async () => jar }))
afterEach(() => { jar.get.mockReset(); jar.audience.mockResolvedValue(true); vi.unstubAllEnvs() })

import { parseGaClientId, parseGaSessionId, GA_CLIENT_ID_META, checkoutGaMetadata } from './ga-client-id'

const CREATORS = [
  'lib/commerce/checkout.ts',
  'lib/billing/tickets.ts',
  'lib/billing/tips.ts',
  'lib/billing/checkout.ts',
  'lib/billing/bundle-checkout.ts',
  'lib/billing/space-donation-checkout.ts',
  'lib/billing/space-plan-checkout.ts',
  'lib/billing/space-membership-checkout.ts',
]

describe('parseGaClientId', () => {
  it('reads the last two numbers off a GA1.1 cookie', () => {
    expect(parseGaClientId('GA1.1.1234567890.1695123456')).toBe('1234567890.1695123456')
  })

  it('reads a GA1.2 cookie the same way', () => {
    expect(parseGaClientId('GA1.2.999.1')).toBe('999.1')
  })

  it('refuses junk rather than guessing', () => {
    expect(parseGaClientId(undefined)).toBeNull()
    expect(parseGaClientId('')).toBeNull()
    expect(parseGaClientId('not-a-ga-cookie')).toBeNull()
    expect(parseGaClientId('GA1.1.abc.def')).toBeNull()
    expect(parseGaClientId('GA1.1.onlythree')).toBeNull()
    expect(parseGaClientId('not-ga.1.123.456')).toBeNull()
    expect(parseGaClientId('GA1.1.123.456.extra')).toBeNull()
  })
})

describe('checkout creators stamp ga_client_id from the shared helper', () => {
  it('every session creator imports checkoutGaMetadata', () => {
    const missing = CREATORS.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return !src.includes("from '@/lib/analytics/ga-client-id'") || !src.includes('checkoutGaMetadata')
    })
    expect(missing, `creators not stamping ${GA_CLIENT_ID_META}: ${missing.join(', ')}`).toEqual([])
  })
})

describe('parseGaSessionId', () => {
  it('reads GS1 and GS2 session cookies', () => {
    expect(parseGaSessionId('GS1.1.1695123456.1.1.1695123500.0.0.0')).toBe('1695123456')
    expect(parseGaSessionId('GS2.1.s1695123456$o1$g1$t1695123500')).toBe('1695123456')
  })
  it('refuses junk', () => {
    expect(parseGaSessionId(undefined)).toBeNull()
    expect(parseGaSessionId('nope')).toBeNull()
  })
})


describe('checkout identity continuity', () => {
  it('carries both browser and session identity into payment metadata', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST')
    jar.get.mockImplementation((key: string) => key === '_ga' ? { value: 'GA1.1.123.456' } : key === '_ga_TEST' ? { value: 'GS2.1.s1695123456$o1' } : undefined)
    expect(await checkoutGaMetadata()).toEqual({ ga_client_id: '123.456', ga_session_id: '1695123456' })
  })
  it('does not invent an identity when no cookie exists', async () => {
    expect(await checkoutGaMetadata()).toEqual({})
  })
})


it('does not reuse stale GA cookies after analytics consent was withdrawn', async () => {
  jar.get.mockImplementation((key: string) => key === 'fq_consent' ? { value: 'denied' } : key === '_ga' ? { value: 'GA1.1.123.456' } : undefined)
  expect(await checkoutGaMetadata()).toEqual({})
})


it('does not reuse browser cookies for an opted-out account or excluded staff viewer', async () => {
  jar.get.mockImplementation((key: string) => key === '_ga' ? { value: 'GA1.1.123.456' } : undefined)
  jar.audience.mockResolvedValue(false)
  expect(await checkoutGaMetadata()).toEqual({})
})
