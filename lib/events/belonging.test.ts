import { describe, it, expect } from 'vitest'

import {
  hostingSpaceId,
  venueSpaceId,
  circleScopeId,
  isCircleScope,
  journeyIsLinkable,
  resolveEventBelonging,
} from './belonging'

// "Where does this Event belong" — the tie the detail page renders.
//
// The trap these lock in is the one that shipped live on the edit page (ADR-883): `events.scope_id`
// is NOT an entity id unless `scope_type` says Circle. A 'public' event's scope_id is a shared
// SENTINEL region uuid (41 rows carry the same one), and the single legacy 'standalone' row's
// scope_id is a PROFILE id. Resolving either as a Circle produces a link to nothing and a label
// that lies about where the Event lives.

const CIRCLE = 'cccccccc-0000-4000-a000-00000000000c'
const SENTINEL_REGION = 'rrrrrrrr-0000-4000-a000-00000000000r'
const PROFILE = 'pppppppp-0000-4000-a000-00000000000p'
const SPACE = 'aaaaaaaa-0000-4000-a000-00000000000a'
const ROOT_SPACE = '00000000-0000-4000-a000-000000000000'

describe('circleScopeId', () => {
  it("names the Circle for a circle-scoped Event", () => {
    expect(circleScopeId({ scopeType: 'circle', scopeId: CIRCLE })).toBe(CIRCLE)
  })

  it("accepts the pre-rename 'group' scope value still present in older rows", () => {
    expect(circleScopeId({ scopeType: 'group', scopeId: CIRCLE })).toBe(CIRCLE)
    expect(isCircleScope('group')).toBe(true)
  })

  it("NEVER resolves a public event's sentinel region as a Circle", () => {
    expect(circleScopeId({ scopeType: 'public', scopeId: SENTINEL_REGION })).toBeNull()
    expect(isCircleScope('public')).toBe(false)
  })

  it("NEVER resolves the legacy 'standalone' row's profile id as a Circle", () => {
    expect(circleScopeId({ scopeType: 'standalone', scopeId: PROFILE })).toBeNull()
    expect(isCircleScope('standalone')).toBe(false)
  })

  it('is null for an unknown scope value, a missing scope, and a blank id (fail closed)', () => {
    expect(circleScopeId({ scopeType: 'region', scopeId: SENTINEL_REGION })).toBeNull()
    expect(circleScopeId({ scopeType: null, scopeId: CIRCLE })).toBeNull()
    expect(circleScopeId({ scopeType: 'circle', scopeId: '   ' })).toBeNull()
    expect(circleScopeId({ scopeType: 'circle', scopeId: null })).toBeNull()
  })
})

describe('hostingSpaceId (the billed, displayed host)', () => {
  it('is the placement Space when the event carries one and no explicit host', () => {
    // ⚠️ The PRE-ADR-819 fallback, and it must stay: a legacy event created inside a Space's
    // calendar carries only space_id, and its tickets already pay that Space's owner. Dropping this
    // would silently re-route money on every legacy row.
    expect(hostingSpaceId({ spaceId: SPACE }, ROOT_SPACE)).toBe(SPACE)
  })

  it('prefers the explicit hosting Space (ADR-819) over the placement column', () => {
    expect(hostingSpaceId({ spaceId: SPACE, hostSpaceId: 'other-space' }, ROOT_SPACE)).toBe('other-space')
  })

  it('drops the ROOT Space, which every event inherits and which names nothing', () => {
    expect(hostingSpaceId({ spaceId: ROOT_SPACE }, ROOT_SPACE)).toBeNull()
    expect(hostingSpaceId({ spaceId: SPACE, hostSpaceId: ROOT_SPACE }, ROOT_SPACE)).toBeNull()
  })

  it('is null with no Space at all, and survives an unresolvable root', () => {
    expect(hostingSpaceId({ spaceId: null }, ROOT_SPACE)).toBeNull()
    expect(hostingSpaceId({ spaceId: SPACE }, null)).toBe(SPACE)
  })
})

describe('venueSpaceId (where it lives, when that is not the host)', () => {
  it('names the venue when a DIFFERENT Space hosts', () => {
    // 🔴 The case that could not be expressed before: Royal Temple is the venue, Audrey DeWitt
    // hosts. The read path collapsed to `hostSpaceId ?? spaceId` and the write path forced the two
    // columns equal, so naming the host moved the event out of the venue.
    expect(venueSpaceId({ spaceId: SPACE, hostSpaceId: 'other-space' }, ROOT_SPACE)).toBe(SPACE)
  })

  it('is null when the venue IS the host, so the same Space is never named twice', () => {
    // Structural, not conditional: every event where the axes agree has exactly one Space to name,
    // and the host line names it. A caller cannot forget to dedupe.
    expect(venueSpaceId({ spaceId: SPACE, hostSpaceId: SPACE }, ROOT_SPACE)).toBeNull()
    // Same conclusion via the legacy fallback, where host resolves THROUGH space_id.
    expect(venueSpaceId({ spaceId: SPACE }, ROOT_SPACE)).toBeNull()
  })

  it('drops the root Space and a missing placement', () => {
    expect(venueSpaceId({ spaceId: ROOT_SPACE, hostSpaceId: 'other-space' }, ROOT_SPACE)).toBeNull()
    expect(venueSpaceId({ spaceId: null, hostSpaceId: 'other-space' }, ROOT_SPACE)).toBeNull()
  })

  it('the two resolvers never return the same id', () => {
    // The invariant the whole split rests on. If both ever name one Space, the page prints it twice.
    for (const row of [
      { spaceId: SPACE, hostSpaceId: 'other-space' },
      { spaceId: SPACE, hostSpaceId: SPACE },
      { spaceId: SPACE },
      { spaceId: ROOT_SPACE, hostSpaceId: SPACE },
      { spaceId: null, hostSpaceId: SPACE },
    ]) {
      const host = hostingSpaceId(row, ROOT_SPACE)
      const venue = venueSpaceId(row, ROOT_SPACE)
      if (host && venue) expect(host).not.toBe(venue)
    }
  })
})

describe('journeyIsLinkable', () => {
  it('links a public Journey for everyone', () => {
    expect(journeyIsLinkable('public', false)).toBe(true)
  })

  it('hides an unlisted or private Journey from a member', () => {
    expect(journeyIsLinkable('unlisted', false)).toBe(false)
    expect(journeyIsLinkable('private', false)).toBe(false)
    expect(journeyIsLinkable(null, false)).toBe(false)
  })

  it('shows either to someone who manages the Event', () => {
    expect(journeyIsLinkable('unlisted', true)).toBe(true)
    expect(journeyIsLinkable('private', true)).toBe(true)
  })
})

describe('resolveEventBelonging', () => {
  const full = {
    circle: { name: 'Sunrise Collective', slug: 'sunrise-collective' },
    space: { name: 'Royal Temple', slug: 'royal-temple' },
    journey: { title: 'Shine Season', slug: 'shine-season', visibility: 'public' },
  }

  it('renders Circle, then Space, then Journey', () => {
    expect(resolveEventBelonging(full)).toEqual([
      { kind: 'circle', label: 'Circle', name: 'Sunrise Collective', href: '/circles/sunrise-collective' },
      { kind: 'space', label: 'Space', name: 'Royal Temple', href: '/spaces/royal-temple' },
      { kind: 'journey', label: 'Journey', name: 'Shine Season', href: '/journeys/shine-season' },
    ])
  })

  it('is empty for a standalone public Event, so the strip renders nothing', () => {
    expect(resolveEventBelonging({ circle: null, space: null, journey: null })).toEqual([])
  })

  it('drops a ref with no slug: there is nowhere to navigate to', () => {
    const links = resolveEventBelonging({
      circle: { name: 'Sunrise Collective', slug: null },
      space: { name: 'Royal Temple', slug: '  ' },
      journey: null,
    })
    expect(links).toEqual([])
  })

  it('falls back to the proper noun when an entity has a slug but no name', () => {
    const links = resolveEventBelonging({
      circle: { name: null, slug: 'sunrise-collective' },
      space: null,
      journey: null,
    })
    expect(links[0].name).toBe('Circle')
    expect(links[0].href).toBe('/circles/sunrise-collective')
  })

  it('omits a non-public Journey for a member and keeps it for a manager', () => {
    const unlisted = { ...full, journey: { title: 'Shine Season', slug: 'shine-season', visibility: 'unlisted' } }
    expect(resolveEventBelonging(unlisted).map((l) => l.kind)).toEqual(['circle', 'space'])
    expect(resolveEventBelonging(unlisted, { viewerCanManage: true }).map((l) => l.kind)).toEqual([
      'circle',
      'space',
      'journey',
    ])
  })

  it('handles a Journey-only tie (no Circle, no Space)', () => {
    expect(resolveEventBelonging({ circle: null, space: null, journey: full.journey })).toEqual([
      { kind: 'journey', label: 'Journey', name: 'Shine Season', href: '/journeys/shine-season' },
    ])
  })

  it('never builds a link out of a raw scope id', () => {
    // The guard that matters: the page must resolve a NAME + SLUG first. A sentinel or profile
    // uuid can only reach this function as a null ref, which produces nothing.
    const links = resolveEventBelonging({
      circle: circleScopeId({ scopeType: 'public', scopeId: SENTINEL_REGION })
        ? { name: 'nope', slug: SENTINEL_REGION }
        : null,
      space: null,
      journey: null,
    })
    expect(links).toEqual([])
  })
})
