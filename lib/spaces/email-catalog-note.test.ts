import { describe, it, expect } from 'vitest'
import { PLACEHOLDER_METER_LIMITS } from '@/lib/pricing/feature-meters'
import { SPACE_PLAN_LABEL } from '@/lib/pricing/plans'
import { emailCatalogNote } from './email-catalog-note'

describe('emailCatalogNote (LIVE-437)', () => {
  it('reads the space_email meter and names Business, never Collective', () => {
    const note = emailCatalogNote()
    const free = PLACEHOLDER_METER_LIMITS.space_email!.free
    const paid = PLACEHOLDER_METER_LIMITS.space_email!.business
    const paidLine =
      typeof paid === 'number'
        ? `${paid.toLocaleString('en-US')}/mo on ${SPACE_PLAN_LABEL.business}`
        : `unlimited on ${SPACE_PLAN_LABEL.business}`
    expect(note).toBe(`${Number(free).toLocaleString('en-US')} sends/mo free, then ${paidLine}`)
    expect(note).toContain(SPACE_PLAN_LABEL.business)
    expect(note).not.toMatch(/Collective/)
    expect(note).not.toBe(
      '300 sends/mo free, then 5,000/mo on Business, 25,000/mo on Collective',
    )
  })
})
