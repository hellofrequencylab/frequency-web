import { describe, it, expect, beforeEach, vi } from 'vitest'

// BLOCK DATA SOURCE REGISTRY (rail editor foundation). What is locked here, all network-free (every
// underlying reader + the Space store are mocked):
//   1. CAPABILITY (item 6): `exists` + `spaceEnabledFunctions` read the Space's entitlements switch
//      through the PURE resolver — a function turned OFF (entitlements[fn] === false) is not enabled and
//      its block does not "exist"; default-ON when the key is absent.
//   2. ROWS gate: a function-backed block whose switch is ON but which has NO rows does not "exist"
//      (item 6 hides an empty section); one WITH rows does.
//   3. LIST (items 5 + 7): each block maps its function's live items to `{ id, label }` for the picker
//      + pre-population, delegating to the SAME reader the profile render uses.
//   4. FAIL-SAFE: a reader that throws yields [] (list) / false (exists), never an escape.
//   5. createHref: reuses the admin-route map (a real route, never null for a function-backed block).

// ── Mocks: the Space store + every reader the registry delegates to ─────────────────────────────────

// The Space row the capability + offerings reads run off. `entitlements` drives the switch; `preferences`
// carries the offerings blob; `slug` is unused by the readers here.
let resolvedSpace: {
  id: string
  slug: string
  entitlements: unknown
  preferences: unknown
} | null = {
  id: 'space-1',
  slug: 'river-aid',
  entitlements: {},
  preferences: {},
}
let getSpaceThrows = false
vi.mock('@/lib/spaces/store', () => ({
  getSpaceById: vi.fn(async () => {
    if (getSpaceThrows) throw new Error('boom')
    return resolvedSpace
  }),
}))

// The content-data readers (events/team/reviews/faq/updates/practices/circles).
let events: Array<{ id: string; slug: string; title: string; startsAt: string }> = []
let team: Array<{ profileId: string; name: string; handle: string | null; avatarUrl: string | null; role: string }> = []
let reviews: { average: number | null; count: number; latest: Array<{ id: string; rating: number; body: string; createdAt: string; author: { displayName: string; avatarUrl: string | null } | null }> } = {
  average: null,
  count: 0,
  latest: [],
}
let faqs: Array<{ id: string; question: string; answer: string }> = []
let updates: Array<{ id: string; title: string; body: string; imageUrl: string | null; publishedAt: string | null; postId: string | null }> = []
let practices: { practices: Array<{ kind: 'practice'; id: string; slug: string; title: string; summary: string | null; emoji: string | null; adoptCount: number }>; journeys: Array<{ kind: 'journey'; id: string; slug: string; title: string; summary: string | null; emoji: string | null; adoptCount: number }> } = {
  practices: [],
  journeys: [],
}
let community: Array<{ id: string; slug: string; name: string; about: string | null; memberCount: number }> = []
let eventsThrows = false
vi.mock('@/lib/spaces/content-data', () => ({
  getSpaceUpcomingEvents: vi.fn(async () => {
    if (eventsThrows) throw new Error('boom')
    return events
  }),
  getSpaceTeam: vi.fn(async () => team),
  getSpaceReviews: vi.fn(async () => reviews),
  getSpaceFaqs: vi.fn(async () => faqs),
  getSpaceUpdates: vi.fn(async () => updates),
  getSpacePractices: vi.fn(async () => practices),
  getSpaceCommunity: vi.fn(async () => community),
}))

let membershipTiers: Array<{ id?: string; name: string }> = []
vi.mock('@/lib/spaces/memberships', () => ({
  listMembershipTiers: vi.fn(async () => membershipTiers),
}))

let ticketTiers: Array<{ id?: string; name: string }> = []
vi.mock('@/lib/spaces/tickets', () => ({
  listTicketTiers: vi.fn(async () => ticketTiers),
}))

let donationAsk: { id?: string; fundLabel: string } | null = null
vi.mock('@/lib/spaces/donations', () => ({
  getDonationAsk: vi.fn(async () => donationAsk),
}))

let program: { id?: string; name: string } | null = null
vi.mock('@/lib/spaces/enroll', () => ({
  getSpaceProgram: vi.fn(async () => program),
}))

// Keep the PURE modules real (functions resolver, entitlements, profile-data, surface-hrefs): they are
// the logic under test's fail-safe contract. `server-only` is stubbed so the module imports under vitest.
vi.mock('server-only', () => ({}))

import {
  blockExists,
  blockDataList,
  blockCreateHref,
  blockDataSource,
  isFunctionBackedBlock,
  spaceEnabledFunctions,
  FUNCTION_BACKED_BLOCK_TYPES,
} from './block-data-sources'

beforeEach(() => {
  resolvedSpace = { id: 'space-1', slug: 'river-aid', entitlements: {}, preferences: {} }
  getSpaceThrows = false
  eventsThrows = false
  events = []
  team = []
  reviews = { average: null, count: 0, latest: [] }
  faqs = []
  updates = []
  practices = { practices: [], journeys: [] }
  community = []
  membershipTiers = []
  ticketTiers = []
  donationAsk = null
  program = null
})

// ── Registry surface ────────────────────────────────────────────────────────────────────────────────

describe('registry surface', () => {
  it('exposes the function-backed block types and nothing authored', () => {
    expect(FUNCTION_BACKED_BLOCK_TYPES).toContain('offerings')
    expect(FUNCTION_BACKED_BLOCK_TYPES).toContain('events')
    expect(FUNCTION_BACKED_BLOCK_TYPES).toContain('team')
    expect(FUNCTION_BACKED_BLOCK_TYPES).toContain('memberships')
    // Authored / design blocks are NOT function-backed.
    expect(FUNCTION_BACKED_BLOCK_TYPES).not.toContain('heading')
    expect(FUNCTION_BACKED_BLOCK_TYPES).not.toContain('photoHero')
  })

  it('isFunctionBackedBlock + blockDataSource agree', () => {
    expect(isFunctionBackedBlock('offerings')).toBe(true)
    expect(isFunctionBackedBlock('heading')).toBe(false)
    expect(blockDataSource('offerings')).not.toBeNull()
    expect(blockDataSource('heading')).toBeNull()
  })

  it('a non-function-backed block is always "exists", never lists, has no createHref', async () => {
    expect(await blockExists('heading', 'space-1')).toBe(true)
    expect(await blockDataList('heading', 'space-1')).toEqual([])
    expect(blockCreateHref('heading', 'river-aid')).toBeNull()
  })
})

// ── Capability (item 6): the entitlements switch ─────────────────────────────────────────────────────

describe('spaceEnabledFunctions', () => {
  it('every function is default-ON when entitlements is empty', async () => {
    const set = await spaceEnabledFunctions('space-1')
    expect(set.has('members')).toBe(true)
    expect(set.has('memberships')).toBe(true)
    expect(set.has('tickets')).toBe(true)
  })

  it('a function explicitly turned OFF drops out of the set', async () => {
    resolvedSpace = { id: 'space-1', slug: 'river-aid', entitlements: { members: false }, preferences: {} }
    const set = await spaceEnabledFunctions('space-1')
    expect(set.has('members')).toBe(false)
    // Other functions stay ON.
    expect(set.has('memberships')).toBe(true)
  })

  it('a missing Space stays permissive (default-ON for every function)', async () => {
    resolvedSpace = null
    const set = await spaceEnabledFunctions('space-1')
    expect(set.has('members')).toBe(true)
    expect(set.has('tickets')).toBe(true)
  })

  it('a store throw stays permissive (fail-safe)', async () => {
    getSpaceThrows = true
    const set = await spaceEnabledFunctions('space-1')
    expect(set.has('members')).toBe(true)
  })
})

// ── exists: switch AND rows ──────────────────────────────────────────────────────────────────────────

describe('blockExists', () => {
  it('a function-keyed block is false when its switch is OFF, even with rows', async () => {
    resolvedSpace = { id: 'space-1', slug: 'river-aid', entitlements: { members: false }, preferences: {} }
    team = [{ profileId: 'p1', name: 'Ada', handle: 'ada', avatarUrl: null, role: 'admin' }]
    expect(await blockExists('team', 'space-1')).toBe(false)
  })

  it('a function-keyed block is false when the switch is ON but there are no rows', async () => {
    team = []
    expect(await blockExists('team', 'space-1')).toBe(false)
  })

  it('a function-keyed block is true when the switch is ON and there are rows', async () => {
    team = [{ profileId: 'p1', name: 'Ada', handle: 'ada', avatarUrl: null, role: 'admin' }]
    expect(await blockExists('team', 'space-1')).toBe(true)
  })

  it('a no-function block (events) gates on rows alone', async () => {
    expect(await blockExists('events', 'space-1')).toBe(false)
    events = [{ id: 'e1', slug: 'summer', title: 'Summer meetup', startsAt: '2026-08-01T00:00:00Z' }]
    expect(await blockExists('events', 'space-1')).toBe(true)
  })

  it('is false (fail-safe) when a reader throws', async () => {
    eventsThrows = true
    expect(await blockExists('events', 'space-1')).toBe(false)
  })
})

// ── list (items 5 + 7): { id, label } mapping ────────────────────────────────────────────────────────

describe('blockDataList', () => {
  it('offerings: listed services from the preferences blob → { id: title, label: title }', async () => {
    resolvedSpace = {
      id: 'space-1',
      slug: 'river-aid',
      entitlements: {},
      preferences: {
        profileData: {
          offerings: [
            { title: 'Deep Tissue', visibility: 'listed' },
            { title: 'Hidden', visibility: 'private' },
            { title: '' }, // dropped (no title)
          ],
        },
      },
    }
    const items = await blockDataList('offerings', 'space-1')
    expect(items).toEqual([{ id: 'Deep Tissue', label: 'Deep Tissue' }])
  })

  it('events: maps to { id, label, href } with the event route', async () => {
    events = [{ id: 'e1', slug: 'summer', title: 'Summer meetup', startsAt: '2026-08-01T00:00:00Z' }]
    const items = await blockDataList('events', 'space-1')
    expect(items).toEqual([{ id: 'e1', label: 'Summer meetup', href: '/events/summer' }])
  })

  it('team: maps to { id, label, href } and omits href when no handle', async () => {
    team = [
      { profileId: 'p1', name: 'Ada', handle: 'ada', avatarUrl: null, role: 'admin' },
      { profileId: 'p2', name: 'Bo', handle: null, avatarUrl: null, role: 'editor' },
    ]
    const items = await blockDataList('team', 'space-1')
    expect(items).toEqual([
      { id: 'p1', label: 'Ada', href: '/people/ada' },
      { id: 'p2', label: 'Bo', href: undefined },
    ])
  })

  it('memberships: only saved tiers (with an id) list', async () => {
    membershipTiers = [
      { id: 't1', name: 'Supporter' },
      { name: 'Draft (no id)' },
    ]
    const items = await blockDataList('memberships', 'space-1')
    expect(items).toEqual([{ id: 't1', label: 'Supporter' }])
  })

  it('tickets: only saved tiers list', async () => {
    ticketTiers = [{ id: 'k1', name: 'General' }]
    const items = await blockDataList('tickets', 'space-1')
    expect(items).toEqual([{ id: 'k1', label: 'General' }])
  })

  it('donations: the single active ask as a one-row list, or empty', async () => {
    expect(await blockDataList('donations', 'space-1')).toEqual([])
    donationAsk = { id: 'd1', fundLabel: 'Flood relief' }
    expect(await blockDataList('donations', 'space-1')).toEqual([{ id: 'd1', label: 'Flood relief' }])
  })

  it('enroll: the single published program as a one-row list, or empty', async () => {
    expect(await blockDataList('enroll', 'space-1')).toEqual([])
    program = { id: 'pr1', name: 'Spring cohort' }
    expect(await blockDataList('enroll', 'space-1')).toEqual([{ id: 'pr1', label: 'Spring cohort' }])
  })

  it('reviews: labels carry author + rating', async () => {
    reviews = {
      average: 5,
      count: 1,
      latest: [{ id: 'r1', rating: 5, body: 'Great', createdAt: '2026-01-01', author: { displayName: 'Ada', avatarUrl: null } }],
    }
    const items = await blockDataList('reviews', 'space-1')
    expect(items).toEqual([{ id: 'r1', label: 'Ada (5/5)' }])
  })

  it('practices + journeys interleave with their routes', async () => {
    practices = {
      practices: [{ kind: 'practice', id: 'p1', slug: 'breathe', title: 'Breathe', summary: null, emoji: null, adoptCount: 0 }],
      journeys: [{ kind: 'journey', id: 'j1', slug: 'reset', title: 'Reset', summary: null, emoji: null, adoptCount: 3 }],
    }
    expect(await blockDataList('practices', 'space-1')).toEqual([
      { id: 'p1', label: 'Breathe', href: '/practices/breathe' },
      { id: 'j1', label: 'Reset', href: '/journeys/reset' },
    ])
    expect(await blockDataList('journeys', 'space-1')).toEqual([
      { id: 'j1', label: 'Reset', href: '/journeys/reset' },
    ])
  })

  it('circles: maps to { id, label, href }', async () => {
    community = [{ id: 'c1', slug: 'welcome', name: 'Welcome', about: null, memberCount: 4 }]
    expect(await blockDataList('circles', 'space-1')).toEqual([
      { id: 'c1', label: 'Welcome', href: '/circles/welcome' },
    ])
  })

  it('is [] (fail-safe) when the offerings space read throws', async () => {
    getSpaceThrows = true
    expect(await blockDataList('offerings', 'space-1')).toEqual([])
  })
})

// ── createHref (item 5): a real admin route from the ONE map ──────────────────────────────────────────

describe('blockCreateHref', () => {
  it('offerings → the Store editor route', () => {
    expect(blockCreateHref('offerings', 'river-aid')).toBe('/spaces/river-aid/settings/services')
  })

  it('team → the Members surface', () => {
    expect(blockCreateHref('team', 'river-aid')).toBe('/spaces/river-aid/settings/members')
  })

  it('memberships → the Offerings surface anchored to memberships', () => {
    expect(blockCreateHref('memberships', 'river-aid')).toBe('/spaces/river-aid/settings/offerings#memberships')
  })

  it('is never null for a function-backed block', () => {
    for (const block of FUNCTION_BACKED_BLOCK_TYPES) {
      expect(blockCreateHref(block, 'river-aid')).toBeTruthy()
    }
  })
})
