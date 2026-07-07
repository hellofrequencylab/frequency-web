import { describe, it, expect } from 'vitest'
import { rankSeedImages, type SeedImagePlanItem } from './vision'

// rankSeedImages is the PURE designer core: given per-image tags, it picks the hero and orders the set
// best-first. The vision model call is untestable in CI; this locks the selection + ordering rules.

const item = (url: string, category: SeedImagePlanItem['category'], heroScore: number): SeedImagePlanItem => ({
  url,
  category,
  alt: '',
  heroScore,
})

describe('rankSeedImages picks the hero and orders best-first', () => {
  it('leads with the strongest non-logo image and never picks a logo as hero', () => {
    const plan = rankSeedImages([
      item('logo.png', 'logo', 0.9),
      item('exterior.jpg', 'exterior', 0.9),
      item('detail.jpg', 'detail', 0.5),
    ])
    expect(plan.heroUrl).toBe('exterior.jpg')
    expect(plan.order[0]).toBe('exterior.jpg')
    // The logo sinks to the end (hero weight 0).
    expect(plan.order[plan.order.length - 1]).toBe('logo.png')
  })

  it('prefers a hero-category image over a higher-scored interior', () => {
    const plan = rankSeedImages([
      item('interior.jpg', 'interior', 1),
      item('hero.jpg', 'hero', 0.7),
    ])
    expect(plan.heroUrl).toBe('hero.jpg')
    expect(plan.order[0]).toBe('hero.jpg')
  })

  it('is stable: equal value keeps original order', () => {
    const plan = rankSeedImages([
      item('a.jpg', 'product', 0.5),
      item('b.jpg', 'product', 0.5),
    ])
    expect(plan.order).toEqual(['a.jpg', 'b.jpg'])
  })

  it('returns no hero when every image is a logo', () => {
    const plan = rankSeedImages([item('l1.png', 'logo', 1), item('l2.png', 'logo', 1)])
    expect(plan.heroUrl).toBeNull()
    expect(plan.order).toHaveLength(2)
  })

  it('keeps every image in the output (nothing dropped)', () => {
    const urls = ['a', 'b', 'c', 'd']
    const plan = rankSeedImages(urls.map((u) => item(u, 'other', 0.3)))
    expect([...plan.order].sort()).toEqual([...urls].sort())
  })
})
