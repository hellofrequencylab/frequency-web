import { describe, it, expect } from 'vitest'
import { defaultLayoutFor } from './default-layouts'
import { resolveSlots, type LayoutConfig } from './layout'
import { moduleIdsForScope } from '@/lib/widgets/modules'

// The coded per-route default layouts. These are what a page renders out of the box, so the rules
// the owner set for a page's shape are enforced HERE rather than left to a comment: a later edit
// that quietly re-adds a box to the circle rail, or leaves a module unplaced, fails the build.

/** The ids a slot actually RENDERS: its order, minus anything toggled off. */
function visible(config: LayoutConfig, slot: string, ids: readonly string[]): string[] {
  return resolveSlots(config, ids, 'host')[slot] ?? []
}

describe('the circle detail default layout (/circles/*)', () => {
  const config = defaultLayoutFor('/circles/some-circle')!
  const ids = moduleIdsForScope('/circles/*')

  it('registers a layout for every circle detail page', () => {
    expect(config).toBeDefined()
    expect(config.template).toBe('header-side')
    // The section scope answers for any circle, not just the one route.
    expect(defaultLayoutFor('/circles/another-circle')).toBe(config)
  })

  // The rule this file exists for. Eyetracking puts ~0.8% of fixations on a right rail holding
  // ~25% of the screen: a stack of seven boxes reads as one region to skip. Three, and no more.
  it('renders AT MOST three modules in the side rail', () => {
    expect(visible(config, 'side', ids).length).toBeLessThanOrEqual(3)
  })

  it('orders the rail time-bound, then action, then evergreen', () => {
    // 1. what is on next (and the way in to RSVP) · 2. this week's practice and its log button ·
    // 3. how and where we meet.
    expect(visible(config, 'side', ids)).toEqual(['circle-events', 'circle-practice', 'circle-meeting'])
  })

  it('keeps host write actions out of the member-facing column', () => {
    // Both retired from the page: invites already render in the `circle.people` admin module, and
    // Start a Run moved into `circle.engage`. Out of the SET, so no saved layout can restore them.
    for (const gone of ['circle-invite', 'circle-journey-run']) {
      expect(ids).not.toContain(gone)
      for (const slot of ['header', 'main', 'side']) {
        expect(config.slots[slot]?.order ?? []).not.toContain(gone)
      }
    }
  })

  it('leads MAIN with the feed, and never buries a module under it', () => {
    const main = visible(config, 'main', ids)
    // The challenges strip self-hides when the circle has adopted none, so it costs nothing above
    // the feed. Nothing sits BELOW the feed: a feed has no bottom.
    expect(main).toEqual(['circle-challenges', 'circle-feed'])
    expect(main[main.length - 1]).toBe('circle-feed')
  })

  it('places every module in the circle set explicitly, on or off', () => {
    // An unplaced id is auto-appended to the template's FIRST slot, which here is the full-width
    // header. That is how "How we meet" once rendered above the circle feed. Placing every id, even
    // the ones toggled off, is what keeps a module from falling through.
    const placed = new Set(Object.values(config.slots).flatMap((s) => s.order))
    const unplaced = ids.filter((id) => !placed.has(id))
    expect(unplaced, `unplaced circle modules fall into the header: ${unplaced.join(', ')}`).toEqual([])
  })

  it('keeps the toggled-off rail modules registered, so an operator can bring any back', () => {
    const off = config.slots.side?.hidden ?? []
    expect(off).toEqual(['circle-map', 'circle-members', 'circle-momentum', 'circle-health'])
    for (const id of off) expect(ids).toContain(id)
  })
})

// NOT asserted for '/events/*' yet, and deliberately so: four ids in the event set
// (event-facts, event-attendees, event-checkin, event-warm-proof) are unplaced today, so they
// auto-append to MAIN even though the layout's own comments describe three of them as SIDE
// blocks. That is the same class of bug the circle header had. Fixing it changes what every event
// page renders, which is an owner call on the event page, not a side effect of the circle trim.
