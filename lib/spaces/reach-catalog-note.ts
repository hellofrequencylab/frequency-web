// Reach catalog note — LIVE-440. QR codes are a meter (3 free, unlimited on
// Business). The Reach freeNote reads this seam, never the retired plan
// label (LIVE-228) and never the leftover "500 on Business" rung.

import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/meter-limits'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

/** The lever on the Reach catalog card. Numbers come from `space_qr`. */
export function reachCatalogNote(): string {
  const limits = PLACEHOLDER_METER_LIMITS.space_qr
  const free = typeof limits?.free === 'number' ? limits.free : 3
  const paid = limits?.business
  const freeWord = free === 1 ? 'code' : 'codes'
  const paidLine =
    typeof paid === 'number'
      ? `${paid} on ${SPACE_PLAN_LABEL.business}`
      : `unlimited on ${SPACE_PLAN_LABEL.business}`
  return `${free} ${freeWord} free, then ${paidLine}`
}
