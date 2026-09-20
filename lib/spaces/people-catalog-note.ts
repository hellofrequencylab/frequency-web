// Team-seat catalog note — LIVE-435. Seats are a meter (1 free, 2 on Business)
// plus the per-seat add-on (ADR-799). The Your people freeNote reads this
// seam, never the retired plan label (LIVE-228).

import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

/** The lever on the Your people catalog card. Numbers come from `space_team`. */
export function peopleCatalogNote(): string {
  const limits = PLACEHOLDER_METER_LIMITS.space_team
  const free = typeof limits?.free === 'number' ? limits.free : 1
  const paid = typeof limits?.business === 'number' ? limits.business : 2
  const freeWord = free === 1 ? 'seat' : 'seats'
  return `${free} ${freeWord} free, ${paid} included on ${SPACE_PLAN_LABEL.business}, more per seat`
}
