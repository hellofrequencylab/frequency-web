import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/billing/stripe', () => ({ stripe: null }))
vi.mock('./domain-purchase', () => ({ domainPurchaseOpen: async () => false, renewalDate: (d: Date) => { const date = new Date(d); date.setUTCFullYear(date.getUTCFullYear() + 1); return date.toISOString() } }))
import { ensureDomainRefund, reconcileDomainRow, type DomainRenewalRow, type RenewalDeps } from './domain-renewals'
function fixture() {
  const row: DomainRenewalRow = { id: 'purchase', space_id: 'space', domain: 'example.test', status: 'registered',
    updated_at: '2026-10-01T00:00:00Z', renews_at: '2026-11-01T00:00:00Z', renewal_price_cents: 1500,
    markup_cents: 300, stripe_customer_id: 'customer', stripe_payment_intent_id: 'purchase-intent', vercel_order_id: 'purchase-order',
    renewal_state: null, renewal_due_at: null, renewal_intent_id: null, renewal_order_id: null, renewal_vercel_cents: null }
  const stored = { ...row }
  const patches: Record<string, unknown>[] = []
  const client = { from(table: string) {
    let patch: Record<string, unknown> = {}; const filters: [string, unknown][] = []
    const result = () => {
      if (table === 'spaces') return { data: { owner_profile_id: 'owner' }, error: null }
      if (filters.some(([key, value]) => stored[key as keyof DomainRenewalRow] !== value)) return { data: [], error: null }
      Object.assign(stored, patch); patches.push(patch); return { data: [{ id: row.id }], error: null }
    }
    const query = { update(p: Record<string, unknown>) { patch = p; return query },
      eq(key: string, value: unknown) { filters.push([key, value]); return query }, is(key: string, value: unknown) { return query.eq(key, value) },
      select() { return query }, maybeSingle: async () => result(), insert: async () => ({ error: null }),
      then(resolve: (value: ReturnType<typeof result>) => void) { resolve(result()) } }
    return query
  // eslint-disable-next-line no-restricted-syntax -- in-memory query double, not a service-role client
  } } as unknown as SupabaseClient
  const deps: RenewalDeps = { client, now: () => new Date('2026-10-08T00:00:00Z'), open: async () => true,
    order: vi.fn(async () => ({ ok: true as const, data: { status: 'completed' as const } })),
    expiration: vi.fn(async () => ({ ok: true as const, data: { expiresAt: Date.parse('2026-11-01T00:00:00Z') } })),
    price: vi.fn(async () => ({ ok: true as const, data: { years: 1, purchaseCents: 1200, renewalCents: 1200 } })),
    renew: vi.fn(async () => ({ ok: true as const, data: { orderId: 'renewal-order' } })),
    autoRenew: vi.fn(async () => ({ ok: true as const, data: { autoRenew: false } })),
    charge: vi.fn(async () => ({ id: 'renewal-intent', status: 'succeeded' })), refund: vi.fn(async () => {}) }
  return { row, stored, deps, patches }
}
describe('domain renewal financial transitions', () => {
  it('claims once, charges once, submits once; advances expiration only after the order completes', async () => {
    const { row, stored, deps } = fixture()
    await reconcileDomainRow(row, deps)
    expect(deps.charge).toHaveBeenCalledTimes(1); expect(deps.renew).toHaveBeenCalledTimes(1)
    expect(stored.renews_at).toBe('2026-11-01T00:00:00Z'); expect(stored.renewal_state).toBe('ordered')
    await reconcileDomainRow({ ...stored }, deps)
    expect(stored.renews_at).toBe('2027-11-01T00:00:00.000Z')
    await reconcileDomainRow({ ...stored }, deps)
    expect(deps.charge).toHaveBeenCalledTimes(1)
  })
  it('an overlapping stale reader cannot charge or submit twice', async () => {
    const { row, deps } = fixture(); const stale = { ...row }
    await reconcileDomainRow(row, deps); await reconcileDomainRow(stale, deps)
    expect(deps.charge).toHaveBeenCalledTimes(1); expect(deps.renew).toHaveBeenCalledTimes(1)
  })
  it.each(['charging', 'renewing', 'attention'])('surfaces %s without retrying charges, renewing or refunding blindly', async (state) => {
    const { row, deps } = fixture(); row.renewal_state = state
    expect(await reconcileDomainRow(row, deps)).toBe('attention')
    expect(deps.charge).not.toHaveBeenCalled(); expect(deps.renew).not.toHaveBeenCalled(); expect(deps.refund).not.toHaveBeenCalled()
  })
  it('disables auto-renew before charging and does not charge when disabling fails', async () => {
    const { row, deps } = fixture(); deps.autoRenew = vi.fn(async () => ({ ok: false as const, error: 'network' as const }))
    await expect(reconcileDomainRow(row, deps)).rejects.toThrow('disable')
    expect(deps.charge).not.toHaveBeenCalled()
  })
  it('price drift requires review and never charges a different amount', async () => {
    const { row, deps, stored } = fixture(); row.renewal_price_cents = 1400
    expect(await reconcileDomainRow(row, deps)).toBe('attention'); expect(deps.charge).not.toHaveBeenCalled()
    expect(stored.renewal_state).toBe('attention')
  })
  it('a card refusal leaves expiration unchanged and registrar auto-renew off', async () => {
    const { row, deps, stored } = fixture(); deps.charge = vi.fn(async () => null)
    expect(await reconcileDomainRow(row, deps)).toBe('attention'); expect(deps.renew).not.toHaveBeenCalled()
    expect(stored.renews_at).toBe(row.renews_at); expect(deps.autoRenew).toHaveBeenCalledWith(row.domain, false)
  })
  it('provider timeout is ambiguous and never automatically refunds a possibly delivered renewal', async () => {
    const { row, deps, stored } = fixture(); deps.renew = vi.fn(async () => ({ ok: false as const, error: 'network' as const }))
    expect(await reconcileDomainRow(row, deps)).toBe('attention'); expect(deps.refund).not.toHaveBeenCalled()
    expect(stored.renewal_state).toBe('renewing')
  })
  it('failed asynchronous registration refunds under the original purchase key', async () => {
    const { row, deps, stored } = fixture(); row.status = 'ordered'
    deps.order = vi.fn(async () => ({ ok: true as const, data: { status: 'failed' as const } }))
    await reconcileDomainRow(row, deps)
    expect(deps.refund).toHaveBeenCalledWith('purchase-intent', 'domain-purchase-refund:purchase')
    expect(stored.status).toBe('refunded')
  })
  it('failed renewal order refunds under a period-specific key and does not advance expiry', async () => {
    const { row, deps, stored } = fixture(); await reconcileDomainRow(row, deps)
    deps.order = vi.fn(async () => ({ ok: true as const, data: { status: 'failed' as const } }))
    await reconcileDomainRow(row, deps)
    expect(deps.refund).toHaveBeenCalledWith('renewal-intent', 'domain-renewal-refund:purchase:2026-11-01T00:00:00Z')
    expect(stored.renews_at).toBe('2026-11-01T00:00:00Z')
  })
})


describe('refund retries after the provider idempotency window', () => {
  it('reuses an already succeeded domain refund without issuing another refund', async () => {
    const client = { refunds: { list: vi.fn(async () => ({ has_more: false, data: [{ id: 're_prior', status: 'succeeded', metadata: { domain_purchase_id: 'purchase' } }] })), create: vi.fn() } }
    await ensureDomainRefund(client, 'intent', 'domain-purchase-refund:purchase')
    expect(client.refunds.create).not.toHaveBeenCalled()
  })
  it('does not mark a pending refund as delivered or submit it again', async () => {
    const client = { refunds: { list: vi.fn(async () => ({ has_more: false, data: [{ id: 're_prior', status: 'pending', metadata: { domain_refund_key: 'domain-renewal-refund:purchase:period' } }] })), create: vi.fn() } }
    await expect(ensureDomainRefund(client, 'intent', 'domain-renewal-refund:purchase:period')).rejects.toThrow('not succeeded')
    expect(client.refunds.create).not.toHaveBeenCalled()
  })
  it('treats a refund with null or missing metadata as unrelated and never refunds again', async () => {
    for (const prior of [{ id: 'manual', status: 'succeeded', metadata: null }, { id: 'manual', status: 'succeeded' }]) {
      const client = { refunds: { list: vi.fn(async () => ({ has_more: false, data: [prior] })), create: vi.fn() } }
      await expect(ensureDomainRefund(client, 'intent', 'domain-renewal-refund:purchase:period')).rejects.toThrow('unrelated refund')
      expect(client.refunds.create).not.toHaveBeenCalled()
    }
  })
  it('writes a stable metadata key and refuses to report pending as refunded', async () => {
    const client = { refunds: { list: vi.fn(async () => ({ has_more: false, data: [] })), create: vi.fn(async () => ({ id: 'refund', status: 'pending', metadata: {} })) } }
    await expect(ensureDomainRefund(client, 'intent', 'domain-renewal-refund:purchase:period')).rejects.toThrow('not succeeded')
    expect(client.refunds.create).toHaveBeenCalledWith({ payment_intent: 'intent', metadata: { domain_refund_key: 'domain-renewal-refund:purchase:period', domain_purchase_id: 'purchase' } }, { idempotencyKey: 'domain-renewal-refund:purchase:period' })
  })
})


describe('known payment states survive for review', () => {
  it('keeps a requires-action intent and never submits a registrar renewal', async () => {
    const { row, stored, deps } = fixture()
    deps.charge = vi.fn(async () => ({ id: 'pi_requires_action', status: 'requires_action' }))
    expect(await reconcileDomainRow(row, deps)).toBe('attention')
    expect(stored.renewal_intent_id).toBe('pi_requires_action')
    expect(deps.renew).not.toHaveBeenCalled()
  })
  it('keeps the Stripe error payment intent when a confirmation throws', async () => {
    const { row, stored, deps } = fixture()
    deps.charge = vi.fn(async () => { throw { payment_intent: { id: 'pi_failed' } } })
    expect(await reconcileDomainRow(row, deps)).toBe('attention')
    expect(stored.renewal_intent_id).toBe('pi_failed')
    expect(deps.renew).not.toHaveBeenCalled()
  })
  it('a purchase status changed since selection cannot claim a new charge', async () => {
    const { row, stored, deps } = fixture(); stored.status = 'refunded'
    expect(await reconcileDomainRow(row, deps)).toBe('pending')
    expect(deps.charge).not.toHaveBeenCalled()
  })
})


it('does not charge or renew again when provider auto-renew already extended expiration', async () => {
  const { row, deps } = fixture()
  deps.expiration = vi.fn(async () => ({ ok: true as const, data: { expiresAt: Date.parse('2027-11-01T00:00:00Z') } }))
  expect(await reconcileDomainRow(row, deps)).toBe('attention')
  expect(deps.charge).not.toHaveBeenCalled()
  expect(deps.renew).not.toHaveBeenCalled()
})
