// Email catalog note — LIVE-437. Sends are a meter (300/mo free, 25,000/mo
// on Business). The Email freeNote reads this seam, never the retired plan
// label (LIVE-228) and never the leftover 5,000 Business rung.

import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/feature-meters'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'

function formatSends(n: number): string {
  return n.toLocaleString('en-US')
}

/** The lever on the Email catalog card. Numbers come from `space_email`. */
export function emailCatalogNote(): string {
  const limits = PLACEHOLDER_METER_LIMITS.space_email
  const free = typeof limits?.free === 'number' ? limits.free : 300
  const paid = limits?.business
  const paidLine =
    typeof paid === 'number'
      ? `${formatSends(paid)}/mo on ${SPACE_PLAN_LABEL.business}`
      : `unlimited on ${SPACE_PLAN_LABEL.business}`
  return `${formatSends(free)} sends/mo free, then ${paidLine}`
}
