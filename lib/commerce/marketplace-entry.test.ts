import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  entryPointFromStamp,
  mergeStamp,
  signStamp,
  stampMarketplaceView,
  verifyStamp,
  viewFromPathname,
} from './marketplace-entry'

const SECRET = 'marketplace-entry-test-secret'

describe('viewFromPathname', () => {
  it('stamps a Market product id and ignores the seller storefront', () => {
    expect(viewFromPathname('/market/11111111-2222-3333-4444-555555555555')).toEqual({
      productId: '11111111-2222-3333-4444-555555555555',
    })
    expect(viewFromPathname('/store/11111111-2222-3333-4444-555555555555')).toBeNull()
  })

  it('does not stamp Market index or reserved doors', () => {
    expect(viewFromPathname('/market')).toBeNull()
    expect(viewFromPathname('/market/sell')).toBeNull()
    expect(viewFromPathname('/market/manage')).toBeNull()
    expect(viewFromPathname('/market/new')).toBeNull()
  })

  it('stamps a Journey sales page and its public twin, not a sub-route', () => {
    expect(viewFromPathname('/journeys/house-of-fates')).toEqual({ journeySlug: 'house-of-fates' })
    expect(viewFromPathname('/discover/journeys/house-of-fates')).toEqual({ journeySlug: 'house-of-fates' })
    expect(viewFromPathname('/journeys/house-of-fates/learn')).toBeNull()
    expect(viewFromPathname('/journeys/new')).toBeNull()
    expect(viewFromPathname('/discover/journeys')).toBeNull()
  })
})

describe('sign and verify', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
  })
  afterEach(() => {
    process.env.CRON_SECRET = prev
  })

  it('round-trips a stamp and rejects a forged value', () => {
    const signed = signStamp({ p: ['prod-1'], j: ['house-of-fates'], iat: Date.now() })
    expect(signed).toBeTruthy()
    expect(verifyStamp(signed)?.p).toEqual(['prod-1'])
    expect(verifyStamp(signed)?.j).toEqual(['house-of-fates'])
    expect(verifyStamp('not-a-stamp')).toBeNull()
    const tampered = `${signed!.slice(0, 8)}xxxx${signed!.slice(12)}`
    expect(verifyStamp(tampered)).toBeNull()
  })

  it('fails closed when no secret is configured', () => {
    const keys = [
      'CRON_SECRET',
      'MARKETPLACE_ENTRY_SECRET',
      'OAUTH_STATE_SECRET',
      'UNSUBSCRIBE_SECRET',
      'SUPABASE_SERVICE_ROLE_KEY',
    ] as const
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
    for (const k of keys) delete process.env[k]
    expect(signStamp({ p: ['prod-1'], j: [], iat: Date.now() })).toBeNull()
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('rejects a stamp older than the window', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
    const signed = signStamp({ p: ['prod-1'], j: [], iat: eightDaysAgo })
    expect(verifyStamp(signed)).toBeNull()
  })
})

describe('merge + entryPointFromStamp', () => {
  it('keeps the newest product first and does not drop a Journey slug', () => {
    const first = mergeStamp(null, { productId: 'a' }, 1)
    const second = mergeStamp(first, { productId: 'b' }, 2)
    const withJourney = mergeStamp(second, { journeySlug: 'house-of-fates' }, 3)
    expect(withJourney.p).toEqual(['b', 'a'])
    expect(withJourney.j).toEqual(['house-of-fates'])
  })

  it('classifies only the stamped product, never a sibling listing', () => {
    const stamp = { p: ['prod-1'], j: ['house-of-fates'], iat: 1 }
    expect(entryPointFromStamp(stamp, 'prod-1')).toBe('marketplace')
    expect(entryPointFromStamp(stamp, 'prod-2')).toBeNull()
    expect(entryPointFromStamp(stamp, 'prod-2', 'house-of-fates')).toBe('marketplace')
    expect(entryPointFromStamp(null, 'prod-1')).toBeNull()
  })
})

describe('stampMarketplaceView', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET
  })
  afterEach(() => {
    process.env.CRON_SECRET = prev
  })

  it('returns null on a storefront path so proxy writes nothing', () => {
    expect(stampMarketplaceView('/store/prod-1', undefined)).toBeNull()
    expect(stampMarketplaceView('/feed', undefined)).toBeNull()
  })

  it('accumulates a Market view onto an existing cookie', () => {
    const first = stampMarketplaceView('/market/prod-1', undefined, 10)
    const second = stampMarketplaceView('/market/prod-2', first ?? undefined, 20)
    const stamp = verifyStamp(second, 20)
    expect(stamp?.p).toEqual(['prod-2', 'prod-1'])
  })
})

describe('LIVE-220 · the wiring is server-side', () => {
  const proxy = readFileSync('proxy.ts', 'utf8')
  const action = readFileSync('app/(main)/marketplace/commerce-actions.ts', 'utf8')

  it('proxy stamps discovery views through the pure helper', () => {
    expect(proxy).toMatch(/stampMarketplaceView/)
    expect(proxy).toMatch(/MARKETPLACE_ENTRY_COOKIE/)
    expect(proxy).toMatch(/httpOnly:\s*true/)
  })

  it('startCheckoutAction no longer takes entryPoint as an argument', () => {
    const body = action
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    const fn = body.match(/async function startCheckoutAction[\s\S]{0,1500}?\n\}/)
    expect(fn).toBeTruthy()
    const sig = fn![0].slice(0, fn![0].indexOf('):') + 1)
    expect(sig).not.toMatch(/entryPoint/)
  })
})
