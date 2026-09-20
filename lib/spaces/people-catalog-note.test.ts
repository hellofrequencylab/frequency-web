import { describe, it, expect } from 'vitest'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/feature-meters'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { peopleCatalogNote } from './people-catalog-note'

describe('peopleCatalogNote (LIVE-435)', () => {
  it('reads the space_team meter and names Business, never Collective', () => {
    const note = peopleCatalogNote()
    const free = PLACEHOLDER_METER_LIMITS.space_team!.free
    const paid = PLACEHOLDER_METER_LIMITS.space_team!.business
    expect(note).toBe(`${free} seat free, ${paid} included on ${SPACE_PLAN_LABEL.business}, more per seat`)
    expect(note).toContain(SPACE_PLAN_LABEL.business)
    expect(note).not.toMatch(/Collective/)
  })
})
