// Stripe webhook. Verifies the signature with the Stripe SDK, then routes events:
//  - account.updated (Phase 1) — mirror a connected host's capability flags onto
//    the owning profile as they progress through onboarding.
//  - checkout.session.completed (Phase 2) — a payout-channel charge succeeded;
//    record it (tips today; events/store/memberships add their handlers here).
//  - charge.refunded (Phase 3) — a ticket was refunded; flip the ticket to
//    `refunded` and free the tier's capacity (lib/billing/tickets.ts).
// Unhandled events are acked with 200 so Stripe stops retrying.
//
// Configure in the Stripe dashboard with this URL and set STRIPE_WEBHOOK_SECRET
// (the "whsec_…" signing secret). The route reads the RAW body (req.text()) because
// signature verification runs over the exact bytes Stripe signed.

import type Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/billing/stripe'
import { persistAccount } from '@/lib/billing/connect'
import { recordTipFromSession } from '@/lib/billing/tips'
import { recordTicketFromSession, recordTicketRefundFromCharge } from '@/lib/billing/tickets'
import { recordMembershipDuesFromInvoice } from '@/lib/billing/checkout'

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
      case 'checkout.session.completed': {
        // Route by the session's `kind` metadata; each recorder no-ops on a
        // session that isn't its kind (tip / ticket; more channels add handlers).
        const session = event.data.object as Stripe.Checkout.Session
        await recordTipFromSession(session)
        await recordTicketFromSession(session)
        break
      }
      case 'invoice.paid': {
        // A membership subscription invoice was paid (first payment or a renewal).
        // Record it as Foundation dues on the partitioned ledger (idempotent per invoice).
        await recordMembershipDuesFromInvoice(event.data.object as Stripe.Invoice)
        break
      }
      case 'charge.refunded': {
        // A ticket charge was refunded (host action). Flip the ticket to
        // `refunded` and decrement the tier's `sold`; no-ops if it isn't a
        // ticket charge or was already recorded (idempotent).
        await recordTicketRefundFromCharge(event.data.object as Stripe.Charge)
        break
      }
      default:
        // Other payout-channel events are added in later phases. Acknowledge
        // unknown events with 200 so Stripe stops retrying.
        break
    }
  } catch (err) {
    // A handler failure returns 503 so Stripe redelivers (our writes are idempotent).
    console.error(`[stripe-webhook] handler failed (type=${event.type}, id=${event.id}):`, err)
    return NextResponse.json({ ok: false, error: 'processing failed' }, { status: 503 })
  }

  return NextResponse.json({ ok: true })
}
