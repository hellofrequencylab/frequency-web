import { describe, it, expect, beforeEach, vi } from 'vitest'

// The purchase step (LIVE-781): Stripe confirms payment, THEN the domain is bought at Vercel, exactly
// once. A retried webhook, the on-page settle and the success redirect can all deliver the same paid
// session; only the delivery that claims the `pending` row may buy.

type Row = Record<string, unknown>

/** A tiny in-memory PostgREST: update/insert/select with eq and is filters, enough for this module. */
function fakeDb(tables: Record<string, Row[]>) {
  function builder(table: string, op: 'update' | 'select', patch?: Row) {
    const filters: [string, unknown, 'eq' | 'is'][] = []
    let selecting = false
    const run = () => {
      const rows = (tables[table] ??= [])
      const hits = rows.filter((r) => filters.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)))
      if (op === 'update') for (const r of hits) Object.assign(r, patch)
      return { data: op === 'select' || selecting ? hits.map((r) => ({ ...r })) : null, error: null }
    }
    const b = {
      eq(c: string, v: unknown) {
        filters.push([c, v, 'eq'])
        return b
      },
      is(c: string, v: unknown) {
        filters.push([c, v, 'is'])
        return b
      },
      select() {
        selecting = true
        return b
      },
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
        try {
          resolve(run())
        } catch (e) {
          reject(e)
        }
      },
    }
    return b
  }
  return {
    from(table: string) {
      return {
        update: (patch: Row) => builder(table, 'update', patch),
        select: () => builder(table, 'select'),
        insert: async (row: Row) => {
          ;(tables[table] ??= []).push({ ...row })
          return { error: null }
        },
      }
    },
  }
}

const tables: Record<string, Row[]> = {}
const buyDomain = vi.fn()
const getDomainOrder = vi.fn()
const addSiteDomain = vi.fn()
const refundsCreate = vi.fn()
const paymentMethodsList = vi.fn()
const sessionsCreate = vi.fn()
const getDomainAvailability = vi.fn()
const getDomainPrice = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb(tables) }))
vi.mock('@/lib/billing/stripe', () => ({
  stripe: {
    refunds: { create: (...a: unknown[]) => refundsCreate(...a) },
    paymentMethods: { list: (...a: unknown[]) => paymentMethodsList(...a) },
    checkout: { sessions: { retrieve: vi.fn(), create: (...a: unknown[]) => sessionsCreate(...a), expire: vi.fn() } },
  },
  appUrl: () => 'https://app.test',
}))
vi.mock('@/lib/pricing/settings', () => ({
  domainPurchaseEnabled: async () => true,
  getDomainMarkupCents: async () => 300,
}))
vi.mock('@/lib/billing/receipt-address', () => ({ receiptEmailFor: async () => 'owner@example.test' }))
vi.mock('./vercel-domains', () => ({ addSiteDomain: (...a: unknown[]) => addSiteDomain(...a) }))
vi.mock('./registrar', () => ({
  buyDomain: (...a: unknown[]) => buyDomain(...a),
  getDomainOrder: (...a: unknown[]) => getDomainOrder(...a),
  getDomainAvailability: (...a: unknown[]) => getDomainAvailability(...a),
  getDomainPrice: (...a: unknown[]) => getDomainPrice(...a),
  registrarConfigured: () => true,
}))

const { recordDomainPurchaseFromSession, abandonDomainPurchaseFromSession, renewalDate, createDomainPurchaseCheckout } =
  await import('./domain-purchase')

const REGISTRANT = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  phone: '+14155550123',
  address1: '1 Main St',
  city: 'Portland',
  state: 'OR',
  zip: '97201',
  country: 'US',
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1',
    payment_status: 'paid',
    payment_intent: 'pi_1',
    customer: 'cus_1',
    metadata: { kind: 'domain_purchase', space_id: 'space-1', purchase_id: 'p-1', domain: 'adalovelace.com' },
    ...overrides,
  } as never
}

beforeEach(() => {
  tables.space_domain_purchases = [
    {
      id: 'p-1',
      space_id: 'space-1',
      domain: 'adalovelace.com',
      years: 1,
      vercel_price_cents: 1125,
      markup_cents: 300,
      price_cents: 1425,
      status: 'pending',
      registrant: { ...REGISTRANT },
      stripe_checkout_session_id: 'cs_test_1',
      stripe_customer_id: null,
    },
  ]
  tables.spaces = [{ id: 'space-1', domain: null, stripe_customer_id: null }]
  buyDomain.mockReset().mockResolvedValue({ ok: true, data: { orderId: 'ord_1' } })
  getDomainOrder.mockReset().mockResolvedValue({ ok: true, data: { status: 'completed' } })
  addSiteDomain.mockReset().mockResolvedValue({ ok: true })
  refundsCreate.mockReset().mockResolvedValue({ id: 're_1' })
  paymentMethodsList.mockReset().mockResolvedValue({ data: [{ id: 'pm_1' }] })
  sessionsCreate.mockReset().mockResolvedValue({ id: 'cs_new', url: null, client_secret: 'cs_secret' })
  getDomainAvailability.mockReset().mockResolvedValue({ ok: true, data: { available: true } })
  getDomainPrice.mockReset().mockResolvedValue({ ok: true, data: { years: 1, purchaseCents: 1125, renewalCents: 1125 } })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('createDomainPurchaseCheckout', () => {
  const start = (shownTotalCents: number) =>
    createDomainPurchaseCheckout({ spaceId: 'space-1', domain: 'newname.com', shownTotalCents, contact: REGISTRANT, ui: 'elements' })

  it('charges Vercel price plus markup, stamps its kind, and writes the pending row before handing back', async () => {
    const r = await start(1425)
    expect(r).toEqual({ clientSecret: 'cs_secret', sessionId: 'cs_new' })
    const params = sessionsCreate.mock.calls[0][0]
    expect(params.mode).toBe('payment')
    expect(params.line_items[0].price_data.unit_amount).toBe(1425)
    expect(params.metadata).toMatchObject({ kind: 'domain_purchase', space_id: 'space-1', domain: 'newname.com' })
    const row = tables.space_domain_purchases.find((p) => p.stripe_checkout_session_id === 'cs_new')
    expect(row).toMatchObject({ status: 'pending', vercel_price_cents: 1125, markup_cents: 300, price_cents: 1425 })
  })

  it('refuses when the price moved since the owner saw it, and opens no session', async () => {
    const r = await start(1300)
    expect(r.error).toMatch(/price/)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('refuses a name that was taken in the meantime', async () => {
    getDomainAvailability.mockResolvedValue({ ok: true, data: { available: false } })
    const r = await start(1425)
    expect(r.error).toMatch(/not available/)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })
})

describe('recordDomainPurchaseFromSession', () => {
  it('buys once after payment, records the order and renewal, then binds and attaches the domain', async () => {
    await expect(recordDomainPurchaseFromSession(session())).resolves.toBe('registered')
    expect(buyDomain).toHaveBeenCalledTimes(1)
    expect(buyDomain).toHaveBeenCalledWith('adalovelace.com', { expectedPriceCents: 1125, autoRenew: true, contact: REGISTRANT })
    const row = tables.space_domain_purchases[0]
    expect(row.status).toBe('registered')
    expect(row.vercel_order_id).toBe('ord_1')
    expect(row.auto_renew).toBe(true)
    expect(row.stripe_payment_intent_id).toBe('pi_1')
    expect(typeof row.renews_at).toBe('string')
    // The registry holds the registrant now; Frequency keeps no copy.
    expect(row.registrant).toBeNull()
    expect(tables.spaces[0].domain).toBe('adalovelace.com')
    expect(tables.spaces[0].stripe_customer_id).toBe('cus_1')
    expect(addSiteDomain).toHaveBeenCalledWith('adalovelace.com')
  })

  it('a retried webhook, the on-page settle and the redirect never buy twice', async () => {
    await recordDomainPurchaseFromSession(session())
    await expect(recordDomainPurchaseFromSession(session())).resolves.toBeNull()
    await expect(recordDomainPurchaseFromSession(session())).resolves.toBeNull()
    expect(buyDomain).toHaveBeenCalledTimes(1)
  })

  it('two deliveries racing still buy once (the claim is one conditional update)', async () => {
    const results = await Promise.all([recordDomainPurchaseFromSession(session()), recordDomainPurchaseFromSession(session())])
    expect(results.filter((r) => r !== null)).toHaveLength(1)
    expect(buyDomain).toHaveBeenCalledTimes(1)
  })

  it('buys nothing before Stripe confirms payment', async () => {
    await expect(recordDomainPurchaseFromSession(session({ payment_status: 'unpaid' }))).resolves.toBeNull()
    expect(buyDomain).not.toHaveBeenCalled()
    expect(tables.space_domain_purchases[0].status).toBe('pending')
  })

  it('ignores a session that is not a domain purchase', async () => {
    await expect(recordDomainPurchaseFromSession(session({ metadata: { kind: 'tip' } }))).resolves.toBeNull()
    expect(buyDomain).not.toHaveBeenCalled()
  })

  it('leaves auto-renew off when the Space has no saved payment method', async () => {
    paymentMethodsList.mockResolvedValue({ data: [] })
    await recordDomainPurchaseFromSession(session())
    expect(buyDomain.mock.calls[0][1].autoRenew).toBe(false)
    expect(tables.space_domain_purchases[0].auto_renew).toBe(false)
  })

  it('records an order Vercel has not finished as ordered', async () => {
    getDomainOrder.mockResolvedValue({ ok: true, data: { status: 'purchasing' } })
    await expect(recordDomainPurchaseFromSession(session())).resolves.toBe('ordered')
  })

  it('refunds the Space in full, once, when Vercel refuses after payment', async () => {
    buyDomain.mockResolvedValue({ ok: false, error: 'unavailable' })
    await expect(recordDomainPurchaseFromSession(session())).resolves.toBe('refunded')
    expect(refundsCreate).toHaveBeenCalledTimes(1)
    const [params, options] = refundsCreate.mock.calls[0]
    expect(params).toMatchObject({ payment_intent: 'pi_1' })
    expect(options).toEqual({ idempotencyKey: 'domain-purchase-refund:p-1' })
    expect(tables.space_domain_purchases[0]).toMatchObject({ status: 'refunded', failure_reason: 'unavailable' })
    expect(tables.spaces[0].domain).toBeNull()
    // A redelivery does not refund or buy again.
    await recordDomainPurchaseFromSession(session())
    expect(refundsCreate).toHaveBeenCalledTimes(1)
  })

  it('marks the row failed when the refund itself does not land, so it is visible', async () => {
    buyDomain.mockResolvedValue({ ok: false, error: 'upstream' })
    refundsCreate.mockRejectedValue(new Error('stripe down'))
    await expect(recordDomainPurchaseFromSession(session())).resolves.toBe('failed')
    expect(tables.space_domain_purchases[0].status).toBe('failed')
  })

  it('never replaces a domain the Space already has', async () => {
    tables.spaces[0].domain = 'existing.com'
    await recordDomainPurchaseFromSession(session())
    expect(tables.spaces[0].domain).toBe('existing.com')
  })
})

describe('abandonDomainPurchaseFromSession', () => {
  it('releases a pending row and clears the registrant, and touches nothing paid', async () => {
    await abandonDomainPurchaseFromSession(session())
    expect(tables.space_domain_purchases[0]).toMatchObject({ status: 'abandoned', registrant: null })
    tables.space_domain_purchases[0].status = 'registered'
    await abandonDomainPurchaseFromSession(session())
    expect(tables.space_domain_purchases[0].status).toBe('registered')
  })
})

describe('renewalDate', () => {
  it('is one year on', () => {
    expect(renewalDate(new Date('2026-10-06T12:00:00Z'))).toBe('2027-10-06T12:00:00.000Z')
  })
})
