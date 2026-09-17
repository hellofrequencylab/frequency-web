import { describe, it, expect } from 'vitest'
import { defaultLayoutFor } from './default-layouts'
import { resolveSlots, type LayoutConfig } from './layout'
import { moduleIdsForScope, SPACE_CIRCLE_ONLY_MODULE_IDS } from '@/lib/widgets/modules'

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
  // ~25% of the screen: a stack of seven boxes reads as one region to skip. The 2026-08-12 trim
  // capped it at three; the owner then named two boxes to keep there (the roster and the events),
  // so the cap is FOUR. It is still a cap, and the point of asserting it is that the rail never
  // creeps back toward seven one well-meaning addition at a time.
  //
  // ── THE CAP MEASURES THE ALWAYS-ON SET (amended 2026-09-17, ADR-1393) ────────────────────────
  // `circle-space-info` joined the rail and renders on a SPACE CIRCLE and nothing else: it gates on
  // `spaceCircleEventScope`, which refuses every ordinary Circle and the root tenant, and returns
  // null. So all 7 ordinary Circles in production still show exactly the four boxes this cap was
  // written to hold them to, and only the 21 Space Circles show a fifth.
  //
  // The exemption is asserted against SPACE_CIRCLE_ONLY_MODULE_IDS rather than by raising the
  // number, which is the whole point: raising it to five would let the NEXT always-on block in for
  // free, and that is precisely the one-addition-at-a-time creep the cap exists to refuse.
  it('renders AT MOST four ALWAYS-ON modules in the side rail', () => {
    const alwaysOn = visible(config, 'side', ids).filter(
      (id) => !SPACE_CIRCLE_ONLY_MODULE_IDS.includes(id),
    )
    expect(alwaysOn.length).toBeLessThanOrEqual(4)
  })

  it('exempts only blocks that are genuinely Space-Circle-only', () => {
    // The exemption cannot become a parking space: every id claiming it has to be a real circle
    // block, and the list stays short enough to read.
    for (const id of SPACE_CIRCLE_ONLY_MODULE_IDS) expect(ids).toContain(id)
    expect(SPACE_CIRCLE_ONLY_MODULE_IDS.length).toBeLessThanOrEqual(2)
  })

  it('orders the rail time-bound, then people, then action, then evergreen', () => {
    // 1. what is on next (and the way in to RSVP) · 2. the Space's own details, on a Space Circle
    // only · 3. who is actually in the room · 4. this week's practice and its log button ·
    // 5. how and where we meet.
    expect(visible(config, 'side', ids)).toEqual([
      'circle-events',
      'circle-space-info',
      'circle-members',
      'circle-practice',
      'circle-meeting',
    ])
  })

  it('reads exactly as it always did on an ordinary Circle', () => {
    // The order an ordinary Circle actually paints, with the Space-only block removed. This is the
    // assertion the old four-item one was really making, and it must not drift.
    const alwaysOn = visible(config, 'side', ids).filter(
      (id) => !SPACE_CIRCLE_ONLY_MODULE_IDS.includes(id),
    )
    expect(alwaysOn).toEqual([
      'circle-events',
      'circle-members',
      'circle-practice',
      'circle-meeting',
    ])
  })

  it('keeps the roster and the events in the rail: they have tabs AND boxes, on purpose', () => {
    // 🔴 The owner put both back by name after the 2026-08-12 trim dropped them on the reasoning
    // that "the roster has its own tab now". A box and a tab are not the same affordance: the box
    // is who is here / what is next, the tab is the full list you go and browse. A later edit that
    // removes either one as a duplicate is repeating the trim, so it fails here.
    const rail = visible(config, 'side', ids)
    expect(rail).toContain('circle-members')
    expect(rail).toContain('circle-events')
  })

  it('keeps momentum OUT of the rail, because it renders on the Circle Stats tab', () => {
    // The other half of the same ruling. Momentum moved to its own tab with the effort board;
    // leaving it in the rail as well would put the same four numbers on the page twice.
    expect(visible(config, 'side', ids)).not.toContain('circle-momentum')
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
    expect(off).toEqual(['circle-map', 'circle-momentum', 'circle-health'])
    for (const id of off) expect(ids).toContain(id)
  })
})

// NOT asserted for '/events/*' yet, and deliberately so: two ids in the event set
// (event-attendees, event-checkin) are unplaced today, so they auto-append to MAIN even though the
// layout's own comments describe them as SIDE blocks. It read "four" until 2026-09-10, when
// ADR-1309 removed event-facts and event-warm-proof from the set entirely: both had returned null
// since ADR-826, so they were unplaced AND undrawable. That is the same class of bug the circle header had. Fixing it changes what every event
// page renders, which is an owner call on the event page, not a side effect of the circle trim.
