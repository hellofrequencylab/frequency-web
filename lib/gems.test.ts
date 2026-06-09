import { describe, it, expect } from 'vitest'
import { getGemTier, GEM_TIER_THRESHOLDS } from './gems'

describe('GEM_TIER_THRESHOLDS', () => {
  it('has 5 tiers in ascending minimum order', () => {
    expect(GEM_TIER_THRESHOLDS).toHaveLength(5)
    for (let i = 1; i < GEM_TIER_THRESHOLDS.length; i++) {
      expect(GEM_TIER_THRESHOLDS[i].min).toBeGreaterThan(GEM_TIER_THRESHOLDS[i - 1].min)
    }
  })

  it('first tier starts at 0 (New)', () => {
    expect(GEM_TIER_THRESHOLDS[0]).toMatchObject({ min: 0, label: 'New' })
  })

  it('last tier is Legend at 10 000', () => {
    const last = GEM_TIER_THRESHOLDS[GEM_TIER_THRESHOLDS.length - 1]
    expect(last).toMatchObject({ min: 10000, label: 'Legend' })
  })

  it('each tier has a label and a color class', () => {
    for (const tier of GEM_TIER_THRESHOLDS) {
      expect(typeof tier.label).toBe('string')
      expect(tier.label.length).toBeGreaterThan(0)
      expect(typeof tier.color).toBe('string')
      expect(tier.color.length).toBeGreaterThan(0)
    }
  })
})

describe('getGemTier', () => {
  it('returns New for 0 gems', () => {
    expect(getGemTier(0)).toMatchObject({ label: 'New' })
  })

  it('returns New for negative gems (defensive)', () => {
    expect(getGemTier(-1)).toMatchObject({ label: 'New' })
  })

  it('returns Active at exactly 100', () => {
    expect(getGemTier(100)).toMatchObject({ label: 'Active' })
  })

  it('stays New at 99 (one below Active threshold)', () => {
    expect(getGemTier(99)).toMatchObject({ label: 'New' })
  })

  it('returns Regular at exactly 500', () => {
    expect(getGemTier(500)).toMatchObject({ label: 'Regular' })
  })

  it('stays Active at 499', () => {
    expect(getGemTier(499)).toMatchObject({ label: 'Active' })
  })

  it('returns Veteran at exactly 2000', () => {
    expect(getGemTier(2000)).toMatchObject({ label: 'Veteran' })
  })

  it('stays Regular at 1999', () => {
    expect(getGemTier(1999)).toMatchObject({ label: 'Regular' })
  })

  it('returns Legend at exactly 10 000', () => {
    expect(getGemTier(10000)).toMatchObject({ label: 'Legend' })
  })

  it('returns Legend above 10 000', () => {
    expect(getGemTier(999999)).toMatchObject({ label: 'Legend' })
  })

  it('returned tier has all three fields', () => {
    const tier = getGemTier(500)
    expect(tier).toHaveProperty('min')
    expect(tier).toHaveProperty('label')
    expect(tier).toHaveProperty('color')
  })
})
