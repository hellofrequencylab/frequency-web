import { describe, it, expect } from 'vitest'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/feature-meters'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { reachCatalogNote } from './reach-catalog-note'

describe('reachCatalogNote (LIVE-436)', () => {
  it('reads the space_qr meter and names Business, never Collective', () => {
    const note = reachCatalogNote()
    const free = PLACEHOLDER_METER_LIMITS.space_qr!.free
    const paid = PLACEHOLDER_METER_LIMITS.space_qr!.business
    const paidLine =
      typeof paid === 'number'
        ? `${paid} on ${SPACE_PLAN_LABEL.business}`
        : `unlimited on ${SPACE_PLAN_LABEL.business}`
    expect(note).toBe(`${free} codes free, then ${paidLine}`)
    expect(note).toContain(SPACE_PLAN_LABEL.business)
    expect(note).not.toMatch(/Collective/)
    expect(note).not.toMatch(/500/)
  })
})
