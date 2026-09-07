import { describe, it, expect, beforeEach, vi } from 'vitest'

// HYG-049 (ADR-1227). A synced Stripe price id used to carry no account or livemode, so a row
// minted by a different account than the key in force was indistinguishable from a missing one:
// Stripe answered "No such price" and the member read it as an outage. These tests pin the
// consequence: the resolver REFUSES a foreign row and names it, allows an unstamped (pre-HYG-049)
// row exactly as before, never convicts on an unknown live half, and the upsert stamps the key's
// identity onto every row it writes.

const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  upserts: [] as Record<string, unknown>[],
  live: { accountId: 'acct_live' as string | null, livemode: true as boolean | null },
  errors: [] as { event: string; fields?: Record<string, unknown> }[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'pricing_stripe_prices') throw new Error(`unexpected table ${table}`)
      return {
        select: () => Promise.resolve({ data: state.rows, error: null }),
        upsert: (row: Record<string, unknown>) => {
          state.upserts.push(row)
          return Promise.resolve({ error: null })
        },
      }
    },
  }),
}))
vi.mock('./stripe', () => ({
  keyLivemode: () => state.live.livemode,
  stripeAccountId: () => Promise.resolve(state.live.accountId),
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: () => {},
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => state.errors.push({ event, fields }),
  },
}))

import { loadStripePriceMap, priceProvenance, resolveStripePriceId, upsertStripePrice } from './pricing-prices'

const row = (over: Record<string, unknown> = {}) => ({
  key: 'business_base_month',
  stripe_product_id: 'prod_1',
  stripe_price_id: 'price_1',
  archived: false,
  updated_at: '2026-08-19T00:00:00Z',
  updated_by: null,
  stripe_account_id: 'acct_live',
  livemode: true,
  ...over,
})

beforeEach(() => {
  state.rows = []
  state.upserts = []
  state.errors = []
  state.live = { accountId: 'acct_live', livemode: true }
})

describe('priceProvenance (pure)', () => {
  it('a row with no provenance at all is unstamped: synced before the columns existed', () => {
    expect(priceProvenance({ stripe_account_id: null, livemode: null }, { accountId: 'acct_live', livemode: true })).toBe('unstamped')
  })
  it('a row from another account is foreign, whatever its mode', () => {
    expect(priceProvenance({ stripe_account_id: 'acct_other', livemode: true }, { accountId: 'acct_live', livemode: true })).toBe('foreign')
  })
  it('a row minted in the other mode is foreign even on the same account', () => {
    expect(priceProvenance({ stripe_account_id: 'acct_live', livemode: false }, { accountId: 'acct_live', livemode: true })).toBe('foreign')
  })
  it('an UNKNOWN live half never convicts: account lookup failed, livemode still compared', () => {
    expect(priceProvenance({ stripe_account_id: 'acct_other', livemode: true }, { accountId: null, livemode: true })).toBe('ok')
    expect(priceProvenance({ stripe_account_id: 'acct_other', livemode: false }, { accountId: null, livemode: true })).toBe('foreign')
  })
  it('a half-stamped row is judged on the half it has', () => {
    expect(priceProvenance({ stripe_account_id: null, livemode: false }, { accountId: 'acct_live', livemode: true })).toBe('foreign')
    expect(priceProvenance({ stripe_account_id: 'acct_live', livemode: null }, { accountId: 'acct_live', livemode: true })).toBe('ok')
  })
})

describe('resolveStripePriceId refuses a foreign price and names it', () => {
  it('resolves a row minted by the key in force', async () => {
    state.rows = [row()]
    expect(await resolveStripePriceId('business_base_month')).toBe('price_1')
    expect(state.errors).toEqual([])
  })

  it('returns null for a row minted by another account, and logs which key and which accounts', async () => {
    state.rows = [row({ stripe_account_id: 'acct_other' })]
    expect(await resolveStripePriceId('business_base_month')).toBeNull()
    expect(state.errors).toEqual([
      {
        event: 'billing.price.foreign',
        fields: {
          key: 'business_base_month',
          stripe_price_id: 'price_1',
          row_account: 'acct_other',
          row_livemode: true,
          key_account: 'acct_live',
          key_livemode: true,
        },
      },
    ])
  })

  it('returns null for a test-mode row under a live key (the test/live swap)', async () => {
    state.rows = [row({ livemode: false })]
    expect(await resolveStripePriceId('business_base_month')).toBeNull()
    expect(state.errors[0]?.event).toBe('billing.price.foreign')
  })

  it('a pre-HYG-049 row (no provenance) resolves exactly as before', async () => {
    state.rows = [row({ stripe_account_id: null, livemode: null })]
    expect(await resolveStripePriceId('business_base_month')).toBe('price_1')
    expect(state.errors).toEqual([])
  })

  it('a row read from a tree ahead of the migration (columns absent) is unstamped, not foreign', async () => {
    const legacy = row()
    delete (legacy as Record<string, unknown>).stripe_account_id
    delete (legacy as Record<string, unknown>).livemode
    state.rows = [legacy]
    expect((await loadStripePriceMap()).business_base_month).toMatchObject({ stripe_account_id: null, livemode: null })
    expect(await resolveStripePriceId('business_base_month')).toBe('price_1')
  })

  it('a failed account lookup does not switch billing off: livemode alone decides', async () => {
    state.live = { accountId: null, livemode: true }
    state.rows = [row()]
    expect(await resolveStripePriceId('business_base_month')).toBe('price_1')
  })

  it('an unsynced key is still null, with nothing logged', async () => {
    expect(await resolveStripePriceId('nope')).toBeNull()
    expect(state.errors).toEqual([])
  })
})

describe('upsertStripePrice stamps the row with the key that minted it', () => {
  it('stamps the live key identity by default', async () => {
    await upsertStripePrice({ key: 'k', stripe_product_id: 'prod', stripe_price_id: 'price', changedBy: 'op' })
    expect(state.upserts[0]).toMatchObject({ key: 'k', stripe_account_id: 'acct_live', livemode: true, updated_by: 'op' })
  })
  it('keeps an explicit provenance (the retired-key archive pass re-saves ids it did not mint)', async () => {
    await upsertStripePrice({
      key: 'k',
      stripe_product_id: 'prod',
      stripe_price_id: 'price',
      archived: true,
      provenance: { stripe_account_id: 'acct_old', livemode: false },
    })
    expect(state.upserts[0]).toMatchObject({ archived: true, stripe_account_id: 'acct_old', livemode: false })
  })
})
