// Amplitude — the lifetime layer (Rewards Economy v2; supersedes the ADR-037
// lifetime-rank DISPLAY — the lifetime_rank column itself stays for the retro
// reward rules).
//
// Rule: amplitude = lifetime cumulative Zaps, with hosting-class actions counting
// 2×. Nothing else feeds it. Never decremented, never spent, never gates anything
// (cosmetic continuity aside). Accrual lives in the after_zap_transaction trigger
// (the single place totals move); this module owns the derived math + display.

/** cumulative(L) = COEFF * L * (L+1) — the total Amplitude needed to hold level L. */
export const AMPLITUDE_LEVEL_COEFF = 50

/** Milestone Awards are minted at these totals (permanent, in the Vault). Only the
 *  first two ship with S1 art (achievements amplitude-1k / amplitude-5k); the rest
 *  are seeded when their art lands. */
export const AMPLITUDE_MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000] as const

export const AMPLITUDE_MILESTONE_LABELS: Record<number, string> = {
  1_000: 'First Thousand',
  5_000: 'Five K',
  10_000: 'Ten K',
  25_000: 'Twenty-Five K',
  50_000: 'Fifty K',
  100_000: 'Hundred K',
}

/** Total Amplitude required to hold level `level`. */
export function cumulativeForLevel(level: number): number {
  const l = Math.max(0, Math.floor(level))
  return AMPLITUDE_LEVEL_COEFF * l * (l + 1)
}

/** Derived level: the largest L where 50 * L * (L+1) <= amplitude. Never stored. */
export function amplitudeLevel(amplitude: number): number {
  const a = Math.max(0, Math.floor(amplitude || 0))
  if (a < cumulativeForLevel(1)) return 0
  // Solve 50L² + 50L − a ≤ 0 → L = floor((−1 + √(1 + 4a/50)) / 2), then correct
  // for any float drift at the exact boundary.
  let l = Math.floor((-1 + Math.sqrt(1 + (4 * a) / AMPLITUDE_LEVEL_COEFF)) / 2)
  while (cumulativeForLevel(l + 1) <= a) l++
  while (l > 0 && cumulativeForLevel(l) > a) l--
  return l
}

export interface AmplitudeProgress {
  amplitude: number
  level: number
  /** Amplitude into the current level (toward the next). */
  intoLevel: number
  /** Amplitude needed to reach the next level. */
  toNext: number
  /** Fill of the current level segment, 0..100. */
  pct: number
  /** The next milestone Award total still ahead (null once all are minted). */
  nextMilestone: number | null
  /** Milestone totals already reached. */
  milestonesReached: number[]
}

/** Where an Amplitude total sits — level progress + milestone state. Pure. */
export function amplitudeProgress(amplitude: number): AmplitudeProgress {
  const a = Math.max(0, Math.floor(amplitude || 0))
  const level = amplitudeLevel(a)
  const floor = cumulativeForLevel(level)
  const ceil = cumulativeForLevel(level + 1)
  const intoLevel = a - floor
  const toNext = ceil - a
  const pct = Math.round((intoLevel / (ceil - floor)) * 100)
  const milestonesReached = AMPLITUDE_MILESTONES.filter((m) => a >= m)
  const nextMilestone = AMPLITUDE_MILESTONES.find((m) => a < m) ?? null
  return { amplitude: a, level, intoLevel, toNext, pct, nextMilestone, milestonesReached }
}

/** Display string beside the season rank, e.g. "Beacon · 14,200". */
export function formatAmplitude(amplitude: number): string {
  return Math.max(0, Math.floor(amplitude || 0)).toLocaleString('en-US')
}
