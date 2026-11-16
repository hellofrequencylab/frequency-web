import { describe, it, expect } from 'vitest'
import { PROFILE_BLOCKS, profileBlockById, defaultProfileLayout } from '@/lib/entity-blocks/space-profile'
import { parseSavedProfileLayout, mergeProfileLayout, effectiveProfileLayout } from '@/lib/spaces/profile-layout'
import type { SpaceFunctionKey } from '@/lib/spaces/functions'

// THE SPACE PROFILE GOLDENS (PROG-E2B). Written and run green against the hand-written catalog
// (lib/spaces/profile-blocks.ts) BEFORE that catalog was folded into the entity-block registry, then kept.
// The fold changed one line of this file: the first import. Every expectation below is a literal, so a
// diff here that is not a deliberate, dated product change is a regression in what a Space profile
// shows, in what order, or in which saved ids survive a read.
//
// Re-baselining log (add a dated line for every deliberate change; none so far):
//   2026-11-16  frozen from the hand-written catalog, 14 sections.

const GOLDEN = [
  { id: 'about', label: 'About', description: 'Who this space is and what it offers.', requiresFunction: null, types: ['*'], order: 10 },
  { id: 'story', label: 'Story', description: 'The longer story of this space.', requiresFunction: null, types: ['*'], order: 15 },
  { id: 'highlights', label: 'Highlights', description: 'Live counts and standout stats.', requiresFunction: null, types: ['*'], order: 20 },
  { id: 'offerings', label: 'Offerings', description: 'The services or products members can book or buy.', requiresFunction: null, types: ['*'], order: 30 },
  { id: 'booking', label: 'Booking', description: 'Pick a time and book a session.', requiresFunction: 'availability', types: ['*'], order: 40 },
  { id: 'memberships', label: 'Memberships', description: 'A button that opens your membership plans.', requiresFunction: 'memberships', types: ['*'], order: 45 },
  { id: 'events', label: 'Events', description: 'Upcoming events to show up to.', requiresFunction: null, types: ['*'], order: 50 },
  { id: 'practices', label: 'Practices and journeys', description: 'Practices and journeys to start here.', requiresFunction: null, types: ['*'], order: 60 },
  { id: 'circles', label: 'Circles', description: 'The community circles inside this space.', requiresFunction: null, types: ['*'], order: 70 },
  { id: 'team', label: 'Team', description: 'The people who run this space.', requiresFunction: 'members', types: ['*'], order: 80 },
  { id: 'reviews', label: 'Reviews', description: 'What members say.', requiresFunction: null, types: ['*'], order: 90 },
  { id: 'faq', label: 'FAQ', description: 'Common questions, answered.', requiresFunction: null, types: ['*'], order: 100 },
  { id: 'contact', label: 'Contact and hours', description: 'How and when to reach this space.', requiresFunction: null, types: ['*'], order: 120 },
  { id: 'business', label: 'Business presence', description: 'Find this space online.', requiresFunction: null, types: ['*'], order: 130 },
]

const fns = (...keys: SpaceFunctionKey[]): ReadonlySet<SpaceFunctionKey> => new Set(keys)

describe('Space profile sections: the catalog, frozen', () => {
  it('is the same fourteen rows, field for field and in the same order', () => {
    expect(PROFILE_BLOCKS).toEqual(GOLDEN)
  })

  it('serialises byte for byte (key order included)', () => {
    expect(JSON.stringify(PROFILE_BLOCKS)).toBe(JSON.stringify(GOLDEN))
  })

  it('finds every section by id, as the same row the list holds', () => {
    for (const row of GOLDEN) {
      expect(profileBlockById(row.id)).toEqual(row)
      expect(profileBlockById(row.id)).toBe(PROFILE_BLOCKS.find((b) => b.id === row.id))
    }
  })

  it('answers null for an id that is not a profile section', () => {
    // `stats`, `journeys` and `linkCards` are registry blocks a Space can hold on its grid, but they are not
    // flat profile sections; `updates` was retired. None may start validating as a saved section id.
    for (const id of ['stats', 'journeys', 'linkCards', 'donate', 'updates', 'heading', 'callout', 'nope', '', 'About', 'toString', 'constructor']) {
      expect(profileBlockById(id), id).toBeNull()
    }
  })
})

describe('Space profile sections: the fresh default layout, frozen', () => {
  const NONE = ['about', 'story', 'highlights', 'offerings', 'events', 'practices', 'circles', 'reviews', 'faq', 'contact', 'business']

  it('no functions on', () => {
    expect(defaultProfileLayout('business', fns())).toEqual(NONE)
  })

  it('availability adds Booking after Offerings', () => {
    expect(defaultProfileLayout('business', fns('availability'))).toEqual(['about', 'story', 'highlights', 'offerings', 'booking', 'events', 'practices', 'circles', 'reviews', 'faq', 'contact', 'business'])
  })

  it('memberships adds Memberships after Offerings', () => {
    expect(defaultProfileLayout('business', fns('memberships'))).toEqual(['about', 'story', 'highlights', 'offerings', 'memberships', 'events', 'practices', 'circles', 'reviews', 'faq', 'contact', 'business'])
  })

  it('members adds Team after Circles', () => {
    expect(defaultProfileLayout('business', fns('members'))).toEqual(['about', 'story', 'highlights', 'offerings', 'events', 'practices', 'circles', 'team', 'reviews', 'faq', 'contact', 'business'])
  })

  it('all three on is every section, in catalog order', () => {
    expect(defaultProfileLayout('business', fns('availability', 'memberships', 'members'))).toEqual(GOLDEN.map((r) => r.id))
  })

  it('a function with no section changes nothing, and the Space type never does', () => {
    expect(defaultProfileLayout('business', fns('events' as SpaceFunctionKey))).toEqual(NONE)
    expect(defaultProfileLayout('nonprofit', fns())).toEqual(NONE)
    expect(defaultProfileLayout('nonprofit', fns('availability', 'memberships', 'members'))).toEqual(GOLDEN.map((r) => r.id))
  })
})

describe('Space profile sections: which saved ids survive a read, frozen', () => {
  it('keeps every section id, in the saved order', () => {
    const order = GOLDEN.map((r) => r.id).reverse()
    expect(parseSavedProfileLayout({ profileLayout: { order, hidden: ['faq', 'highlights'] } })).toEqual({ order, hidden: ['faq', 'highlights'] })
  })

  it('drops ids that are not sections, non-strings and repeats', () => {
    const prefs = { profileLayout: { order: ['team', 'stats', 'about', 'journeys', 'team', 7, null, 'updates', 'highlights', 'callout'], hidden: ['stats', 'faq', 'faq', 'ghost'] } }
    expect(parseSavedProfileLayout(prefs)).toEqual({ order: ['team', 'about', 'highlights'], hidden: ['faq'] })
  })

  it('reads a blob with no usable ids as an empty edit, and a wrong shape as null', () => {
    expect(parseSavedProfileLayout({ profileLayout: { order: ['stats'], hidden: 'about' } })).toEqual({})
    expect(parseSavedProfileLayout({ profileLayout: ['about'] })).toBeNull()
    expect(parseSavedProfileLayout(undefined)).toBeNull()
  })

  it('merges a saved edit over the default without inventing a section', () => {
    const def = defaultProfileLayout('business', fns('members'))
    expect(mergeProfileLayout(def, { order: ['team', 'booking', 'about'], hidden: ['story', 'memberships'] })).toEqual(['team', 'about', 'highlights', 'offerings', 'events', 'practices', 'circles', 'reviews', 'faq', 'contact', 'business'])
  })

  it('resolves the effective layout from a stored preferences blob', () => {
    const space = { type: 'business' as const, entitlements: null }
    const fresh = effectiveProfileLayout(space, null)
    const edited = effectiveProfileLayout(space, { profileLayout: { order: ['contact', 'stats', 'about'], hidden: ['faq'] } })
    expect(edited.slice(0, 2)).toEqual(['contact', 'about'])
    expect(edited).not.toContain('faq')
    expect([...edited].sort()).toEqual(fresh.filter((id) => id !== 'faq').sort())
  })
})
