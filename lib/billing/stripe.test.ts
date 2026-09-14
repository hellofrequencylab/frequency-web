import { afterEach, describe, expect, it, vi } from 'vitest'
import { tierForPrice } from './stripe'

const ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL }
})

// LIVE-215: the module reads its secrets at load, so each case resets the registry and imports a
// fresh copy under the env it describes.
async function secretsUnder(env: Record<string, string | undefined>): Promise<string[]> {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.resetModules()
  const fresh = await import('./stripe')
  return fresh.STRIPE_WEBHOOK_SECRETS
}

describe('STRIPE_WEBHOOK_SECRETS (LIVE-215)', () => {
  it('lists the platform secret first and the Connect secret second', async () => {
    await expect(
      secretsUnder({ STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect' }),
    ).resolves.toEqual(['whsec_platform', 'whsec_connect'])
  })

  it('is the platform secret alone when the Connect secret is unset or blank', async () => {
    await expect(
      secretsUnder({ STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: undefined }),
    ).resolves.toEqual(['whsec_platform'])
    await expect(
      secretsUnder({ STRIPE_WEBHOOK_SECRET: 'whsec_platform', STRIPE_CONNECT_WEBHOOK_SECRET: '  ' }),
    ).resolves.toEqual(['whsec_platform'])
  })

  it('is empty when no secret is set, which is the webhook route 503', async () => {
    await expect(
      secretsUnder({ STRIPE_WEBHOOK_SECRET: undefined, STRIPE_CONNECT_WEBHOOK_SECRET: undefined }),
    ).resolves.toEqual([])
  })
})

// 2026-09-05 (scan2 L3-04): the membershipAmount / priceFor suites that lived here are gone with
// the helpers. Neither had a caller outside this file; checkout mints its own price from the
// member's chosen amount, so the env knobs they read were documentation of nothing.

describe('the Supporter sell path is gone (ADR-878)', () => {
  it('tierForPrice always resolves crew, so a legacy Supporter price keeps paid access', () => {
    process.env.STRIPE_PRICE_SUPPORTER = 'price_supporter_legacy'
    expect(tierForPrice('price_supporter_legacy')).toBe('crew')
    expect(tierForPrice('price_anything')).toBe('crew')
    expect(tierForPrice(null)).toBe('crew')
  })
})
