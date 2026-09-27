import { describe, expect, it } from 'vitest'
import {
  MEMBER_SURFACES,
  UPCOMING_FEED_MAX,
  memberLayerChoices,
  upcomingFeedRows,
  type UpcomingFeedSource,
} from './member-calendar'

// THE MEMBER HALF OF THE MERGED CALENDAR & EVENTS PAGE (LIVE-520).
//
// The two things these pin are the two the page got wrong before it was merged: a visitor was
// offered no way of looking at all, and "what is next" existed only as a second menu item into a
// Home section. Both are pure here so they can be measured without a DOM.

function row(over: Partial<UpcomingFeedSource> = {}): UpcomingFeedSource {
  return {
    id: over.id ?? 'e1',
    slug: over.slug ?? 'fire-circle',
    title: over.title ?? 'Temple Moon: Full Moon Fire Circle',
    // The stored WALL CLOCK as UTC parts, the way events.starts_at holds it.
    starts_at: over.starts_at ?? '2026-10-23T18:30:00',
    location: over.location ?? 'Royal Temple',
    is_cancelled: over.is_cancelled,
  }
}

describe('the views a member is offered', () => {
  it('is more than one, because a grid with no way out of it is not a calendar', () => {
    expect(MEMBER_SURFACES.length).toBeGreaterThan(1)
    expect(MEMBER_SURFACES).toContain('grid')
    expect(MEMBER_SURFACES).toContain('list')
  })

  it('never offers Workflow, which is a board of the team internal Plans', () => {
    expect(MEMBER_SURFACES).not.toContain('workflow')
  })
})

describe('the Up next band', () => {
  it('features the soonest gatherings, in order', () => {
    const rows = [
      row({ id: 'c', starts_at: '2026-10-30T18:30:00', title: 'Third' }),
      row({ id: 'a', starts_at: '2026-10-02T19:00:00', title: 'First' }),
      row({ id: 'b', starts_at: '2026-10-23T18:30:00', title: 'Second' }),
    ]
    expect(upcomingFeedRows(rows, '2026-10-01').map((r) => r.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('drops anything before the day it is asked for', () => {
    const rows = [row({ id: 'past', starts_at: '2026-09-30T19:00:00' }), row({ id: 'soon' })]
    expect(upcomingFeedRows(rows, '2026-10-01').map((r) => r.id)).toEqual(['soon'])
  })

  it('KEEPS a gathering later TODAY, which is the bug a UTC day floor causes west of UTC', () => {
    // 7 PM Pacific on the 27th is the 28th in UTC. A floor taken in UTC drops it from 5 PM local
    // onward; the floor is the SPACE day for exactly this reason.
    const tonight = row({ id: 'tonight', starts_at: '2026-09-27T19:00:00' })
    expect(upcomingFeedRows([tonight], '2026-09-27').map((r) => r.id)).toEqual(['tonight'])
  })

  it('never features a cancelled gathering under the words Up next', () => {
    const rows = [row({ id: 'off', is_cancelled: true }), row({ id: 'on', starts_at: '2026-10-24T18:30:00' })]
    expect(upcomingFeedRows(rows, '2026-10-01').map((r) => r.id)).toEqual(['on'])
  })

  it('caps the band, so it never outgrows the calendar beside it', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: `e${i}`, starts_at: `2026-10-${String(i + 1).padStart(2, '0')}T18:30:00` }),
    )
    expect(upcomingFeedRows(rows, '2026-10-01')).toHaveLength(UPCOMING_FEED_MAX)
    expect(upcomingFeedRows(rows, '2026-10-01', 2)).toHaveLength(2)
  })

  it('collapses a row that arrives twice, because the store unions three reads', () => {
    const twice = [row({ id: 'same' }), row({ id: 'same' })]
    expect(upcomingFeedRows(twice, '2026-10-01')).toHaveLength(1)
  })

  it('is EMPTY rather than a heading over nothing', () => {
    expect(upcomingFeedRows([], '2026-10-01')).toEqual([])
    expect(upcomingFeedRows([row({ is_cancelled: true })], '2026-10-01')).toEqual([])
  })

  it('survives a row with no readable start', () => {
    expect(upcomingFeedRows([{ id: 'x', slug: 's', title: 't', starts_at: '' }], '2026-10-01')).toEqual([])
  })
})

describe('the filter a member can reach', () => {
  it('offers nothing when there is only one kind of thing on the calendar', () => {
    expect(memberLayerChoices([{ layer: 'events' }, { layer: 'events' }])).toEqual([])
    // An absent layer IS the events layer (lib/calendar/item.ts).
    expect(memberLayerChoices([{}, {}])).toEqual([])
  })

  it('offers Events and Unavailable once the Space publishes closed time', () => {
    expect(memberLayerChoices([{ layer: 'unavailable' }, { layer: 'events' }])).toEqual(['events', 'unavailable'])
  })

  it('keeps one order whatever order the items arrived in', () => {
    expect(memberLayerChoices([{ layer: 'unavailable' }, { layer: 'events' }])).toEqual(
      memberLayerChoices([{ layer: 'events' }, { layer: 'unavailable' }]),
    )
  })

  it('never offers a private layer to a member', () => {
    const choices = memberLayerChoices([{ layer: 'events' }, { layer: 'pencil' }, { layer: 'private' }])
    expect(choices).not.toContain('pencil')
    expect(choices).not.toContain('private')
  })
})
