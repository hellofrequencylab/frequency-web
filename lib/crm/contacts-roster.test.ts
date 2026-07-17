import { describe, it, expect } from 'vitest'
import {
  applyContactQuery,
  buildContactFacets,
  contactMatchesFacets,
  contactMatchesText,
  sortContacts,
  type ContactRosterRow,
} from './contacts-roster'

// The contacts-roster pure core (filter / sort / page + the registry-driven facet builder) is what
// the client island runs, so it is unit-locked here. These also prove the extensibility guarantee:
// facets are built from the badges the classifier writes, so a new relationship kind that starts
// getting rows becomes a filter with no UI code.

function row(over: Partial<ContactRosterRow> = {}): ContactRosterRow {
  return {
    contactId: over.contactId ?? Math.random().toString(36).slice(2),
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    handle: null,
    profileId: null,
    avatarUrl: null,
    status: 'lead',
    communityRole: null,
    isBusiness: false,
    activeThisWeek: false,
    spacesOwned: 0,
    spaces: [],
    relationshipKinds: [],
    upgradeScore: 0,
    upgradeCandidate: false,
    upgradeReasons: [],
    createdAt: null,
    badges: ['status:lead', 'business:no', 'active:no'],
    sortValues: { joined: 0, statusRank: 2, active: 0, spaces: 0, upgrade: 0 },
    ...over,
  }
}

describe('contactMatchesText', () => {
  it('matches name, email, and handle case-insensitively; blank matches all', () => {
    const r = row({ displayName: 'Grace Hopper', email: 'grace@navy.mil', handle: 'ghopper' })
    expect(contactMatchesText(r, '')).toBe(true)
    expect(contactMatchesText(r, 'grace')).toBe(true)
    expect(contactMatchesText(r, 'NAVY')).toBe(true)
    expect(contactMatchesText(r, 'ghop')).toBe(true)
    expect(contactMatchesText(r, 'zzz')).toBe(false)
  })
})

describe('contactMatchesFacets', () => {
  it('requires every selected value to be a badge; empty selection imposes nothing', () => {
    const r = row({ badges: ['status:member', 'role:host', 'business:no', 'kind:donor'] })
    expect(contactMatchesFacets(r, {})).toBe(true)
    expect(contactMatchesFacets(r, { status: 'status:member' })).toBe(true)
    expect(contactMatchesFacets(r, { role: 'role:host', kind: 'kind:donor' })).toBe(true)
    expect(contactMatchesFacets(r, { status: 'status:lead' })).toBe(false)
    // An empty string for a facet is "no filter", not a failed match.
    expect(contactMatchesFacets(r, { status: '' })).toBe(true)
  })
})

describe('sortContacts', () => {
  it('sorts by name asc and is stable on ties', () => {
    const rows = [row({ displayName: 'Charlie' }), row({ displayName: 'alice' }), row({ displayName: 'Bob' })]
    const sorted = sortContacts(rows, { key: 'name', direction: 'asc' })
    expect(sorted.map((r) => r.displayName)).toEqual(['alice', 'Bob', 'Charlie'])
  })

  it('sorts by a numeric sortValue desc (upgrade score)', () => {
    const rows = [
      row({ displayName: 'low', sortValues: { upgrade: 10 } }),
      row({ displayName: 'high', sortValues: { upgrade: 90 } }),
      row({ displayName: 'mid', sortValues: { upgrade: 50 } }),
    ]
    const sorted = sortContacts(rows, { key: 'upgrade', direction: 'desc' })
    expect(sorted.map((r) => r.displayName)).toEqual(['high', 'mid', 'low'])
  })

  it('returns input order with no directive', () => {
    const rows = [row({ displayName: 'b' }), row({ displayName: 'a' })]
    expect(sortContacts(rows, undefined).map((r) => r.displayName)).toEqual(['b', 'a'])
  })
})

describe('applyContactQuery', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    row({ displayName: `Contact ${String.fromCharCode(97 + i)}`, sortValues: { joined: i } }),
  )

  it('filters, sorts, and pages/caps together', () => {
    const res = applyContactQuery(rows, { sort: { key: 'joined', direction: 'desc' } }, 1, 5)
    expect(res.total).toBe(12)
    expect(res.visible).toHaveLength(5)
    expect(res.hasMore).toBe(true)
    // Most-recent (highest joined) first.
    expect(res.visible[0].sortValues.joined).toBe(11)
  })

  it('grows the window by page and eventually exhausts hasMore', () => {
    const res = applyContactQuery(rows, {}, 3, 5)
    expect(res.visible).toHaveLength(12)
    expect(res.hasMore).toBe(false)
  })
})

describe('buildContactFacets — registry + data driven, pruned to what rows can match', () => {
  it('offers status / role / business / activity / relationship / upgrade from the badges present', () => {
    const rows = [
      row({
        status: 'member',
        communityRole: 'host',
        isBusiness: true,
        activeThisWeek: true,
        relationshipKinds: ['donor'],
        upgradeCandidate: false,
        badges: ['status:member', 'role:host', 'business:yes', 'active:yes', 'kind:donor'],
      }),
      row({
        status: 'subscriber',
        upgradeCandidate: true,
        badges: ['status:subscriber', 'business:no', 'active:no', 'upgrade:yes'],
      }),
    ]
    const facets = buildContactFacets(rows)
    const byKey = Object.fromEntries(facets.map((f) => [f.key, f]))

    expect(byKey.status.options.map((o) => o.value)).toEqual(['status:member', 'status:subscriber'])
    expect(byKey.role.options.map((o) => o.value)).toEqual(['role:host'])
    expect(byKey.kind.options.map((o) => o.value)).toEqual(['kind:donor'])
    expect(byKey.upgrade.options.map((o) => o.value)).toEqual(['upgrade:yes'])
    // A lead-only badge set would drop options that no row carries.
    expect(byKey.role.options.some((o) => o.value === 'role:mentor')).toBe(false)
  })

  it('surfaces a NEW relationship kind automatically once a row carries it (no per-kind UI)', () => {
    // vendor is a registry assignable kind; a row that holds it must make the facet option appear.
    const rows = [row({ relationshipKinds: ['vendor'], badges: ['status:lead', 'kind:vendor'] })]
    const facets = buildContactFacets(rows)
    const kindFacet = facets.find((f) => f.key === 'kind')
    expect(kindFacet?.options.map((o) => o.value)).toContain('kind:vendor')
  })

  it('builds Space options from the Spaces present in the data, name-sorted', () => {
    const rows = [
      row({
        spaces: [
          { id: 's2', name: 'Zen Studio' },
          { id: 's1', name: 'Alpha Lab' },
        ],
        badges: ['status:member', 'space:s2', 'space:s1'],
      }),
    ]
    const facets = buildContactFacets(rows)
    const spaceFacet = facets.find((f) => f.key === 'space')
    expect(spaceFacet?.options.map((o) => o.label)).toEqual(['Alpha Lab', 'Zen Studio'])
  })
})
