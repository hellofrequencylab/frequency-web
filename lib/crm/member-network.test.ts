import { describe, it, expect } from 'vitest'
import {
  assembleNetwork,
  isEmptyNetwork,
  managedCount,
  filterMajorMilestones,
  EMPTY_NETWORK,
  type MemberNetwork,
} from './member-network'
import type { JourneyEvent } from './journey'

describe('assembleNetwork', () => {
  it('maps hosted circles, events, owned spaces and memberships into network items', () => {
    const net = assembleNetwork({
      circles: [{ id: 'c1', slug: 'morning-sit', name: 'Morning Sit', status: 'active' }],
      events: [{ id: 'e1', slug: 'sound-bath', title: 'Sound Bath', starts_at: '2026-08-01T18:00:00.000Z', is_cancelled: false }],
      spaces: [{ id: 's1', slug: 'lighthouse', name: 'Lighthouse', status: 'active' }],
      memberCircles: [{ id: 'c9', slug: 'evening-flow', name: 'Evening Flow' }],
    })

    expect(net.circlesHosted).toEqual([{ id: 'c1', label: 'Morning Sit', href: '/circles/morning-sit' }])
    expect(net.eventsHosted[0]).toMatchObject({ id: 'e1', label: 'Sound Bath', href: '/events/sound-bath' })
    expect(net.eventsHosted[0].meta).toContain('2026')
    // Spaces stay label-only (no guaranteed public route → never a broken link).
    expect(net.spacesOwned).toEqual([{ id: 's1', label: 'Lighthouse' }])
    expect(net.memberOf).toEqual([{ id: 'c9', label: 'Evening Flow', href: '/circles/evening-flow' }])
  })

  it('drops cancelled events and archived circles/spaces', () => {
    const net = assembleNetwork({
      circles: [
        { id: 'c1', slug: 'live', name: 'Live', status: 'active' },
        { id: 'c2', slug: 'gone', name: 'Gone', status: 'archived' },
      ],
      events: [
        { id: 'e1', slug: 'on', title: 'On', starts_at: null, is_cancelled: false },
        { id: 'e2', slug: 'off', title: 'Off', starts_at: null, is_cancelled: true },
      ],
      spaces: [{ id: 's1', slug: 'old', name: 'Old', status: 'removed' }],
      memberCircles: [],
    })
    expect(net.circlesHosted.map((c) => c.id)).toEqual(['c1'])
    expect(net.eventsHosted.map((e) => e.id)).toEqual(['e1'])
    expect(net.spacesOwned).toEqual([])
  })

  it('falls back to slug then a placeholder when a name is missing, and omits hrefs without a slug', () => {
    const net = assembleNetwork({
      circles: [
        { id: 'c1', slug: 'has-slug', name: null, status: 'active' },
        { id: 'c2', slug: null, name: null, status: 'active' },
      ],
      events: [],
      spaces: [],
      memberCircles: [],
    })
    expect(net.circlesHosted[0]).toEqual({ id: 'c1', label: 'has-slug', href: '/circles/has-slug' })
    expect(net.circlesHosted[1]).toEqual({ id: 'c2', label: 'Untitled circle', href: undefined })
  })

  it('is fully fail-safe on null / undefined inputs', () => {
    expect(assembleNetwork({})).toEqual(EMPTY_NETWORK)
    expect(assembleNetwork({ circles: null, events: null, spaces: null, memberCircles: null })).toEqual(EMPTY_NETWORK)
  })
})

describe('isEmptyNetwork / managedCount', () => {
  const full: MemberNetwork = {
    circlesHosted: [{ id: 'c1', label: 'A' }],
    eventsHosted: [{ id: 'e1', label: 'B' }],
    spacesOwned: [{ id: 's1', label: 'C' }],
    memberOf: [{ id: 'c2', label: 'D' }],
  }
  it('detects the empty network', () => {
    expect(isEmptyNetwork(EMPTY_NETWORK)).toBe(true)
    expect(isEmptyNetwork(full)).toBe(false)
  })
  it('counts only managed entities (not memberships)', () => {
    expect(managedCount(EMPTY_NETWORK)).toBe(0)
    expect(managedCount(full)).toBe(3)
  })
})

describe('filterMajorMilestones', () => {
  const ev = (over: Partial<JourneyEvent>): JourneyEvent => ({
    at: '2026-06-01T00:00:00.000Z',
    kind: 'engagement',
    phase: 'in_app',
    title: 'Something',
    ...over,
  })

  it('keeps joined and major building acts, drops navigation / pageviews and other noise', () => {
    const out = filterMajorMilestones([
      ev({ kind: 'joined', title: 'Became a member' }),
      ev({ kind: 'engagement', title: 'Started a circle' }),
      ev({ kind: 'engagement', title: 'Hosted an event' }),
      ev({ kind: 'engagement', title: 'Created a space' }),
      ev({ kind: 'engagement', title: 'Referral signup' }),
      ev({ kind: 'engagement', title: 'Viewed a page' }), // noise → dropped
      ev({ kind: 'engagement', title: 'Navigation tap' }), // noise → dropped
      ev({ kind: 'scan', title: 'Scanned a QR code' }), // not major → dropped
      ev({ kind: 'activity', title: 'Note' }), // not major → dropped
      ev({ kind: 'deal', title: 'Deal: Sponsorship' }), // not major → dropped
    ])
    expect(out.map((m) => m.title)).toEqual([
      'Became a member',
      'Started a circle',
      'Hosted an event',
      'Created a space',
      'Referral signup',
    ])
  })

  it('matches a major act on the channel too, and respects the limit', () => {
    const out = filterMajorMilestones(
      [
        ev({ kind: 'engagement', title: 'Tap', channel: 'circle_create' }),
        ev({ kind: 'joined', title: 'Joined' }),
        ev({ kind: 'joined', title: 'Joined again' }),
      ],
      2,
    )
    expect(out).toHaveLength(2)
  })

  it('is fail-safe on empty input', () => {
    expect(filterMajorMilestones([])).toEqual([])
    expect(filterMajorMilestones(undefined as unknown as JourneyEvent[])).toEqual([])
  })
})
