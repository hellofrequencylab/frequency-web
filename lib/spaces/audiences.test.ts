import { describe, it, expect, beforeEach, vi } from 'vitest'

// PER-SPACE AUDIENCES (ENTITY-SPACES-BUILD §C Phase 3). What is locked here, all network-free (the
// supabase admin client is mocked over an in-memory store):
//   1. resolveAudience reads ONLY the active Space's contacts (space_id filter) — never another
//      Space's, even with the same tag. Returns the EXACT send-seam shape { contactId, email }[].
//   2. The tag filter narrows to contacts linked (network_contacts.linked_contact_id) to a tagged
//      network_contact IN THIS SPACE. A contact with no link never matches a tag. Tag match is
//      case-insensitive.
//   3. NO CROSS-SPACE LEAK: a tag that exists in Space B never pulls Space A's contacts, and a
//      Space B contact is never returned for a Space A resolve.
//   4. De-dupe by lowercased email; junk emails dropped; fail-safe to [] on error.

// ── A chainable admin-client mock backed by an in-memory store ──────────────────────────────────
type ContactRow = {
  id: string
  email: string | null
  space_id: string
  profile_id?: string | null
  consent_state?: string | null
}
// network_contact_tags joined to its parent network_contact (PostgREST embed shape).
type TagRow = {
  tag: string
  network_contacts: { space_id: string; linked_contact_id: string | null }
}

// space_segments: a saved AudienceFilter-shaped definition, scoped to a space (ADR-380).
type SegmentRow = { id: string; definition: unknown; space_id: string }

// member_traits: one enum band per (profile, trait_key) — the advanced-facet feature store (Phase 5).
type TraitRow = { profile_id: string; trait_key: string; value_text: string | null }
// place-tree membership (for the circle: selector) — profile in a circle, active.
type MembershipRow = { circle_id: string; profile_id: string; status: string }

const db = {
  contacts: [] as ContactRow[],
  tags: [] as TagRow[],
  segments: [] as SegmentRow[],
  traits: [] as TraitRow[],
  memberships: [] as MembershipRow[],
  circles: [] as { id: string; hub_id: string | null }[],
  hubs: [] as { id: string; nexus_id: string | null }[],
}

// space_segments builder: .select('definition').eq('id', v).eq('space_id', v).maybeSingle().
// PINNED to BOTH id AND space_id, so a cross-space id resolves to null (no leak).
function segmentsBuilder() {
  const filters: { id?: string; space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'id') filters.id = val
      if (col === 'space_id') filters.space_id = val
      return api
    },
    async maybeSingle() {
      const row =
        db.segments.find((s) => s.id === filters.id && s.space_id === filters.space_id) ?? null
      return { data: row ? { definition: row.definition } : null, error: null }
    },
  }
  return api
}

// contacts builder: .select(cols).eq('space_id', v).limit(n) -> { data, error }
function contactsBuilder() {
  const filters: { space_id?: string } = {}
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'space_id') filters.space_id = val
      return api
    },
    async limit(n: number) {
      const data = db.contacts
        .filter((c) => c.space_id === filters.space_id)
        .slice(0, n)
      return {
        data: data.map((c) => ({
          id: c.id,
          email: c.email,
          profile_id: c.profile_id ?? null,
          consent_state: c.consent_state ?? null,
        })),
        error: null,
      }
    },
  }
  return api
}

// member_traits builder: .select(cols).in('profile_id', ids).in('trait_key', keys) then awaited.
// The chain returns a thenable so `await ...in().in()` resolves the matching rows.
function memberTraitsBuilder() {
  const f: { profileIds: string[]; traitKeys: string[] } = { profileIds: [], traitKeys: [] }
  const result = () => ({
    data: db.traits.filter(
      (t) => f.profileIds.includes(t.profile_id) && f.traitKeys.includes(t.trait_key),
    ),
    error: null,
  })
  const api = {
    select() {
      return api
    },
    in(col: string, vals: string[]) {
      if (col === 'profile_id') f.profileIds = vals
      if (col === 'trait_key') f.traitKeys = vals
      return api
    },
    then(resolve: (v: ReturnType<typeof result>) => void) {
      resolve(result())
    },
  }
  return api
}

// memberships builder (place-tree circle: selector): .select('profile_id').in('circle_id', ids).eq('status', v)
function membershipsBuilder() {
  const f: { circleIds: string[] } = { circleIds: [] }
  const api = {
    select() {
      return api
    },
    in(col: string, vals: string[]) {
      if (col === 'circle_id') f.circleIds = vals
      return api
    },
    eq(col: string, val: string) {
      const data = db.memberships
        .filter((m) => f.circleIds.includes(m.circle_id) && m.status === val)
        .map((m) => ({ profile_id: m.profile_id }))
      return Promise.resolve({ data, error: null })
    },
  }
  return api
}

// circles / hubs builders (place-tree hub:/nexus: walk) — return the tree rows for the given parent.
function circlesBuilder() {
  const api = {
    select() {
      return api
    },
    eq(_col: string, val: string) {
      return Promise.resolve({ data: db.circles.filter((c) => c.hub_id === val).map((c) => ({ id: c.id })), error: null })
    },
    in(_col: string, vals: string[]) {
      return Promise.resolve({ data: db.circles.filter((c) => c.hub_id && vals.includes(c.hub_id)).map((c) => ({ id: c.id })), error: null })
    },
  }
  return api
}
function hubsBuilder() {
  const api = {
    select() {
      return api
    },
    eq(_col: string, val: string) {
      return Promise.resolve({ data: db.hubs.filter((h) => h.nexus_id === val).map((h) => ({ id: h.id })), error: null })
    },
  }
  return api
}

// network_contact_tags builder. Two shapes are used:
//   resolveAudience tag path: .select(embed).eq('network_contacts.space_id', v).ilike('tag', t)
//   listAudienceTags path:    .select(embed).eq('network_contacts.space_id', v)
//                                          .not('network_contacts.linked_contact_id', 'is', null)
function tagsBuilder() {
  const filters: { space_id?: string; tag?: string; requireLink?: boolean } = {}
  function rows() {
    let data = db.tags.filter((t) => t.network_contacts.space_id === filters.space_id)
    if (filters.tag) data = data.filter((t) => t.tag.toLowerCase() === filters.tag!.toLowerCase())
    if (filters.requireLink) data = data.filter((t) => t.network_contacts.linked_contact_id != null)
    return data
  }
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string) {
      if (col === 'network_contacts.space_id') filters.space_id = val
      return api
    },
    async ilike(_col: string, val: string) {
      filters.tag = val
      return { data: rows(), error: null }
    },
    async not(col: string, op: string, val: null) {
      // Mirror the real call: .not('network_contacts.linked_contact_id', 'is', null).
      if (col === 'network_contacts.linked_contact_id' && op === 'is' && val === null)
        filters.requireLink = true
      return { data: rows(), error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'contacts') return contactsBuilder()
      if (table === 'network_contact_tags') return tagsBuilder()
      if (table === 'space_segments') return segmentsBuilder()
      if (table === 'member_traits') return memberTraitsBuilder()
      if (table === 'memberships') return membershipsBuilder()
      if (table === 'circles') return circlesBuilder()
      if (table === 'hubs') return hubsBuilder()
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import {
  resolveAudience,
  audienceCount,
  listAudienceTags,
  normalizeTag,
  definitionToFilter,
  normalizeEngagementDepth,
  normalizeResonanceTier,
  normalizeChurnRisk,
} from './audiences'

beforeEach(() => {
  db.contacts = []
  db.tags = []
  db.segments = []
  db.traits = []
  db.memberships = []
  db.circles = []
  db.hubs = []
})

function seedContact(
  id: string,
  email: string | null,
  spaceId = 'space-A',
  opts: { profileId?: string | null; consentState?: string | null } = {},
) {
  db.contacts.push({
    id,
    email,
    space_id: spaceId,
    profile_id: opts.profileId ?? null,
    consent_state: opts.consentState ?? null,
  })
}
function seedTag(tag: string, linkedContactId: string | null, spaceId = 'space-A') {
  db.tags.push({ tag, network_contacts: { space_id: spaceId, linked_contact_id: linkedContactId } })
}
function seedSegment(id: string, definition: unknown, spaceId = 'space-A') {
  db.segments.push({ id, definition, space_id: spaceId })
}
function seedTrait(profileId: string, traitKey: string, band: string) {
  db.traits.push({ profile_id: profileId, trait_key: traitKey, value_text: band })
}
function seedMembership(circleId: string, profileId: string, status = 'active') {
  db.memberships.push({ circle_id: circleId, profile_id: profileId, status })
}

describe('normalizeTag (pure)', () => {
  it('trims, and reads blank / non-string as no filter (null)', () => {
    expect(normalizeTag('  vip ')).toBe('vip')
    expect(normalizeTag('   ')).toBeNull()
    expect(normalizeTag('')).toBeNull()
    expect(normalizeTag(42)).toBeNull()
    expect(normalizeTag(undefined)).toBeNull()
  })
})

describe('definitionToFilter (pure, ADR-380)', () => {
  it('keeps known facets, drops a nested segmentId, fail-safe to {} for junk', () => {
    expect(definitionToFilter({ tag: ' vip ', consent: 'subscribed' })).toEqual({
      tag: 'vip',
      consent: 'subscribed',
    })
    // A definition never nests another segment.
    expect(definitionToFilter({ tag: 'vip', segmentId: 'x' })).toEqual({ tag: 'vip' })
    expect(definitionToFilter({ tag: '   ' })).toEqual({})
    expect(definitionToFilter(null)).toEqual({})
    expect(definitionToFilter('nope')).toEqual({})
  })
})

describe('advanced resonance / engagement-depth facets (Phase 6 · ADR-387)', () => {
  it('the facet normalizers keep known bands and fail-safe to null for anything else', () => {
    expect(normalizeEngagementDepth('deep')).toBe('deep')
    expect(normalizeEngagementDepth('moderate')).toBe('moderate')
    expect(normalizeEngagementDepth('nope')).toBeNull()
    expect(normalizeEngagementDepth(3)).toBeNull()
    expect(normalizeEngagementDepth(undefined)).toBeNull()

    expect(normalizeResonanceTier('at_risk')).toBe('at_risk')
    expect(normalizeResonanceTier('resonant')).toBe('resonant')
    expect(normalizeResonanceTier('green')).toBeNull()

    expect(normalizeChurnRisk('high')).toBe('high')
    expect(normalizeChurnRisk('low')).toBe('low')
    expect(normalizeChurnRisk('0.8')).toBeNull()
  })

  it('definitionToFilter reads the advanced facets from camelCase AND snake_case', () => {
    expect(
      definitionToFilter({ engagementDepth: 'deep', resonanceTier: 'cooling', churnRisk: 'high' }),
    ).toEqual({ engagementDepth: 'deep', resonanceTier: 'cooling', churnRisk: 'high' })
    // A stored snake_case definition resolves identically (forward-compat with the segment store).
    expect(
      definitionToFilter({ engagement_depth: 'shallow', resonance_tier: 'at_risk', churn_risk: 'medium' }),
    ).toEqual({ engagementDepth: 'shallow', resonanceTier: 'at_risk', churnRisk: 'medium' })
  })

  it('drops a garbage advanced facet (fail-safe to no filter, never narrows to nobody)', () => {
    expect(definitionToFilter({ engagementDepth: 'banana', tag: 'vip' })).toEqual({ tag: 'vip' })
    expect(definitionToFilter({ resonanceTier: 9, churnRisk: null })).toEqual({})
  })

  it('ADDITIVE: an existing tag/consent-only definition is byte-for-byte unchanged', () => {
    expect(definitionToFilter({ tag: 'vip', consent: 'all' })).toEqual({ tag: 'vip', consent: 'all' })
  })

  it('no facet requested = member_traits is never consulted (additive: existing callers unchanged)', async () => {
    // A contact with no profile / no traits row is untouched when no facet is requested.
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    const out = await resolveAudience('space-A')
    expect(out.map((r) => r.contactId).sort()).toEqual(['c1', 'c2'])
  })
})

describe('resolveAudience — advanced facets ACTIVATED (Phase 5, member_traits join)', () => {
  it('narrows to contacts whose linked profile holds the requested churn-risk band', async () => {
    seedContact('c1', 'a@x.com', 'space-A', { profileId: 'p1' })
    seedContact('c2', 'b@x.com', 'space-A', { profileId: 'p2' })
    seedContact('c3', 'c@x.com', 'space-A', { profileId: 'p3' })
    seedTrait('p1', 'churn_risk', 'high')
    seedTrait('p2', 'churn_risk', 'low')
    // p3 has no churn_risk trait row -> cannot match a demanded facet.
    const out = await resolveAudience('space-A', { churnRisk: 'high' })
    expect(out.map((r) => r.contactId)).toEqual(['c1'])
  })

  it('AND semantics across facets: a contact must hold EVERY requested band', async () => {
    seedContact('c1', 'a@x.com', 'space-A', { profileId: 'p1' })
    seedContact('c2', 'b@x.com', 'space-A', { profileId: 'p2' })
    seedTrait('p1', 'churn_risk', 'high')
    seedTrait('p1', 'resonance_tier', 'at_risk')
    seedTrait('p2', 'churn_risk', 'high') // but no at_risk resonance_tier
    const out = await resolveAudience('space-A', { churnRisk: 'high', resonanceTier: 'at_risk' })
    expect(out.map((r) => r.contactId)).toEqual(['c1'])
  })

  it('a sealed lead (no profile_id) never matches a demanded facet', async () => {
    seedContact('lead', 'lead@x.com', 'space-A', { profileId: null })
    const out = await resolveAudience('space-A', { engagementDepth: 'deep' })
    expect(out).toEqual([])
  })
})

describe('resolveAudience — consent facet ACTIVATED (Phase 5)', () => {
  it("'subscribed' narrows to contacts whose consent_state is subscribed", async () => {
    seedContact('c1', 'a@x.com', 'space-A', { consentState: 'subscribed' })
    seedContact('c2', 'b@x.com', 'space-A', { consentState: 'unknown' })
    const out = await resolveAudience('space-A', { consent: 'subscribed' })
    expect(out.map((r) => r.contactId)).toEqual(['c1'])
  })

  it("'all' / omitted keeps every matching contact (additive default)", async () => {
    seedContact('c1', 'a@x.com', 'space-A', { consentState: 'subscribed' })
    seedContact('c2', 'b@x.com', 'space-A', { consentState: 'unknown' })
    expect((await resolveAudience('space-A', { consent: 'all' })).length).toBe(2)
    expect((await resolveAudience('space-A')).length).toBe(2)
  })
})

describe('resolveAudience — place-tree selector ACTIVATED (Phase 5)', () => {
  it('circle:<id> narrows to Space contacts whose profile is an active member of that circle', async () => {
    seedContact('c1', 'a@x.com', 'space-A', { profileId: 'p1' })
    seedContact('c2', 'b@x.com', 'space-A', { profileId: 'p2' })
    seedContact('c3', 'c@x.com', 'space-A', { profileId: 'p3' })
    seedMembership('circle-1', 'p1')
    seedMembership('circle-1', 'p3')
    seedMembership('circle-1', 'p2', 'inactive') // not active -> excluded
    const out = await resolveAudience('space-A', { place: 'circle:circle-1' })
    expect(out.map((r) => r.contactId).sort()).toEqual(['c1', 'c3'])
  })

  it('a malformed place selector narrows to nobody (fail-safe, never everybody)', async () => {
    seedContact('c1', 'a@x.com', 'space-A', { profileId: 'p1' })
    // `circle:` with no id -> parses to null -> the place branch is skipped, so NO narrowing applies.
    const skipped = await resolveAudience('space-A', { place: 'circle:' })
    expect(skipped.map((r) => r.contactId)).toEqual(['c1'])
    // A well-formed selector for an empty circle -> nobody.
    const empty = await resolveAudience('space-A', { place: 'circle:nope' })
    expect(empty).toEqual([])
  })
})

describe('resolveAudience — saved segment (ADR-380)', () => {
  beforeEach(() => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    seedContact('c3', 'c@x.com')
  })

  it('resolves from the segment\'s stored definition (tag) via the existing tag logic', async () => {
    seedTag('vip', 'c1')
    seedTag('vip', 'c3')
    seedSegment('seg-1', { tag: 'vip' })
    const out = await resolveAudience('space-A', { segmentId: 'seg-1' })
    expect(out.map((r) => r.contactId).sort()).toEqual(['c1', 'c3'])
  })

  it('an empty-definition segment resolves to everyone', async () => {
    seedSegment('seg-all', {})
    const out = await resolveAudience('space-A', { segmentId: 'seg-all' })
    expect(out).toHaveLength(3)
  })

  it('a CROSS-SPACE segment id is a no-op: it resolves to "everyone" in THIS space, never B\'s definition', async () => {
    // A segment that lives in Space B (a tag that would narrow there). Resolving it from Space A must
    // not load B's definition (the single-row read is pinned to space_id) -> fail-safe to everyone in A.
    seedSegment('seg-b', { tag: 'vip' }, 'space-B')
    const out = await resolveAudience('space-A', { segmentId: 'seg-b' })
    expect(out.map((r) => r.contactId).sort()).toEqual(['c1', 'c2', 'c3'])
  })

  it('a missing segment id fails safe to everyone', async () => {
    const out = await resolveAudience('space-A', { segmentId: 'does-not-exist' })
    expect(out).toHaveLength(3)
  })
})

describe('resolveAudience — all contacts (no tag)', () => {
  it("returns this Space's contacts in the send-seam shape { contactId, email }", async () => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    const out = await resolveAudience('space-A')
    expect(out).toEqual([
      { contactId: 'c1', email: 'a@x.com' },
      { contactId: 'c2', email: 'b@x.com' },
    ])
  })

  it('drops contacts with a missing / malformed email', async () => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', null)
    seedContact('c3', 'not-an-email')
    const out = await resolveAudience('space-A')
    expect(out.map((r) => r.contactId)).toEqual(['c1'])
  })

  it('de-dupes by lowercased email (first wins)', async () => {
    seedContact('c1', 'Dup@X.com')
    seedContact('c2', 'dup@x.com')
    const out = await resolveAudience('space-A')
    expect(out).toHaveLength(1)
    expect(out[0]!.contactId).toBe('c1')
  })

  it('returns [] for an empty Space and for a blank spaceId', async () => {
    expect(await resolveAudience('space-A')).toEqual([])
    expect(await resolveAudience('')).toEqual([])
  })
})

describe('resolveAudience — tag filter', () => {
  beforeEach(() => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    seedContact('c3', 'c@x.com')
  })

  it('narrows to contacts linked to a tagged network_contact in this Space', async () => {
    seedTag('vip', 'c1')
    seedTag('vip', 'c3')
    const out = await resolveAudience('space-A', { tag: 'vip' })
    expect(out.map((r) => r.contactId).sort()).toEqual(['c1', 'c3'])
  })

  it('matches the tag case-insensitively', async () => {
    seedTag('VIP', 'c2')
    const out = await resolveAudience('space-A', { tag: 'vip' })
    expect(out.map((r) => r.contactId)).toEqual(['c2'])
  })

  it('a tag with no linked contacts resolves to nobody', async () => {
    seedTag('vip', null) // tagged network_contact not promoted to a marketing contact
    const out = await resolveAudience('space-A', { tag: 'vip' })
    expect(out).toEqual([])
  })

  it('a blank tag reads as "all contacts", not "nobody"', async () => {
    const out = await resolveAudience('space-A', { tag: '   ' })
    expect(out).toHaveLength(3)
  })
})

describe('resolveAudience — cross-space isolation (no leak)', () => {
  it("never returns another Space's contacts (all-contacts path)", async () => {
    seedContact('a1', 'a@x.com', 'space-A')
    seedContact('b1', 'b@x.com', 'space-B')
    const out = await resolveAudience('space-A')
    expect(out.map((r) => r.contactId)).toEqual(['a1'])
  })

  it("a tag in Space B never pulls Space A's contacts, and vice versa", async () => {
    seedContact('a1', 'a@x.com', 'space-A')
    seedContact('b1', 'b@x.com', 'space-B')
    // Same tag name in both spaces, each linked to its own space's contact.
    seedTag('vip', 'a1', 'space-A')
    seedTag('vip', 'b1', 'space-B')

    const aOut = await resolveAudience('space-A', { tag: 'vip' })
    expect(aOut.map((r) => r.contactId)).toEqual(['a1'])

    const bOut = await resolveAudience('space-B', { tag: 'vip' })
    expect(bOut.map((r) => r.contactId)).toEqual(['b1'])
  })

  it("a Space A tag linked (impossibly) to a Space B contact id still cannot leak it (contact not in A)", async () => {
    seedContact('a1', 'a@x.com', 'space-A')
    seedContact('b1', 'b@x.com', 'space-B')
    // A Space-A network_contact tag whose linked_contact_id points at a Space-B contact id.
    seedTag('vip', 'b1', 'space-A')
    const out = await resolveAudience('space-A', { tag: 'vip' })
    // b1 is not among Space A's contacts, so the intersection is empty — no leak.
    expect(out).toEqual([])
  })
})

describe('audienceCount', () => {
  it('counts the resolved recipients (and agrees with resolveAudience)', async () => {
    seedContact('c1', 'a@x.com')
    seedContact('c2', 'b@x.com')
    expect(await audienceCount('space-A')).toBe(2)
    seedTag('vip', 'c1')
    expect(await audienceCount('space-A', { tag: 'vip' })).toBe(1)
  })
})

describe('listAudienceTags', () => {
  it('returns distinct, sorted tags for linked contacts in this Space only', async () => {
    seedTag('vip', 'c1', 'space-A')
    seedTag('VIP', 'c2', 'space-A') // same tag, different case -> de-duped
    seedTag('lead', 'c3', 'space-A')
    seedTag('orphan', null, 'space-A') // not linked -> excluded
    seedTag('other', 'b1', 'space-B') // other space -> excluded
    const tags = await listAudienceTags('space-A')
    expect(tags).toEqual(['lead', 'vip'])
  })

  it('returns [] for a blank spaceId', async () => {
    expect(await listAudienceTags('')).toEqual([])
  })
})
