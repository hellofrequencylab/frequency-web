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
}): Promise<OrderSourceResult> {
  // A SELF-SCAN (the buyer IS the seller) is never network-sourced, even with an explicit network entry
  // point. Guard this FIRST so an operator buying their own listing off a marketplace/discovery surface
  // (or their own referral link) is never billed the network rate on their own booking (the hard promise).
  const selfScan = !!opts?.buyerProfileId && opts.buyerProfileId === opts?.sellerProfileId
  // An explicit discovery/marketplace/referral entry point from the calling surface is authoritative
  // (unless it is a self-scan).
  if (opts?.entryPoint && !selfScan) return { source: 'network', attributionRef: `ep:${opts.entryPoint}` }
  if (selfScan) return { source: 'self', attributionRef: null }
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
