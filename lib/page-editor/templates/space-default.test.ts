import { describe, it, expect } from 'vitest'
import { generateDefaultSpacePage } from './space-default'
import { isRenderableSpaceDoc } from './space'

// The ONE universal default page seeds every new page + a reset. It must be a renderable Puck
// doc (all blocks known to the current config), a single SpaceLayout region box, and carry the
// Space name into its copy. This replaces the four per-type template presets.
describe('generateDefaultSpacePage', () => {
  it('returns a renderable single-SpaceLayout document', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    expect(isRenderableSpaceDoc(doc)).toBe(true)
    expect(doc.content).toHaveLength(1)
    expect(doc.content[0].type).toBe('SpaceLayout')
  })

  it('arranges main = Offerings->Booking->Events->Reviews->FAQ, side = Highlights->About->QuickLinks->Contact', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    const layout = doc.content[0].props as { main: { type: string }[]; side: { type: string }[] }
    expect(layout.main.map((b) => b.type)).toEqual([
      'SpaceOfferings',
      'SpaceBooking',
      'SpaceEvents',
      'SpaceReviews',
      'SpaceFAQ',
    ])
    expect(layout.side.map((b) => b.type)).toEqual([
      'SpaceHighlights',
      'SpaceAbout',
      'SpaceQuickLinks',
      'SpaceContact',
    ])
  })

  it('carries the brand name into the About heading + Booking copy, and is honest-empty for authored blocks', () => {
    const doc = generateDefaultSpacePage('Willow Studio')
    const layout = doc.content[0].props as {
      main: { type: string; props: Record<string, unknown> }[]
      side: { type: string; props: Record<string, unknown> }[]
    }
    const about = layout.side.find((b) => b.type === 'SpaceAbout')!
    expect(about.props.heading).toBe('About Willow Studio')
    // Honest at day zero: the About body seeds EMPTY, so a visitor never reads fill-me-in copy
    // (the editor shows the designed placeholder instead).
    expect(about.props.body).toBe('')
    const booking = layout.main.find((b) => b.type === 'SpaceBooking')!
    expect(String(booking.props.body)).toContain('Willow Studio')
    const offerings = layout.main.find((b) => b.type === 'SpaceOfferings')!
    expect(offerings.props.items).toEqual([])
  })

  it('falls back to a neutral phrase for a blank name (never throws)', () => {
    const doc = generateDefaultSpacePage('   ')
    const layout = doc.content[0].props as { side: { type: string; props: Record<string, unknown> }[] }
    const about = layout.side.find((b) => b.type === 'SpaceAbout')!
    expect(about.props.heading).toBe('About this space')
  })
})
