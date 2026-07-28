import { describe, it, expect } from 'vitest'
import {
  CIRCLE_UPCOMING_LIMIT,
  belongsToCircle,
  circleEventScopeFilter,
  circleEventVisibilities,
  selectUpcomingForCircle,
  type CircleEventRow,
} from './circle-upcoming'

const CIRCLE = '11111111-2222-4333-8444-555555555555'
const OTHER = '99999999-8888-4777-8666-555555555555'
// The shared scope_id every standalone `public` event carries in production. A Circle must
// never match it (different id AND scope_type 'public').
const PUBLIC_SENTINEL = '27dd8ec1-afbc-43ce-b658-29067ca4ea41'
const NOW = new Date('2026-07-28T12:00:00Z')

function row(over: Partial<CircleEventRow> = {}): CircleEventRow {
  return {
    id: 'e1',
    title: 'Thursday walk',
    slug: 'thursday-walk',
    location: 'Moonlight Beach',
    starts_at: '2026-08-01T18:00:00Z',
    scope_id: CIRCLE,
    scope_type: 'circle',
    scope_circle_id: null,
    ...over,
  }
}

describe('circleEventVisibilities', () => {
  it('lists public only for a visitor', () => {
    expect(circleEventVisibilities(false)).toEqual(['public'])
  })

  it('adds circle_only for a member, Host, or steward', () => {
    expect(circleEventVisibilities(true)).toEqual(['public', 'circle_only'])
  })

  it('never lists unlisted or private, for anyone', () => {
    for (const insider of [true, false]) {
      const v = circleEventVisibilities(insider)
      expect(v).not.toContain('unlisted')
      expect(v).not.toContain('private')
    }
  })
})

describe('circleEventScopeFilter', () => {
  it('matches the creation scope and an approved placement, both by equality', () => {
    expect(circleEventScopeFilter(CIRCLE)).toBe(
      `scope_id.eq.${CIRCLE},scope_circle_id.eq.${CIRCLE}`,
    )
  })

  it('has no wildcard and no fallback id', () => {
    const filter = circleEventScopeFilter(CIRCLE) ?? ''
    expect(filter).not.toContain('*')
    expect(filter).not.toContain(PUBLIC_SENTINEL)
    // Every id in the expression is this circle's own.
    const ids = filter.match(/[0-9a-f-]{36}/gi) ?? []
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids)).toEqual(new Set([CIRCLE]))
  })

  it('returns null for anything that is not a uuid (nothing unsanitized reaches the query)', () => {
    for (const bad of ['', 'not-a-uuid', `${CIRCLE},scope_type.eq.public`, '*']) {
      expect(circleEventScopeFilter(bad)).toBeNull()
    }
  })
})

describe('belongsToCircle', () => {
  it('accepts the creation scope for circle and the legacy group value', () => {
    expect(belongsToCircle(row({ scope_type: 'circle' }), CIRCLE)).toBe(true)
    expect(belongsToCircle(row({ scope_type: 'group' }), CIRCLE)).toBe(true)
  })

  it('accepts an approved placement even when the creation scope is elsewhere', () => {
    const placed = row({ scope_id: PUBLIC_SENTINEL, scope_type: 'public', scope_circle_id: CIRCLE })
    expect(belongsToCircle(placed, CIRCLE)).toBe(true)
  })

  it('rejects a standalone public event on the shared sentinel scope', () => {
    const sentinel = row({ scope_id: PUBLIC_SENTINEL, scope_type: 'public', scope_circle_id: null })
    expect(belongsToCircle(sentinel, CIRCLE)).toBe(false)
  })

  it('rejects another circle and a matching id under a non-circle scope type', () => {
    expect(belongsToCircle(row({ scope_id: OTHER }), CIRCLE)).toBe(false)
    expect(belongsToCircle(row({ scope_type: 'space' }), CIRCLE)).toBe(false)
    expect(belongsToCircle(row({ scope_type: null }), CIRCLE)).toBe(false)
  })
})

describe('selectUpcomingForCircle', () => {
  it('keeps future events only, soonest first (the populated path)', () => {
    const { events, hasMore } = selectUpcomingForCircle(
      [
        row({ id: 'later', starts_at: '2026-09-01T18:00:00Z' }),
        row({ id: 'past', starts_at: '2026-07-01T18:00:00Z' }),
        row({ id: 'soonest', starts_at: '2026-07-29T18:00:00Z' }),
        row({ id: 'middle', starts_at: '2026-08-15T18:00:00Z' }),
      ],
      CIRCLE,
      NOW,
    )
    expect(events.map((e) => e.id)).toEqual(['soonest', 'middle', 'later'])
    expect(hasMore).toBe(false)
    expect(events[0]).toMatchObject({
      title: 'Thursday walk',
      slug: 'thursday-walk',
      location: 'Moonlight Beach',
      starts_at: '2026-07-29T18:00:00Z',
    })
  })

  it('orders by the instant, not the string spelling of the offset', () => {
    const { events } = selectUpcomingForCircle(
      [
        row({ id: 'z', starts_at: '2026-08-01T18:00:00Z' }),
        row({ id: 'offset', starts_at: '2026-08-01T17:00:00+00:00' }),
      ],
      CIRCLE,
      NOW,
    )
    expect(events.map((e) => e.id)).toEqual(['offset', 'z'])
  })

  it('drops rows with no start time or an unparseable one', () => {
    const { events } = selectUpcomingForCircle(
      [row({ id: 'null', starts_at: null }), row({ id: 'junk', starts_at: 'someday' }), row({ id: 'ok' })],
      CIRCLE,
      NOW,
    )
    expect(events.map((e) => e.id)).toEqual(['ok'])
  })

  it('keeps an event that starts exactly now', () => {
    const { events } = selectUpcomingForCircle(
      [row({ id: 'now', starts_at: NOW.toISOString() })],
      CIRCLE,
      NOW,
    )
    expect(events.map((e) => e.id)).toEqual(['now'])
  })

  it('dedupes by id (creation scope and placement can both match)', () => {
    const { events } = selectUpcomingForCircle(
      [row({ id: 'e1' }), row({ id: 'e1', scope_circle_id: CIRCLE })],
      CIRCLE,
      NOW,
    )
    expect(events).toHaveLength(1)
  })

  it('never lets another circle or the public sentinel into the list', () => {
    const { events } = selectUpcomingForCircle(
      [
        row({ id: 'mine' }),
        row({ id: 'theirs', scope_id: OTHER }),
        row({ id: 'sentinel', scope_id: PUBLIC_SENTINEL, scope_type: 'public' }),
      ],
      CIRCLE,
      NOW,
    )
    expect(events.map((e) => e.id)).toEqual(['mine'])
  })

  it('caps at the limit and reports there is more', () => {
    const many = Array.from({ length: CIRCLE_UPCOMING_LIMIT + 3 }, (_, i) =>
      row({ id: `e${i}`, starts_at: `2026-08-${String(i + 1).padStart(2, '0')}T18:00:00Z` }),
    )
    const { events, hasMore } = selectUpcomingForCircle(many, CIRCLE, NOW)
    expect(events).toHaveLength(CIRCLE_UPCOMING_LIMIT)
    expect(events.map((e) => e.id)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4'])
    expect(hasMore).toBe(true)
  })

  it('returns an empty list, not a throw, when the circle has nothing (the day-one default)', () => {
    expect(selectUpcomingForCircle([], CIRCLE, NOW)).toEqual({ events: [], hasMore: false })
  })
})
