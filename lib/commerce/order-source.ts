// Order-source classification for the differential take-rate (Phase 2, ADR-811 §A). Decides whether a
// commerce order is `self` (the operator's own booking / page — 0% platform fee, always) or `network`
// (the collective sourced the customer — referral / discovery / marketplace, so the tier network rate
// applies). Reads the live attribution signals dropped by the QR / referral / entry-point loop
// (lib/qr/referral.ts `fq_ref`, lib/attribution/first-touch.ts `fq_src`).
//
// SAFETY: default to `self` on ANY ambiguity or read failure — we never charge a fee we promised not to.
// Conservative on channels: a qr_scan or event_guest can be the operator's OWN flyer/page, so only a
// person-to-person referral or an explicit discovery/marketplace entry point counts as `network`.

import { cookies } from 'next/headers'
import { CHANNEL_COOKIE } from '@/lib/attribution/first-touch'
import type { OrderSource } from '@/lib/billing/pricing-keys'

const REF_COOKIE = 'fq_ref' // person-to-person referral (lib/qr/referral.ts)

/** Acquisition channels that UNAMBIGUOUSLY mean "the network sourced this customer". Kept deliberately
 *  small (default self): only a referral is a clear network-sourced signal from the channel cookie. */
const NETWORK_CHANNELS = new Set(['referral'])

export interface OrderSourceResult {
  source: OrderSource
  attributionRef: string | null
}

/**
 * Classify an order's commercial source from the live attribution signals. DEFAULT `self` on any
 * ambiguity or read failure. `entryPoint` is an EXPLICIT network signal a discovery / marketplace
 * surface passes (it always wins); `buyerProfileId` / `sellerProfileId` guard a self-scan (an operator
 * scanning their own referral code, or the buyer being the seller, is not network-sourced).
 */
export async function classifyOrderSource(opts?: {
  entryPoint?: 'discovery' | 'marketplace' | 'referral' | null
  buyerProfileId?: string | null
  sellerProfileId?: string | null
  /** The selling Space, when there is one. Enables the RELATIONSHIP check below (ADR-913). */
  sellerSpaceId?: string | null
}): Promise<OrderSourceResult> {
  // A SELF-SCAN (the buyer IS the seller) is never network-sourced, even with an explicit network entry
  // point. Guard this FIRST so an operator buying their own listing off a marketplace/discovery surface
  // (or their own referral link) is never billed the network rate on their own booking (the hard promise).
  const selfScan = !!opts?.buyerProfileId && opts.buyerProfileId === opts?.sellerProfileId
  if (selfScan) return { source: 'self', attributionRef: null }

  // ── THE RELATIONSHIP CHECK (ADR-913) — authoritative, above the entry point AND the cookies ──
  //
  // "Once you have your contact, Frequency doesn't take a cut." A buyer who already follows the
  // Space, is a member of it, sits in its CRM, is in the seller's own contact list, or has bought
  // before is ALWAYS `self` → 0%. Frequency charges only for the INTRODUCTION.
  //
  // Placed above the entryPoint and referral branches ON PURPOSE, and this is a real trade-off worth
  // naming: a third party who refers an existing follower gets no network credit. The alternative —
  // letting a referral override an existing relationship — would mean a host could be charged for
  // someone they already had, which is exactly the promise this model is built on. The owner's rule
  // is absolute ("any member associated with their space gets a ZERO take rate"), so the simpler,
  // more generous reading wins and the referral-credit case is knowingly given up.
  //
  // Fail-safe: buyerIsSellersAudience returns `isOwnAudience: true` on ANY read failure, so a database
  // hiccup under-collects rather than charging a fee we promised not to.
  if (opts?.buyerProfileId && (opts.sellerSpaceId || opts.sellerProfileId)) {
    const { buyerIsSellersAudience } = await import('@/lib/commerce/seller-audience')
    const verdict = await buyerIsSellersAudience({
      sellerSpaceId: opts.sellerSpaceId ?? null,
      sellerProfileId: opts.sellerProfileId ?? null,
      buyerProfileId: opts.buyerProfileId,
    })
    if (verdict.isOwnAudience) {
      return { source: 'self', attributionRef: verdict.signal ? `own:${verdict.signal}` : 'own:degraded' }
    }
  }

  // An explicit discovery/marketplace/referral entry point from the calling surface is authoritative
  // for a STRANGER. It sits below the relationship check on purpose: it used to run first, which meant
  // a shop sale reached through a discovery surface was billed the network rate even when the buyer
  // already followed the seller — the exact charge the promise forbids. Caught by
  // "an existing relationship beats an explicit discovery entry point" in order-source.test.ts.
  if (opts?.entryPoint) return { source: 'network', attributionRef: `ep:${opts.entryPoint}` }

  try {
    const jar = await cookies()
    const ref = jar.get(REF_COOKIE)?.value ?? null
    // A referral cookie means a real person sent them — unless it is the buyer's or seller's own id
    // (a self-scan), which is not network-sourced.
    if (ref && ref !== opts?.buyerProfileId && ref !== opts?.sellerProfileId) {
      return { source: 'network', attributionRef: `ref:${ref}` }
    }
    const channel = jar.get(CHANNEL_COOKIE)?.value ?? null
    if (channel && NETWORK_CHANNELS.has(channel)) {
      return { source: 'network', attributionRef: `src:${channel}` }
    }
  } catch {
    /* no request context / cookie read failure → self (default-safe) */
  }
  return { source: 'self', attributionRef: null }
}
