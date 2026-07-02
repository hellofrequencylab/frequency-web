import { describe, it, expect } from 'vitest'
import { generateDefaultSpacePage } from './space-default'
import { isRenderableSpaceDoc } from './space'

// The ONE universal default page seeds every new page + a reset. It must be a renderable Puck doc
// (all blocks known to the current config), a FLAT top-level list (no SpaceLayout wrapper, so every
// block is individually editable in the minimal layout editor), and carry the Space name into its
// copy. This replaces the four per-type template presets.
describe('generateDefaultSpacePage', () => {
  it('returns a renderable FLAT document (no SpaceLayout wrapper)', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    expect(isRenderableSpaceDoc(doc)).toBe(true)
    // Flat: more than one top-level block, and none of them is a SpaceLayout region box.
    expect(doc.content.length).toBeGreaterThan(1)
    expect(doc.content.some((b) => b.type === 'SpaceLayout')).toBe(false)
  })

  it('arranges a flat importance order: Highlights -> Offerings -> Booking -> About -> Events -> Practices -> Community -> Reviews -> FAQ -> Business -> Contact -> Callout', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    expect(doc.content.map((b) => b.type)).toEqual([
      'SpaceHighlights',
      'SpaceOfferings',
      'SpaceBooking',
      'SpaceAbout',
      'SpaceEvents',
      'SpacePractices',
      'SpaceCommunity',
      'SpaceReviews',
      'SpaceFAQ',
      'SpaceBusiness',
      'SpaceContact',
      'SpaceCallout',
    ])
  })

  it('carries the brand name into the About heading + Booking copy, and is honest-empty for authored blocks', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    const block = (type: string) => doc.content.find((b) => b.type === type)!.props as Record<string, unknown>
    const about = block('SpaceAbout')
    expect(about.heading).toBe('About Willow Studio')
    // Honest at day zero: the About body seeds EMPTY, so a visitor never reads fill-me-in copy
    // (the editor shows the designed placeholder instead).
    expect(about.body).toBe('')
    expect(String(block('SpaceBooking').body)).toContain('Willow Studio')
    expect(block('SpaceOfferings').items).toEqual([])
  })

  it('falls back to a neutral phrase for a blank name (never throws)', () => {
    const doc = generateDefaultSpacePage('   ')
    const about = doc.content.find((b) => b.type === 'SpaceAbout')!.props as Record<string, unknown>
    expect(about.heading).toBe('About this space')
  })
})
