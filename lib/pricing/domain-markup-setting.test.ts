import { describe, it, expect, beforeEach, vi } from 'vitest'

// The domain markup is an OPERATOR SETTING (owner ruling 2026-10-06, LIVE-781): the `domain_markup`
// pricing_settings row, read fail-safe to $3 a year. And domain sales stay OFF unless both the billing
// master switch and `domain_purchase_enabled` are on.

let settingsRows: { key: string; value: unknown }[] | null = []
let settingsError: unknown = null
let flagRows: { key: string; value: unknown }[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'pricing_settings') return Promise.resolve({ data: settingsRows, error: settingsError })
        return { in: () => Promise.resolve({ data: flagRows, error: null }) }
      },
    }),
  }),
}))
let stripeKeys = true
vi.mock('@/lib/billing/stripe', () => ({ billingEnabled: () => stripeKeys }))

async function load() {
  vi.resetModules()
  return import('./settings')
}

beforeEach(() => {
  settingsRows = []
  settingsError = null
  flagRows = []
  stripeKeys = true
})

describe('getDomainMarkupCents', () => {
  it('reads the operator-stored markup', async () => {
    settingsRows = [{ key: 'domain_markup', value: { cents: 450 } }]
    const { getDomainMarkupCents } = await load()
    await expect(getDomainMarkupCents()).resolves.toBe(450)
  })

  it('an operator may set it to zero (sell at cost)', async () => {
    settingsRows = [{ key: 'domain_markup', value: { cents: 0 } }]
    const { getDomainMarkupCents } = await load()
    await expect(getDomainMarkupCents()).resolves.toBe(0)
  })

  it('defaults to $3 a year with no row stored', async () => {
    const { getDomainMarkupCents } = await load()
    await expect(getDomainMarkupCents()).resolves.toBe(300)
  })

  it('defaults to $3 a year when the read fails, never to zero', async () => {
    settingsRows = null
    settingsError = { message: 'relation does not exist' }
    const { getDomainMarkupCents } = await load()
    await expect(getDomainMarkupCents()).resolves.toBe(300)
  })
})

describe('domainPurchaseEnabled', () => {
  it('is off by default', async () => {
    flagRows = [{ key: 'billing_live', value: true }]
    const { domainPurchaseEnabled } = await load()
    await expect(domainPurchaseEnabled()).resolves.toBe(false)
  })

  it('is off while billing is off, even with the switch on', async () => {
    flagRows = [{ key: 'domain_purchase_enabled', value: true }]
    const { domainPurchaseEnabled } = await load()
    await expect(domainPurchaseEnabled()).resolves.toBe(false)
  })

  it('is on only with billing live and the switch on', async () => {
    flagRows = [
      { key: 'billing_live', value: true },
      { key: 'domain_purchase_enabled', value: true },
    ]
    const { domainPurchaseEnabled } = await load()
    await expect(domainPurchaseEnabled()).resolves.toBe(true)
  })

  it('is off without the Stripe keys', async () => {
    stripeKeys = false
    flagRows = [
      { key: 'billing_live', value: true },
      { key: 'domain_purchase_enabled', value: true },
    ]
    const { domainPurchaseEnabled } = await load()
    await expect(domainPurchaseEnabled()).resolves.toBe(false)
  })
})
