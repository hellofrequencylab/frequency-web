import { describe, expect, it } from 'vitest'
import { SPACE_PLANS } from '@/lib/pricing/plans'
import { TIER_MARKS, moduleTierRead } from '@/lib/pricing/tier-marks'

describe('tier marks', () => {
  it('has a mark for every Space plan', () => {
    for (const plan of SPACE_PLANS) expect(TIER_MARKS[plan].label.length).toBeGreaterThan(0)
  })

  it('keeps Founder and Founding Business on the same gold family, and never carries a price', () => {
    expect(TIER_MARKS.founder.rank).toBe(TIER_MARKS.founding_business.rank)
    for (const m of Object.values(TIER_MARKS)) expect(`${m.label} ${m.title ?? ''}`).not.toMatch(/\$\d/)
  })

  it('reads a module row as free, free with a cap, or its premium plan', () => {
    expect(moduleTierRead('space.people', 'included')).toEqual({ mark: 'free', capped: false })
    expect(moduleTierRead('space.crm', 'freemium')).toEqual({ mark: 'free', capped: true })
    expect(moduleTierRead('space.chapters', 'premium')).toEqual({ mark: 'network', capped: false })
    expect(moduleTierRead('space.unknown', 'premium').mark).toBe('business')
  })
})
