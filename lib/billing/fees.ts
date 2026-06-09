// Platform fee math — shared across every Connect payout channel (tips, events,
// store, memberships). The platform takes a percentage application fee on each
// destination charge; the rest transfers to the recipient's connected account.
// Server-only config, but pure functions (no I/O) so they're trivially testable.

/** The platform fee percentage (0–100), from env, defaulting to 10%. A blank/unset
 *  env is "not configured" → 10 (note `Number('')` is 0, so guard it explicitly);
 *  an explicit '0' is a deliberate 0% fee. */
export function platformFeePct(): number {
  const env = process.env.STRIPE_PLATFORM_FEE_PCT
  if (!env || !env.trim()) return 10
  const raw = Number(env)
  if (Number.isFinite(raw) && raw >= 0 && raw <= 100) return raw
  return 10
}

/** The application fee (in cents) the platform keeps on a gross charge.
 *  Floors fractional cents so the recipient is never short-changed by rounding. */
export function platformFeeCents(grossCents: number): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0
  return Math.floor(grossCents * (platformFeePct() / 100))
}
