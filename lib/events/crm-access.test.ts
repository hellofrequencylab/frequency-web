import { describe, it, expect, vi } from 'vitest'

// The pure entitlement seam for the event CRM access tiers (ADR-836): tier resolution,
// the before/during/after boundaries, and the lock derivation. The IO loaders are thin
// assemblies over collaborators tested elsewhere; the server deps are stubbed so importing
// the module never touches Next/Supabase.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: vi.fn() }))
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))

import {
  resolveEventCrmAccess,
  eventCrmLocksAt,
  eventCrmLockedError,
  EVENT_CRM_UPSELL_LINE,
  EVENT_CRM_LOCKED_MESSAGE,
  type ResolveEventCrmAccessInput,
} from './crm-access'

const NOW = new Date('2026-07-26T12:00:00.000Z')

function input(over: Partial<ResolveEventCrmAccessInput> = {}): ResolveEventCrmAccessInput {
  return {
    viewerProfileId: 'viewer-1',
    event: {
      id: 'event-1',
      hostSpaceId: null,
      startsAt: '2026-07-25T18:00:00.000Z',
      endsAt: '2026-07-25T21:00:00.000Z',
      ...(over.event ?? {}),
    },
    caps: { staff: false, hostSpaceSteward: false, ...(over.caps ?? {}) },
    hostSpacePlan: over.hostSpacePlan,
    now: over.now ?? NOW,
  }
}

describe('eventCrmLocksAt', () => {
  it('uses the anchor ends_at when present', () => {
    expect(eventCrmLocksAt({ startsAt: '2026-07-25T18:00:00.000Z', endsAt: '2026-07-25T21:00:00.000Z' })).toBe(
      '2026-07-25T21:00:00.000Z',
    )
  })

  it('falls back to starts_at plus a day when ends_at is null', () => {
    expect(eventCrmLocksAt({ startsAt: '2026-07-25T18:00:00.000Z', endsAt: null })).toBe(
      '2026-07-26T18:00:00.000Z',
    )
  })

  it('never locks when the event has no usable dates', () => {
    expect(eventCrmLocksAt({ startsAt: null, endsAt: null })).toBeNull()
    expect(eventCrmLocksAt({ startsAt: 'garbage', endsAt: 'garbage' })).toBeNull()
  })
})

describe('resolveEventCrmAccess: tiers', () => {
  it('staff gets full access always, even after the event ends', () => {
    const access = resolveEventCrmAccess(input({ caps: { staff: true, hostSpaceSteward: false } }))
    expect(access.tier).toBe('staff')
    expect(access.canMessage).toBe(true)
    expect(access.canReinvite).toBe(true)
    expect(access.locked).toBe(false)
    expect(access.locksAt).toBeNull()
  })

  it('a host-Space steward is business tier: the list is a marketing base, never locks', () => {
    const access = resolveEventCrmAccess(
      input({
        event: { id: 'event-1', hostSpaceId: 'space-1', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-01T02:00:00.000Z' },
        caps: { staff: false, hostSpaceSteward: true },
      }),
    )
    expect(access.tier).toBe('business')
    expect(access.canMessage).toBe(true)
    expect(access.locked).toBe(false)
    expect(access.locksAt).toBeNull()
  })

  it('staff wins over business when both facts hold', () => {
    expect(resolveEventCrmAccess(input({ caps: { staff: true, hostSpaceSteward: true } })).tier).toBe('staff')
  })

  it('a personal host or cohost with no business Space behind them is personal tier', () => {
    expect(resolveEventCrmAccess(input()).tier).toBe('personal')
  })

  it('the host Space plan never changes the tier (the split is account type, not plan)', () => {
    const free = resolveEventCrmAccess(input({ hostSpacePlan: 'free' }))
    const paid = resolveEventCrmAccess(input({ hostSpacePlan: 'business' }))
    expect(free.tier).toBe('personal')
    expect(paid.tier).toBe('personal')
  })
})

describe('resolveEventCrmAccess: the personal-tier lock boundary', () => {
  const event = {
    id: 'event-1',
    hostSpaceId: null,
    startsAt: '2026-07-26T10:00:00.000Z',
    endsAt: '2026-07-26T14:00:00.000Z',
  }

  it('BEFORE the event: full contact management', () => {
    const access = resolveEventCrmAccess(input({ event, now: new Date('2026-07-20T00:00:00.000Z') }))
    expect(access.canMessage).toBe(true)
    expect(access.canReinvite).toBe(true)
    expect(access.locked).toBe(false)
    expect(access.locksAt).toBe('2026-07-26T14:00:00.000Z')
  })

  it('DURING the event: still full contact management', () => {
    const access = resolveEventCrmAccess(input({ event, now: new Date('2026-07-26T12:00:00.000Z') }))
    expect(access.canMessage).toBe(true)
    expect(access.locked).toBe(false)
  })

  it('one millisecond before ends_at is still open; the ends_at instant locks', () => {
    const before = resolveEventCrmAccess(input({ event, now: new Date('2026-07-26T13:59:59.999Z') }))
    const atEnd = resolveEventCrmAccess(input({ event, now: new Date('2026-07-26T14:00:00.000Z') }))
    expect(before.locked).toBe(false)
    expect(atEnd.locked).toBe(true)
  })

  it('AFTER the event: list stays visible, messaging locks, re-invite survives', () => {
    const access = resolveEventCrmAccess(input({ event, now: new Date('2026-08-01T00:00:00.000Z') }))
    expect(access.canViewRoster).toBe(true)
    expect(access.canViewMetrics).toBe(true)
    expect(access.canMessage).toBe(false)
    expect(access.canReinvite).toBe(true)
    expect(access.locked).toBe(true)
  })

  it('with a null ends_at the lock lands a day after starts_at', () => {
    const openEvent = { ...event, endsAt: null }
    const during = resolveEventCrmAccess(input({ event: openEvent, now: new Date('2026-07-27T09:59:00.000Z') }))
    const after = resolveEventCrmAccess(input({ event: openEvent, now: new Date('2026-07-27T10:00:00.000Z') }))
    expect(during.locked).toBe(false)
    expect(after.locked).toBe(true)
    expect(after.locksAt).toBe('2026-07-27T10:00:00.000Z')
  })

  it('an event with no dates never locks (fail-open on a data gap, not authorization)', () => {
    const access = resolveEventCrmAccess(
      input({ event: { id: 'e', hostSpaceId: null, startsAt: null, endsAt: null }, now: new Date('2099-01-01T00:00:00.000Z') }),
    )
    expect(access.canMessage).toBe(true)
    expect(access.locked).toBe(false)
    expect(access.locksAt).toBeNull()
  })

  it('the same instant is open for business tier while locked for personal tier', () => {
    const now = new Date('2026-08-01T00:00:00.000Z')
    const personal = resolveEventCrmAccess(input({ event, now }))
    const business = resolveEventCrmAccess(input({ event, now, caps: { staff: false, hostSpaceSteward: true } }))
    expect(personal.canMessage).toBe(false)
    expect(business.canMessage).toBe(true)
  })
})

describe('the locked copy', () => {
  it('is one plain refusal ending on the upsell line, with no em dashes', () => {
    const message = eventCrmLockedError()
    expect(message).toBe(`${EVENT_CRM_LOCKED_MESSAGE} ${EVENT_CRM_UPSELL_LINE}`)
    expect(message.includes('—')).toBe(false)
    expect(EVENT_CRM_UPSELL_LINE).toBe('Message this list any time with a Business Space.')
  })
})
