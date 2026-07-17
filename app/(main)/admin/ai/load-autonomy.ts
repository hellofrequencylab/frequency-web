import {
  AUTONOMY_CATEGORIES,
  AUTONOMY_CATEGORY_LABEL,
  type AutonomyCategory,
  getAutonomyTuning,
  isAutonomyEnabled,
  isBreakerArmed,
  listAutonomyDecisions,
  type AutonomyDecisionRow,
} from '@/lib/ai/vera/autonomy-config'
import { countAutonomousSends, measureBounceComplaintRate } from '@/lib/ai/vera/circuit-breaker'

export interface AutonomyControlsData {
  /** Master autonomy switch (default OFF). */
  enabled: boolean
  /** Circuit-breaker armed latch (default TRUE = armed). false = tripped, needs re-arm. */
  breakerArmed: boolean
  categories: { key: AutonomyCategory; label: string; enabled: boolean }[]
  caps: Awaited<ReturnType<typeof getAutonomyTuning>>['caps']
  anomaly: Awaited<ReturnType<typeof getAutonomyTuning>>['anomaly']
  /** Live status (fail-safe to null if a read blips): recent autonomous send volume + bounce rate. */
  live: { sentLastHour: number; sentLastDay: number; bounceRate: number; sample: number } | null
  decisions: AutonomyDecisionRow[]
}

/** All the state the owner-control surface needs. Fail-safe: the live counts are best-effort (null on
 *  error) so the panel always renders; the switches/tuning use their own fail-safe readers. */
export async function getAutonomyControlsData(): Promise<AutonomyControlsData> {
  const [enabled, breakerArmed, tuning, decisions] = await Promise.all([
    isAutonomyEnabled(),
    isBreakerArmed(),
    getAutonomyTuning(),
    listAutonomyDecisions(25),
  ])

  let live: AutonomyControlsData['live'] = null
  try {
    const now = new Date()
    const [sentLastHour, sentLastDay, anomaly] = await Promise.all([
      countAutonomousSends({ email: null, sinceMs: 60 * 60 * 1000, now }),
      countAutonomousSends({ email: null, sinceMs: 24 * 60 * 60 * 1000, now }),
      measureBounceComplaintRate(now),
    ])
    live = { sentLastHour, sentLastDay, bounceRate: anomaly.rate, sample: anomaly.sample }
  } catch {
    live = null
  }

  return {
    enabled,
    breakerArmed,
    categories: AUTONOMY_CATEGORIES.map((key) => ({
      key,
      label: AUTONOMY_CATEGORY_LABEL[key],
      enabled: tuning.categories[key] === true,
    })),
    caps: tuning.caps,
    anomaly: tuning.anomaly,
    live,
    decisions,
  }
}
