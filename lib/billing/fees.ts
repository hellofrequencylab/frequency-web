// Platform fee math — shared across every Connect payout channel (tips, events,
// store, memberships). The platform takes a percentage application fee on each
// destination charge; the rest transfers to the recipient's connected account.
// Server-only config, but pure functions (no I/O) so they're trivially testable.

/** The platform fee percentage (0–100), from env, defaulting to 3% (ADR-590). This FLAT rate is the floor
 *  for channels with NO space seller: tips (profile → profile gratuities) and personal-event tickets. The
 *  SPACE-seller channels — space memberships, the storefront (ADR-596), and space-hosted event tickets
 *  (ADR-785) — instead use the paying-state take-rate LADDER (5% free → 3% paid) via `spaceTakeRateCents`.
 *  A blank/unset env is "not configured" → 3 (note `Number('')` is 0, so guard it explicitly); an explicit
 *  '0' is a deliberate 0% fee; the env var can still override for a promo. */
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
  source: import('./pricing-keys').OrderSource = 'self',
): Promise<number> {
  // A member's OWN booking is always 0% (the hard promise, ADR-811). Short-circuit before any IO.
  if (source === 'self') return 0
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  try {
    const [{ getPricingValues }, { sourceAwareTakeRateCents, NETWORK_TAKE_RATE_DEFAULT }] = await Promise.all([
      import('@/lib/pricing/settings'),
      import('./pricing-keys'),
    ])
    const t = (await getPricingValues()).take_rate
    // Build a complete NetworkTakeRate: per-field fallback to the code default so a partial operator
    // override can never leave a tier undefined (→ NaN fee).
    const rate = { ...NETWORK_TAKE_RATE_DEFAULT, ...t.network_bps, member: t.member_bps ?? NETWORK_TAKE_RATE_DEFAULT.member }
    return sourceAwareTakeRateCents(grossCents, plan, source, rate)
  } catch {
    // Fail-safe to the platform default fee rather than 0 (never under-collect on a network sale error).
    return platformFeeCents(grossCents)
  }
}

/** The application fee (cents) on a charge from an individual (profile) seller (owner_kind='profile'):
 *  the personal seller ladder — free Member 10%, paid Crew 8% (COMMUNITY-COLLECTIVE-STRATEGY §4);
 *  upgrading to a Business Space buys it down further to the space rate (ADR-596). Reads the operator
 *  pricing_settings (fail-safe to the seeded defaults, then to the platform default fee — never 0).
 *
 *  `sellerTier` is the seller's resolved personal entitlement tier (lib/core/entitlement deriveTier).
 *  It DEFAULTS to 'crew' (the lower, paid rate), so an un-threaded caller can only ever under-charge a
 *  free seller, never over-charge a paying one. */
export async function memberTakeRateCents(
  grossCents: number,
  source: import('./pricing-keys').OrderSource = 'self',
  sellerTier: 'free' | 'crew' | string | null | undefined = 'crew',
): Promise<number> {
  // A member's OWN sale is always 0% (the hard promise, ADR-811).
  if (source === 'self') return 0
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  try {
    const [{ getPricingValues }, { sourceAwareMemberTakeRateCents, NETWORK_TAKE_RATE_DEFAULT }] = await Promise.all([
      import('@/lib/pricing/settings'),
      import('./pricing-keys'),
    ])
    const t = (await getPricingValues()).take_rate
    const rate = {
      ...NETWORK_TAKE_RATE_DEFAULT,
      ...t.network_bps,
      member: t.member_bps ?? NETWORK_TAKE_RATE_DEFAULT.member,
      // An operator row from before the personal split carries no member_free_bps: fall back to the
      // paid rate rather than the seeded 10%, so a stale row never silently raises anyone's fee.
      member_free: t.member_free_bps ?? t.member_bps ?? NETWORK_TAKE_RATE_DEFAULT.member_free,
    }
    return sourceAwareMemberTakeRateCents(grossCents, source, rate, sellerTier)
  } catch {
    return platformFeeCents(grossCents)
  }
}
