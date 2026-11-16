import { describe, it, expect, vi } from 'vitest'

// No model is ever called: the one seam to the provider is mocked, and the reply tests below hand it the tool_use
// block a model would have returned.
const mocks = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/ai/complete', () => ({ completeRaw: mocks.complete }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: async () => true, featureOverBudget: async () => false }))
vi.mock('@/lib/ai/voice', () => ({ withVoice: (s: string) => s }))

import { planSeedImages, rankSeedImages, type SeedImagePlanItem } from './vision'

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

describe('the image_plan reply is read through a schema (PROG-E8C)', () => {
  const URLS = ['https://i.test/0.jpg', 'https://i.test/1.jpg', 'https://i.test/2.jpg']
  /** Read one image_plan reply through the real call path. */
  async function plan(input: unknown) {
    mocks.complete.mockResolvedValueOnce({ content: [{ type: 'tool_use', id: 't', name: 'image_plan', input }] })
    return planSeedImages(URLS, 'Acme', null)
  }

  it('maps a valid reply onto the images by index and picks the hero', async () => {
    const out = await plan({
      items: [
        { index: 0, category: 'logo', alt: 'A logo \u2014 mark', heroScore: 0.9 },
        { index: '1', category: 'exterior', alt: ' Storefront ', heroScore: '0.8' },
        { index: 2, category: 'interior', alt: 'Counter', heroScore: 0.4 },
      ],
    })
    expect(out?.heroUrl).toBe(URLS[1])
    expect(out?.order).toEqual([URLS[1], URLS[2], URLS[0]])
    expect(out?.items).toEqual([
      { url: URLS[0], category: 'logo', alt: 'A logo, mark', heroScore: 0.9 },
      { url: URLS[1], category: 'exterior', alt: 'Storefront', heroScore: 0.8 },
      { url: URLS[2], category: 'interior', alt: 'Counter', heroScore: 0.4 },
    ])
  })

  it('returns null, so the caller keeps the uploaded order, for a reply that is not the declared shape', async () => {
    for (const junk of [null, undefined, 'nope', 7, [], {}, { items: 'three' }]) expect(await plan(junk)).toBeNull()
  })

  it('drops rows it cannot place and gives each wrong-typed part its safe reading', async () => {
    const out = await plan({
      items: [null, 'junk', 4, { index: 9, category: 'hero', heroScore: 1 }, { index: 1.5 }, { category: 'hero' }, { index: 2, category: 'banner', alt: 7, heroScore: 'high' }, { index: 1, category: 'exterior', heroScore: 5 }],
    })
    expect(out?.items).toEqual([
      { url: URLS[0], category: 'other', alt: '', heroScore: 0 },
      { url: URLS[1], category: 'exterior', alt: '', heroScore: 1 },
      { url: URLS[2], category: 'other', alt: '7', heroScore: 0 },
    ])
    expect(out?.heroUrl).toBe(URLS[1])
  })
})
