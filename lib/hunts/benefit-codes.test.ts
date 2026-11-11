import { describe, expect, it } from 'vitest'
import { versionBenefits } from './benefit-codes'

describe('versionBenefits', () => {
  it('reads published benefits', () => {
    expect(versionBenefits({ benefits: [{ code: 'entry', label: 'Free entry' }] })).toEqual([{ code: 'entry', label: 'Free entry' }])
  })
  it('offers nothing when the version publishes none', () => {
    expect(versionBenefits({})).toEqual([])
    expect(versionBenefits(null)).toEqual([])
    expect(versionBenefits({ benefits: 'entry' })).toEqual([])
  })
  it('drops a bad code, a repeat and anything past ten, and falls back to the code for a label', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ code: `perk-${i}` }))
    expect(versionBenefits({ benefits: [{ code: 'Bad Code' }, { code: 'ok' }, { code: 'ok' }, 5, null] })).toEqual([{ code: 'ok', label: 'ok' }])
    expect(versionBenefits({ benefits: many })).toHaveLength(10)
  })
})
