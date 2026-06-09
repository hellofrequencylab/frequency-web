// Stripe webhook (Phase 1: Connect account sync). Verifies the signature with the
// Stripe SDK, then routes events. Today it handles `account.updated` — the async
// signal that a connected host finished (or progressed) onboarding — by mirroring
// the Account's capability flags onto the owning profile. Subscription + payment
// events for the four payout channels land in the `default` arm and are acked now;
// later phases add their cases here.
//
// Configure in the Stripe dashboard with this URL and set STRIPE_WEBHOOK_SECRET
// (the "whsec_…" signing secret). The route reads the RAW body (req.text()) because
// signature verification runs over the exact bytes Stripe signed.

import type Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/billing/stripe'
import { persistAccount } from '@/lib/billing/connect'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Billing not configured (no key, or webhook secret missing): 503 so Stripe retries
  // once it's wired, rather than a silent success that drops the event.
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
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  try {
    switch (event.type) {
      case 'account.updated':
        await persistAccount(event.data.object as Stripe.Account)
        break
      default:
        // Subscription/payment events for the payout channels are added in later
        // phases. Acknowledge unknown events with 200 so Stripe stops retrying.
        break
    }
  } catch (err) {
    // A handler failure returns 503 so Stripe redelivers (our writes are idempotent).
    console.error(`[stripe-webhook] handler failed (type=${event.type}, id=${event.id}):`, err)
    return NextResponse.json({ ok: false, error: 'processing failed' }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
