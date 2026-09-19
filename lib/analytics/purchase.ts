// Pure: turn a paid Checkout Session into the commerce.purchase conversion LIVE-348 registers.
// The webhook is the only writer — checkout happens on Stripe's domain (or an Elements form
// whose success never navigates), so a client-side purchase event cannot fire.

export type PurchaseConversion = {
  event: 'commerce.purchase'
  shopEvent: 'shop.order_completed' | null
  props: Record<string, unknown>
  actorProfileId: string | null
  idempotencyKey: string
}

type SessionLike = {
  id?: string | null
  payment_status?: string | null
  amount_total?: number | null
  currency?: string | null
  mode?: string | null
  client_reference_id?: string | null
  metadata?: Record<string, string> | null
}

const ACTOR_KEYS = [
  'buyer_profile_id',
  'profile_id',
  'member_id',
  'from_profile_id',
  'donor_profile_id',
  'owner_id',
] as const

/** A space_plan session's client_reference_id is the Space, not a person. */
function actorFromSession(s: SessionLike, kind: string): string | null {
  const meta = s.metadata ?? {}
  for (const key of ACTOR_KEYS) {
    const value = meta[key]
    if (value) return value
  }
  if (kind === 'space_plan') return null
  return s.client_reference_id ?? null
}

/**
 * Null unless the session is paid and has an id. Unpaid `checkout.session.completed`
 * (ACH / bank redirect) waits for `async_payment_succeeded`, the same rule the recorders use.
 */
export function purchaseConversionFromSession(s: SessionLike): PurchaseConversion | null {
  if (s.payment_status !== 'paid') return null
  if (!s.id) return null
  const meta = s.metadata ?? {}
  const kind = meta.kind || (s.mode === 'subscription' ? 'member_subscription' : 'checkout')
  const amountTotal = typeof s.amount_total === 'number' ? s.amount_total : 0
  const currency = (s.currency || 'usd').toLowerCase()
  const props: Record<string, unknown> = {
    kind,
    value: amountTotal / 100,
    currency,
    transaction_id: s.id,
  }
  if (meta.ga_client_id) props.ga_client_id = meta.ga_client_id
  return {
    event: 'commerce.purchase',
    shopEvent: kind === 'commerce_order' ? 'shop.order_completed' : null,
    props,
    actorProfileId: actorFromSession(s, kind),
    idempotencyKey: `commerce.purchase:${s.id}`,
  }
}
