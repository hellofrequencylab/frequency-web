import { describe, expect, it } from 'vitest'
import { generateOfferPage } from './space-offer'
import { isRenderableSpaceDoc } from './space'

describe('generateOfferPage', () => {
  const doc = generateOfferPage('Willow Yoga', { title: 'Riverside Yoga, 6 weeks', blurb: 'Tuesdays at 6pm.', price: 180, currency: 'USD', durationMinutes: 75 })

  it('is a renderable flat document of known Space blocks', () => {
    expect(isRenderableSpaceDoc(doc)).toBe(true)
    expect(doc.content.map((b) => b.type)).toEqual(['SpaceAbout', 'SpaceOfferings', 'SpaceBooking', 'SpaceCallout'])
  })
  it('carries the offer into the heading and the single offering', () => {
    const props = (type: string) => doc.content.find((b) => b.type === type)!.props as Record<string, unknown>
    expect(props('SpaceAbout').heading).toBe('Riverside Yoga, 6 weeks')
    const items = props('SpaceOfferings').items as { title: string; price: number }[]
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ title: 'Riverside Yoga, 6 weeks', price: 180 })
  })
  it('seeds the closing callout without a button, never a # link', () => {
    const call = doc.content.find((b) => b.type === 'SpaceCallout')!.props as Record<string, unknown>
    expect(call.ctaHref).toBe('')
    expect(call.ctaLabel).toBe('')
  })
  it('falls back when the Space has no name', () => {
    expect(JSON.stringify(generateOfferPage('  ', { title: 'A class' }))).toContain('this space')
  })
})
