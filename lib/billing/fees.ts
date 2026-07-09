// Platform fee math — shared across every Connect payout channel (tips, events,
// store, memberships). The platform takes a percentage application fee on each
// destination charge; the rest transfers to the recipient's connected account.
// Server-only config, but pure functions (no I/O) so they're trivially testable.

/** The platform fee percentage (0–100), from env, defaulting to 3% (ADR-590: "our 3% plus card
 *  processing, no surprise fees ever" — the flat 3% applies to every Connect channel: tips, tickets,
 *  store). A blank/unset env is "not configured" → 3 (note `Number('')` is 0, so guard it explicitly);
 *  an explicit '0' is a deliberate 0% fee; the env var can still override for a promo. */
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

// ── Space-plan take-rate (Pricing P2, ADR-363) ────────────────────────────────────────────
// A paid SPACE membership is a Connect destination charge; the platform's application fee is the
// take-rate SET BY THE SPACE'S PAYING-STATE (5% free usage / 3% paying Business / 3% Non Profit,
// editable at /admin/pricing → pricing_settings.take_rate). Free-vs-paid is a usage state within
// Business (ADR-552), so the rate keys on `isPaying` (a live subscription item), not the plan label:
// the caller resolves it via lib/billing/space-subscription-items.ts spaceIsPaying(spaceId). The pure
// math lives in lib/billing/pricing-keys.ts (takeRateCents); this IO wrapper reads the operator
// take-rate and applies it. FAIL-SAFE: any error falls back to the seeded defaults via
// getPricingValues, never to a 0% fee that under-collects.

/** The application fee (cents) on a paid space charge, by the SPACE's take-rate for its paying-state.
 *  `isPaying` = the space has a LIVE paid subscription (resolve with spaceIsPaying); a free / not-paying
 *  space pays the higher free rate. Reads the operator pricing_settings (fail-safe to the seeded
 *  defaults). Server-only (dynamic imports keep the pure platformFee* helpers above client-safe). Floors
 *  fractional cents (recipient never short). */
export async function spaceTakeRateCents(
  grossCents: number,
  plan: string | null | undefined,
  isPaying = false,
): Promise<number> {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  try {
    const [{ getPricingValues }, { takeRateCents }] = await Promise.all([
      import('@/lib/pricing/settings'),
      import('./pricing-keys'),
    ])
    const values = await getPricingValues()
    return takeRateCents(grossCents, plan, values.take_rate, isPaying)
  } catch {
    // Fail-safe to the platform default fee rather than 0 (never under-collect on an error).
    return platformFeeCents(grossCents)
  }
}
