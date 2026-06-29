// Time-vs-points rule for practice payout tiers (ADR-442, evolving ADR-438).
//
// A practice's Zap value must be EARNED by its required minutes, so a 2-minute practice can
// never bank the Heavy payout. The creator PICKS a tier, but the picker only offers tiers the
// duration earns (lower tiers stay open — under-claiming is fine), and `setPractice` clamps
// server-side so a bad client can't bypass it. At log time the timer-completion proof
// (ADR-345/438) enforces the time is actually spent.
//
// Pure + tested. The tier ZAP AMOUNTS stay tunable in zap_config (these are the canon
// defaults); the DURATION FLOORS are the structural anti-farm gate and live here.

export type PracticeTier = 'light' | 'standard' | 'heavy'

/** Ascending by value/effort. Index doubles as the rank. */
export const TIER_ORDER: readonly PracticeTier[] = ['light', 'standard', 'heavy']

/** Minimum required session length (minutes) to be ALLOWED a tier. Mirrors the ADR-438
 *  intensity buckets: Light any · Standard 5-14 · Heavy 15+. */
export const TIER_FLOOR_MIN: Record<PracticeTier, number> = { light: 0, standard: 5, heavy: 15 }

/** Default per-log Zap value per tier (canon default; the live value is tunable in zap_config). */
export const TIER_ZAPS: Record<PracticeTier, number> = { light: 8, standard: 12, heavy: 15 }

export function tierRank(t: PracticeTier): number {
  const i = TIER_ORDER.indexOf(t)
  return i === -1 ? 0 : i
}

/** The highest tier a given session length may claim. null / short → light. */
export function maxTierForDuration(durationMin: number | null | undefined): PracticeTier {
  const d = typeof durationMin === 'number' && Number.isFinite(durationMin) ? durationMin : 0
  if (d >= TIER_FLOOR_MIN.heavy) return 'heavy'
  if (d >= TIER_FLOOR_MIN.standard) return 'standard'
  return 'light'
}

/** Is this tier earnable at this length? Lower tiers are always allowed (under-claim). */
export function isTierAllowed(tier: PracticeTier, durationMin: number | null | undefined): boolean {
  return tierRank(tier) <= tierRank(maxTierForDuration(durationMin))
}

/** Clamp a requested tier DOWN to what the duration earns; never upgrades. */
export function clampTierToDuration(tier: PracticeTier, durationMin: number | null | undefined): PracticeTier {
  const max = maxTierForDuration(durationMin)
  return tierRank(tier) <= tierRank(max) ? tier : max
}
