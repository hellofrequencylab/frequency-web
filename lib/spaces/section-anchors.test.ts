import { describe, it, expect } from 'vitest'
import {
  SECTION_ANCHORS,
  NO_PRESENCE,
  MAX_SECTION_ANCHORS,
  listSectionBlocks,
  sectionRendersContent,
  deriveSectionNav,
  type SectionPresence,
} from './section-anchors'
import { generateDefaultSpacePage } from '@/lib/page-editor/templates/space-default'

const ALL_PRESENT: SectionPresence = {
  booking: true,
  events: true,
  reviews: true,
  faqs: true,
  updates: true,
  practices: true,
  community: true,
}

describe('listSectionBlocks', () => {
  it('reads the FLAT default in order (no SpaceLayout wrapper)', () => {
    const doc = generateDefaultSpacePage('Willow')
    const types = listSectionBlocks(doc).map((b) => b.type)
    // The default is now a flat top-level list: Highlights -> Offerings -> Booking -> About -> Events ...
    expect(types.slice(0, 5)).toEqual(['SpaceHighlights', 'SpaceOfferings', 'SpaceBooking', 'SpaceAbout', 'SpaceEvents'])
    expect(types).toContain('SpaceAbout')
  })

  it('still expands a legacy SpaceLayout box main-column-first then side, and tolerates junk', () => {
    // A legacy stored doc may still wrap blocks in a SpaceLayout; listSectionBlocks must expand it.
    const legacy = {
      root: {},
      content: [
        {
          type: 'SpaceLayout',
          props: {
            main: [{ type: 'SpaceOfferings', props: {} }, { type: 'SpaceBooking', props: {} }],
            side: [{ type: 'SpaceAbout', props: {} }],
          },
        },
      ],
    } as never
    expect(listSectionBlocks(legacy).map((b) => b.type)).toEqual(['SpaceOfferings', 'SpaceBooking', 'SpaceAbout'])
    expect(listSectionBlocks(null)).toEqual([])
    expect(listSectionBlocks({ content: 'nope' } as never)).toEqual([])
  })
})

describe('sectionRendersContent (mirrors each block honest-empty rule)', () => {
  it('judges authored sections from their own props', () => {
    expect(sectionRendersContent({ type: 'SpaceOfferings', props: { items: [] } }, NO_PRESENCE)).toBe(false)
    expect(
      sectionRendersContent({ type: 'SpaceOfferings', props: { items: [{ title: 'Reiki' }] } }, NO_PRESENCE),
    ).toBe(true)
    expect(sectionRendersContent({ type: 'SpaceAbout', props: { heading: 'About', body: ' ' } }, NO_PRESENCE)).toBe(false)
    expect(sectionRendersContent({ type: 'SpaceAbout', props: { body: 'Our story' } }, NO_PRESENCE)).toBe(true)
    expect(sectionRendersContent({ type: 'SpaceContact', props: { email: 'hi@x.co' } }, NO_PRESENCE)).toBe(true)
    expect(sectionRendersContent({ type: 'SpaceContact', props: {} }, NO_PRESENCE)).toBe(false)
    expect(sectionRendersContent({ type: 'SpaceTeam', props: { members: [{ name: 'Ana' }] } }, NO_PRESENCE)).toBe(true)
  })

  it('judges live sections from the presence flags, and unknown types never link', () => {
    expect(sectionRendersContent({ type: 'SpaceEvents', props: {} }, NO_PRESENCE)).toBe(false)
    expect(sectionRendersContent({ type: 'SpaceEvents', props: {} }, ALL_PRESENT)).toBe(true)
    expect(sectionRendersContent({ type: 'SpaceBooking', props: {} }, ALL_PRESENT)).toBe(true)
    expect(sectionRendersContent({ type: 'SpaceLayout', props: {} }, ALL_PRESENT)).toBe(false)
    expect(sectionRendersContent({ type: 'SomethingElse', props: {} }, ALL_PRESENT)).toBe(false)
  })
})

describe('deriveSectionNav', () => {
  it('includes only sections that will render, in reading order, with fixed short labels', () => {
    const doc = generateDefaultSpacePage('Willow')
    // A space with live booking + events but nothing else and no authored content: only those anchors.
    const nav = deriveSectionNav(doc, { ...NO_PRESENCE, booking: true, events: true })
    expect(nav).toEqual([SECTION_ANCHORS.SpaceBooking, SECTION_ANCHORS.SpaceEvents])
  })

  it('dedupes by anchor and caps the menu', () => {
    const many = {
      root: {},
      content: Array.from({ length: 20 }, (_, i) => ({
        type: i % 2 ? 'SpaceEvents' : 'SpaceReviews',
        props: { id: `b${i}` },
      })),
    }
    const nav = deriveSectionNav(many as never, ALL_PRESENT)
    expect(nav.map((n) => n.anchor)).toEqual(['reviews', 'events'])
    expect(nav.length).toBeLessThanOrEqual(MAX_SECTION_ANCHORS)
  })

  it('is fail-safe on a malformed doc', () => {
    expect(deriveSectionNav(undefined, ALL_PRESENT)).toEqual([])
    expect(deriveSectionNav({ content: [{}, { type: 42 }] } as never, ALL_PRESENT)).toEqual([])
  })
})
