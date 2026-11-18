import { describe, expect, it } from 'vitest'
import { dripScanPage } from './drip-sends'

describe('dripScanPage (JRN-011)', () => {
  it('reads the only page when everything fits', () => {
    expect(dripScanPage(150, 200, new Date())).toBe(0)
  })
  it('rotates through every page hour by hour, so no enrolment is starved', () => {
    const seen = new Set<number>()
    for (let h = 0; h < 3; h++) seen.add(dripScanPage(450, 200, new Date(Date.UTC(2026, 10, 17, h))))
    expect([...seen].sort()).toEqual([0, 1, 2])
  })
})
