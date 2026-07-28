import { describe, it, expect } from 'vitest'

import {
  associatedSpaceId,
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

describe('associatedSpaceId', () => {
  it('is the placement Space when the event carries one', () => {
    expect(associatedSpaceId({ spaceId: SPACE }, ROOT_SPACE)).toBe(SPACE)
  })

  it('prefers the explicit hosting Space (ADR-819) over the placement column', () => {
    expect(associatedSpaceId({ spaceId: SPACE, hostSpaceId: 'other-space' }, ROOT_SPACE)).toBe('other-space')
  })

  it('drops the ROOT Space, which every event inherits and which names nothing', () => {
    expect(associatedSpaceId({ spaceId: ROOT_SPACE }, ROOT_SPACE)).toBeNull()
    expect(associatedSpaceId({ spaceId: SPACE, hostSpaceId: ROOT_SPACE }, ROOT_SPACE)).toBeNull()
  })

  it('is null with no Space at all, and survives an unresolvable root', () => {
    expect(associatedSpaceId({ spaceId: null }, ROOT_SPACE)).toBeNull()
    expect(associatedSpaceId({ spaceId: SPACE }, null)).toBe(SPACE)
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
