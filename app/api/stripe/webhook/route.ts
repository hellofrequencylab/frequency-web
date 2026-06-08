import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, STRIPE_WEBHOOK_SECRET, tierForPrice } from '@/lib/billing/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Stripe membership webhook (P2.2). Verifies the signature, then reconciles the
// member's entitlement: a completed checkout / active subscription sets membership_tier
// (crew/supporter); cancellation sets it back to free. Identity rides on
// metadata.profile_id (set at checkout). Dormant until billing is configured.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'billing not configured' }, { status: 503 })
  }
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 })

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  const admin = createAdminClient()
  const setTier = async (profileId: string, tier: string, customerId?: string | null) => {
    const patch: { membership_tier: string; stripe_customer_id?: string } = { membership_tier: tier }
    if (customerId) patch.stripe_customer_id = customerId
    await admin.from('profiles').update(patch).eq('id', profileId)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session
      const profileId = s.metadata?.profile_id ?? s.client_reference_id ?? null
      const tier = s.metadata?.tier === 'supporter' ? 'supporter' : 'crew'
      const customerId = typeof s.customer === 'string' ? s.customer : s.customer?.id
      if (profileId) await setTier(profileId, tier, customerId)
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const profileId = sub.metadata?.profile_id
      if (profileId) {
        const active = sub.status === 'active' || sub.status === 'trialing'
        const tier = active ? tierForPrice(sub.items.data[0]?.price?.id) : 'free'
        await setTier(profileId, tier)
      }
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const profileId = sub.metadata?.profile_id
      if (profileId) await setTier(profileId, 'free')
      break
    }
  }

  return NextResponse.json({ received: true })
}
