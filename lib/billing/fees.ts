// Platform fee math for the Connect payout channels (events, store, memberships). The platform takes an
// application fee on each destination charge; the rest transfers to the recipient's connected account.
// Server-only config, but pure functions (no I/O) so they're trivially testable.
//
// WHAT CHARGES WHAT (ADR-913):
//   * The TAKE-RATE (below) is the live model. It applies ONLY to NETWORK-sourced sales — a sale the
//     collective sourced (referral / discovery / marketplace). A sale to the seller's OWN audience is
//     0%, always, at every tier: the hard promise.
//   * TIPS CARRY NO FEE at all. They never reach this module (see lib/billing/tips.ts).
//   * The flat `platformFeePct` / `platformFeeCents` below survive for exactly ONE branch: a
//     ROOT / platform-HOSTED event, where Frequency itself is the seller (lib/billing/tickets.ts).
//     They also serve as the never-under-collect fallback when a take-rate read throws.

/** The platform fee percentage (0–100), from env, defaulting to 3%. This FLAT rate prices the ONE channel
 *  with no third-party seller: a root / platform-hosted event, where Frequency is the seller. It does NOT
 *  price tips (those are free, ADR-913) and it does not price any member or Space sale — those take the
 *  network take-rate below. A blank/unset env is "not configured" → 3 (note `Number('')` is 0, so guard it
 *  explicitly); an explicit '0' is a deliberate 0% fee; the env var can still override for a promo. */
export function platformFeePct(): number {
  const env = process.env.STRIPE_PLATFORM_FEE_PCT
  if (!env || !env.trim()) return 3
  const raw = Number(env)
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return raw
  return 3
}

/** The application fee (in cents) the platform keeps on a gross charge.
 *  Floors fractional cents so the recipient is never short-changed by rounding. */
export function platformFeeCents(grossCents: number): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  return Math.floor(grossCents * (platformFeePct() / 100))
}

// ── The NETWORK take-rate (ADR-811 §A, ruled ADR-913) ─────────────────────────────────────
// A Space sale on Connect carries an application fee ONLY when the NETWORK sourced it. The rungs the
// operator sets in pricing_settings.take_rate.network_bps (editable at /admin/pricing): Space free 10% →
// Business 5% → Collective 3% → Non Profit 0% → Independent 0% (off the network). An individual seller
// pays `member_free_bps` (10%) on the free Member tier or `member_bps` (8%) on Crew. And 0%, always,
// when the buyer is the seller's own audience — that short-circuits before any IO below.
//
// The pure math lives in lib/billing/pricing-keys.ts (sourceAwareTakeRateCents); this IO wrapper reads the
// operator rates and applies them. FAIL-SAFE in two layers: getPricingValues merges every field over the
// seeded code default (no partial row can leave a tier undefined → NaN), and a thrown read falls back to
// the flat platform fee — never to a 0% fee that under-collects.

/** The OPERATOR-RESOLVED network take-rate vector: the code defaults with the operator's
 *  pricing_settings merged over them, per field. The single place the live rate is assembled.
 *
 *  🔴 EXPORTED SO A RECEIPT CAN RECORD WHAT WAS ACTUALLY CHARGED. The fee paths resolve their rate
 *  here, from operator config, while the receipt used to recompute it from the CODE DEFAULT. The two
 *  agree today only because production has never had a `network_bps` row; the first time an operator
 *  saves a rate at /admin/pricing, a ticket would be charged the new rate and stamped with the old
 *  one. A receipt that disagrees with the charge is worse than no receipt, because it is evidence
 *  that reads as authoritative and is wrong. */
export async function resolvedNetworkRate(): Promise<import('./pricing-keys').NetworkTakeRate> {
  const [{ getPricingValues }, { NETWORK_TAKE_RATE_DEFAULT }] = await Promise.all([
    import('@/lib/pricing/settings'),
    import('./pricing-keys'),
  ])
  try {
    const t = (await getPricingValues()).take_rate
    // Per-field fallback so a partial operator override can never leave a rung undefined (→ NaN fee).
    return {
      ...NETWORK_TAKE_RATE_DEFAULT,
      ...t.network_bps,
      member: t.member_bps ?? NETWORK_TAKE_RATE_DEFAULT.member,
      memberFree: t.member_free_bps ?? NETWORK_TAKE_RATE_DEFAULT.memberFree,
    }
  } catch {
    return NETWORK_TAKE_RATE_DEFAULT
  }
}

/** The application fee (cents) on a Space charge: 0 for the Space's own audience, else the plan's
 *  network-sourced rate. Reads the operator pricing_settings (fail-safe to the seeded defaults, then to
 *  the flat platform fee — never 0). Server-only (dynamic imports keep the pure platformFee* helpers
 *  above client-safe). Floors fractional cents (recipient never short). */
export async function spaceTakeRateCents(
  grossCents: number,
  plan: string | null | undefined,
  source: import('./pricing-keys').OrderSource = 'self',
): Promise<number> {
  // A member's OWN booking is always 0% (the hard promise, ADR-811). Short-circuit before any IO.
  if (source === 'self') return 0
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  try {
    const { sourceAwareTakeRateCents } = await import('./pricing-keys')
    const rate = await resolvedNetworkRate()
    return sourceAwareTakeRateCents(grossCents, plan, source, rate)
  } catch {
    // Fail-safe to the platform default fee rather than 0 (never under-collect on a network sale error).
    return platformFeeCents(grossCents)
  }
}

/** The application fee (cents) on a charge from an individual (profile) seller (owner_kind='profile'):
 *  0% on a sale to their own audience, and their tier's rung on a sale the network sourced — free Member
 *  10% (`member_free_bps`), Crew 8% (`member_bps`). Moving the sale into a Business Space buys it down
 *  further, to the Space rate. Reads the operator pricing_settings (fail-safe to the seeded defaults,
 *  then to the flat platform fee — never 0).
 *
 *  `sellerTier` is the payee's REAL `profiles.membership_tier`, never the beta-granted one: BETA_OPEN_
 *  ACCESS reports 'crew' to make the beta feel open, and billing the Crew rate to someone who has not
 *  paid for Crew would be charging on a tier they do not hold. Omitting it prices at the free rung,
 *  which is the never-under-collect direction. */
export async function memberTakeRateCents(
  grossCents: number,
  source: import('./pricing-keys').OrderSource = 'self',
  sellerTier?: string | null,
): Promise<number> {
  // A member's OWN sale is always 0% (the hard promise, ADR-811).
  if (source === 'self') return 0
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  try {
    const { sourceAwareMemberTakeRateCents } = await import('./pricing-keys')
    const rate = await resolvedNetworkRate()
    return sourceAwareMemberTakeRateCents(grossCents, source, rate, sellerTier)
  } catch {
    return platformFeeCents(grossCents)
  }
}
