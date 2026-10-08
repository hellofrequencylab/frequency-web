// Server-only domain renewal and async registration reconciliation (LIVE-786).
// A provider submission with no recorded order is ambiguous: surface it, NEVER buy/renew again.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/billing/stripe'
import { domainPurchaseOpen, renewalDate } from './domain-purchase'
import { getDomainExpiration, getDomainOrder, getDomainPrice, renewDomain, setDomainAutoRenew } from './registrar'

const TABLE = 'space_domain_purchases'
const DAY = 86_400_000
export interface DomainRenewalRow {
  id: string; space_id: string; domain: string; status: string; updated_at: string
  renews_at: string | null; renewal_price_cents: number | null; markup_cents: number
  stripe_customer_id: string | null; stripe_payment_intent_id: string | null; vercel_order_id: string | null
  renewal_state: string | null; renewal_due_at: string | null; renewal_intent_id: string | null
  renewal_order_id: string | null; renewal_vercel_cents: number | null
}
export interface RenewalDeps {
  client: SupabaseClient
  open(): Promise<boolean>
  order: typeof getDomainOrder
  expiration: typeof getDomainExpiration
  price: typeof getDomainPrice
  renew: typeof renewDomain
  autoRenew: typeof setDomainAutoRenew
  charge(row: DomainRenewalRow): Promise<{ id: string; status: string } | null>
  refund(intent: string, key: string): Promise<void>
  now(): Date
}
function defaults(): RenewalDeps {
  let client: SupabaseClient | undefined
  return {
    get client() { return client ??= createAdminClient() }, open: domainPurchaseOpen, order: getDomainOrder,
    expiration: getDomainExpiration, price: getDomainPrice, renew: renewDomain, autoRenew: setDomainAutoRenew, now: () => new Date(),
    async charge(row) {
      if (!stripe || !row.stripe_customer_id) return null
      const amount = row.renewal_price_cents
      if (amount === null || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid renewal amount')
      const methods = await stripe.paymentMethods.list({ customer: row.stripe_customer_id, type: 'card', limit: 1 })
      const method = methods.data?.[0]?.id
      if (!method) return null
      const intent = await stripe.paymentIntents.create({
        amount, currency: 'usd', customer: row.stripe_customer_id,
        payment_method: method, off_session: true, confirm: true,
        metadata: { kind: 'domain_renewal', space_id: row.space_id, domain_purchase_id: row.id },
      }, { idempotencyKey: `domain-renewal:${row.id}:${row.renewal_due_at}` })
      return { id: intent.id, status: intent.status }
    },
    async refund(intent, key) {
      if (!stripe) throw new Error('Stripe unavailable')
      await ensureDomainRefund(stripe, intent, key)
    },
  }
}
async function write(deps: RenewalDeps, row: DomainRenewalRow, patch: Record<string, unknown>) {
  const { error } = await deps.client.from(TABLE).update({ ...patch, updated_at: deps.now().toISOString() }).eq('id', row.id)
  if (error) throw new Error(`domain write failed: ${row.id}: ${error.message}`)
  Object.assign(row, patch)
}
async function claim(deps: RenewalDeps, row: DomainRenewalRow, from: string | null, to: string, patch: Record<string, unknown> = {}) {
  let query = deps.client.from(TABLE).update({ ...patch, renewal_state: to, updated_at: deps.now().toISOString() }).eq('id', row.id).eq('status', 'registered').eq('renews_at', row.renews_at)
  query = from === null ? query.is('renewal_state', null) : query.eq('renewal_state', from)
  const { data, error } = await query.select('id')
  if (error) throw new Error(`domain claim failed: ${row.id}: ${error.message}`)
  if (!data?.length) return false
  Object.assign(row, patch, { renewal_state: to })
  return true
}
async function attention(deps: RenewalDeps, row: DomainRenewalRow, reason: string) {
  await write(deps, row, {})
  console.error('[domain-renewals] operator attention', { purchaseId: row.id, domain: row.domain, reason })
  const { data, error } = await deps.client.from('spaces').select('owner_profile_id').eq('id', row.space_id).maybeSingle()
  if (error) throw new Error('Could not read domain owner')
  if (data?.owner_profile_id) {
    const { error: noticeError } = await deps.client.from('notifications').insert({
      recipient_id: data.owner_profile_id, type: 'domain_renewal', reference_type: 'space', reference_id: row.space_id,
      body: `Your domain ${row.domain} needs attention before it can renew. Contact Frequency for help.`,
      dedupe_key: `domain-attention:${row.id}:${row.renews_at}:${reason}`,
    })
    if (noticeError && noticeError.code !== '23505') throw new Error('Could not notify domain owner')
  }
}

/** The one-row state machine. Exported to exercise real transitions without calling money providers. */
export async function reconcileDomainRow(row: DomainRenewalRow, deps: RenewalDeps): Promise<'done' | 'pending' | 'attention'> {
  if (row.status === 'purchasing') {
    await attention(deps, row, 'registration-submission-unknown')
    return 'attention'
  }
  if (row.status === 'ordered' || row.status === 'failed') {
    if (row.status === 'ordered') {
      if (!row.vercel_order_id) { await attention(deps, row, 'missing-registration-order'); return 'attention' }
      const order = await deps.order(row.vercel_order_id, undefined, row.domain)
      if (!order.ok) throw new Error('Registration order unavailable')
      if (order.data.status === 'completed') { await write(deps, row, { status: 'registered' }); return 'done' }
      if (order.data.status !== 'failed') return 'pending'
      await write(deps, row, { status: 'failed', failure_reason: 'registration-order-failed' })
    }
    if (!row.stripe_payment_intent_id) { await attention(deps, row, 'missing-registration-payment'); return 'attention' }
    await deps.refund(row.stripe_payment_intent_id, `domain-purchase-refund:${row.id}`)
    await write(deps, row, { status: 'refunded', refunded_at: deps.now().toISOString(), registrant: null })
    return 'done'
  }
  if (row.renewal_state === 'renewing' || row.renewal_state === 'charging' || row.renewal_state === 'attention') {
    await attention(deps, row, 'renewal-submission-unknown')
    return 'attention'
  }
  if (row.renewal_state === 'ordered') {
    if (!row.renewal_order_id || !row.renewal_due_at) { await attention(deps, row, 'missing-renewal-order'); return 'attention' }
    const order = await deps.order(row.renewal_order_id, undefined, row.domain)
    if (!order.ok) throw new Error('Renewal order unavailable')
    if (order.data.status === 'completed') {
      await write(deps, row, { renews_at: renewalDate(new Date(row.renewal_due_at)), renewal_state: null,
        renewal_order_id: null, renewal_intent_id: null, renewal_due_at: null, renewal_vercel_cents: null })
      return 'done'
    }
    if (order.data.status !== 'failed') return 'pending'
    if (!row.renewal_intent_id) throw new Error('Missing charged renewal intent')
    await deps.refund(row.renewal_intent_id, `domain-renewal-refund:${row.id}:${row.renewal_due_at}`)
    await write(deps, row, { renewal_state: 'attention', failure_reason: 'renewal-order-failed' })
    await attention(deps, row, 'renewal-order-failed')
    return 'attention'
  }
  if (row.renewal_state === null) {
    const due = Date.parse(row.renews_at ?? '')
    if (!Number.isFinite(due) || due > deps.now().getTime() + 30 * DAY) return 'pending'
    // Explicit renewal is the only spending path. Turn off registrar auto-renew BEFORE charging.
    const disabled = await deps.autoRenew(row.domain, false)
    if (!disabled.ok) throw new Error('Could not disable domain auto-renew')
    const expiration = await deps.expiration(row.domain)
    if (!expiration.ok) throw new Error('Could not read registry expiration')
    // Registration timestamps may differ by a registry day, but an extra year is
    // evidence auto-renew already happened. Never charge and buy another year blindly.
    if (Math.abs(expiration.data.expiresAt - due) > DAY) {
      if (await claim(deps, row, null, 'attention', { auto_renew: false })) await attention(deps, row, 'registry-expiration-needs-review')
      return 'attention'
    }
    const quote = await deps.price(row.domain)
    if (!quote.ok) throw new Error('Could not quote renewal')
    const cents = quote.data.renewalCents
    if (cents === null || !Number.isSafeInteger(row.renewal_price_cents) || row.renewal_price_cents! <= 0 || cents + row.markup_cents !== row.renewal_price_cents || due <= deps.now().getTime()) {
      if (await claim(deps, row, null, 'attention', { auto_renew: false })) await attention(deps, row, 'renewal-price-or-date-needs-review')
      return 'attention'
    }
    if (!await claim(deps, row, null, 'charging', { auto_renew: false, renewal_due_at: row.renews_at, renewal_vercel_cents: cents })) return 'pending'
    let intent: { id: string; status: string } | null
    try { intent = await deps.charge(row) } catch (error) {
      const payment = error && typeof error === 'object' && 'payment_intent' in error
        ? (error as { payment_intent?: { id?: unknown } }).payment_intent : null
      if (typeof payment?.id === 'string') await write(deps, row, { renewal_intent_id: payment.id })
      // Timeout and declined/authentication-required payments are not proof no charge happened.
      await attention(deps, row, 'renewal-payment-needs-review')
      return 'attention'
    }
    if (!intent) {
      await write(deps, row, { renewal_state: 'attention', failure_reason: 'renewal-card-unavailable' })
      await attention(deps, row, 'renewal-card-unavailable'); return 'attention'
    }
    if (intent.status !== 'succeeded') {
      await write(deps, row, { renewal_state: 'attention', renewal_intent_id: intent.id, failure_reason: `renewal-payment-${intent.status}` })
      await attention(deps, row, 'renewal-payment-needs-review'); return 'attention'
    }
    await write(deps, row, { renewal_state: 'charged', renewal_intent_id: intent.id })
  }
  if (row.renewal_state === 'charged') {
    if (!row.renewal_intent_id || row.renewal_vercel_cents === null) throw new Error('Incomplete charged renewal')
    if (!await claim(deps, row, 'charged', 'renewing')) return 'pending'
    const renewed = await deps.renew(row.domain, row.renewal_vercel_cents)
    if (!renewed.ok) {
      // A timeout/5xx may have accepted an order. Do not refund or retry until an operator reconciles.
      await attention(deps, row, `renewal-provider-${renewed.error}`)
      return 'attention'
    }
    await write(deps, row, { renewal_state: 'ordered', renewal_order_id: renewed.data.orderId })
  }
  return 'pending'
}

/** Bounded daily sweep; oldest attempts first. Reconciliation intentionally reads the database
 * even when new sales are paused: existing paid orders still need delivery/refunds. A missing
 * migration is a surfaced failure, never an empty successful run. */
export async function chargeDomainRenewals(opts: { limit: number; exhausted(): boolean }, deps: RenewalDeps = defaults()) {
  const limit = Math.min(100, Math.max(1, opts.limit))
  const now = deps.now()
  const open = await deps.open()
  let renewals = deps.client.from(TABLE).select('*').eq('status', 'registered').lte('renews_at', new Date(now.getTime() + 30 * DAY).toISOString())
  if (!open) renewals = renewals.not('renewal_state', 'is', null)
  const reads = await Promise.all([
    deps.client.from(TABLE).select('*').in('status', ['ordered', 'failed']).order('updated_at').limit(limit),
    deps.client.from(TABLE).select('*').eq('status', 'purchasing').lt('updated_at', new Date(now.getTime() - 3_600_000).toISOString()).order('updated_at').limit(limit),
    renewals.order('updated_at').limit(limit),
  ])
  for (const read of reads) if (read.error) throw new Error(`Domain sweep read failed: ${read.error.message}`)
  const rows = reads.flatMap(read => (read.data ?? []) as DomainRenewalRow[]).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, limit)
  const result = { scanned: 0, failed: 0, attention: 0, remaining: rows.length }
  for (const row of rows) {
    if (opts.exhausted()) break
    // Sales switch prevents NEW charges. Already-paid attempts still deliver or reconcile;
    // order reads/refunds remain remediation even while new domain sales are paused.
    if (!open && row.status === 'registered' && row.renewal_state === null) continue
    result.scanned++; result.remaining--
    try { if (await reconcileDomainRow(row, deps) === 'attention') result.attention++ }
    catch (error) { result.failed++; console.error('[domain-renewals] row failed', { purchaseId: row.id, error: error instanceof Error ? error.message : '' }) }
  }
  return result
}


type RefundRecord = { id: string; status?: string | null; metadata: Record<string, string> }
interface RefundClient {
  refunds: {
    list(params: { payment_intent: string; limit: number }): Promise<{ data: RefundRecord[]; has_more: boolean }>
    create(params: { payment_intent: string; metadata: Record<string, string> }, opts: { idempotencyKey: string }): Promise<RefundRecord>
  }
}
/** Re-read provider refunds before retrying: Stripe's idempotency cache may have expired. */
export async function ensureDomainRefund(client: RefundClient, intent: string, key: string): Promise<void> {
  const refunds = await client.refunds.list({ payment_intent: intent, limit: 100 })
  if (refunds.has_more) throw new Error('Refund history needs operator review')
  const purchaseId = key.split(':')[1]
  const prior = refunds.data.find(refund => refund.metadata.domain_refund_key === key ||
    (key.startsWith('domain-purchase-refund:') && refund.metadata.domain_purchase_id === purchaseId))
  if (prior) {
    if (prior.status !== 'succeeded') throw new Error('Existing domain refund has not succeeded')
    return
  }
  // A partial/manual/pending refund is not authority to refund the remaining balance blindly.
  if (refunds.data.length) throw new Error('Existing unrelated refund needs operator review')
  const refund = await client.refunds.create({ payment_intent: intent,
    metadata: { domain_refund_key: key, domain_purchase_id: purchaseId } }, { idempotencyKey: key })
  if (refund.status !== 'succeeded') throw new Error('Domain refund has not succeeded')
}
