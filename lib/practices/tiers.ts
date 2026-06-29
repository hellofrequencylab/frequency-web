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

// --- Shared tier picker (ADR-442): the same Light/Standard/Heavy range that gates game value
//     setting everywhere (practices, crew tasks, …). Member-facing label is "Effort".

export const TIER_LABELS: Record<PracticeTier, string> = { light: 'Light', standard: 'Standard', heavy: 'Heavy' }

/** The allowed tier Zap amounts, ascending (8 / 12 / 15). */
export const TIER_ZAP_VALUES: readonly number[] = TIER_ORDER.map((t) => TIER_ZAPS[t])

/** Snap any number to the nearest allowed tier amount (8 / 12 / 15); non-finite → standard.
 *  The server uses this so a posted value can never be an arbitrary (or unlimited) number. */
export function coerceTierZaps(value: number): number {
  if (!Number.isFinite(value)) return TIER_ZAPS.standard
  let best = TIER_ZAP_VALUES[0]
  for (const v of TIER_ZAP_VALUES) if (Math.abs(v - value) < Math.abs(best - value)) best = v
  return best
}

/** The tier whose amount matches this value (snapping if needed), for preselecting a picker. */
export function tierForZaps(value: number): PracticeTier {
  const snapped = coerceTierZaps(value)
  return TIER_ORDER.find((t) => TIER_ZAPS[t] === snapped) ?? 'standard'
}

// --- Achieved tier (ADR-443): a TIMED practice earns the tier its real engaged time reaches,
//     not a tier the creator declared. Below the Light floor is a partial (1 Zap + streak).
//     Standard (5) / Heavy (15) floors come from TIER_FLOOR_MIN; the Light/partial floor is the
//     one new number here (tunable). Pure so it is unit-tested and reused by logPractice.

/** The minimum engaged minutes for a session to earn the Light tier; below this is a partial. */
export const LIGHT_FLOOR_MIN = 3

/** What a session earned: a real tier, or 'partial' (under the Light floor). */
export type AchievedOutcome = 'partial' | PracticeTier

/** Resolve the achieved outcome from engaged minutes. */
export function achievedTierFromMinutes(minutes: number): AchievedOutcome {
  const m = Number.isFinite(minutes) ? minutes : 0
  if (m < LIGHT_FLOOR_MIN) return 'partial'
  if (m >= TIER_FLOOR_MIN.heavy) return 'heavy'
  if (m >= TIER_FLOOR_MIN.standard) return 'standard'
  return 'light'
}

/** Resolve the achieved outcome from engaged seconds (the session length). */
export function achievedTier(engagedSeconds: number): AchievedOutcome {
  return achievedTierFromMinutes((Number.isFinite(engagedSeconds) ? engagedSeconds : 0) / 60)
}
