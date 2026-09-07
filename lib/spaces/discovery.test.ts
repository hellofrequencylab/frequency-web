import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Spaces DIRECTORY discovery read (ENTITY-SPACES-BUILD §A/§B). What is locked here, network-free
// (the admin client + the follows read are mocked):
//   1. listNetworkedSpaces returns the networked, active, non-root Spaces, ordered by brand name.
//   2. The "Following" FILTER (onlyFollowed) intersects the networked set with the viewer's follows:
//      only followed Spaces survive, a viewer who follows nothing gets [], and a signed-out viewer
//      (no profile id) gets [] (follows nothing). Fail-safe throughout.
//   3. The SORT param orders the catalog: name (A–Z, default) / newest (created_at desc) / members
//      (active member count desc). normalizeSpaceSort coerces stray values back to 'name'.
//   4. The two ADR-887 facets: SUBJECT filters in the DB on the jsonb path (shared vocabulary, no
//      default), KIND filters in APP CODE through the total spaceKind reader (legacy `category`
//      fallback + 'business' default), so pre-migration rows filter exactly like migrated ones.

// ── Mock the follows read the directory intersects against (toggled per test) ──────────────────────
let followed: Set<string> = new Set()
vi.mock('./follows', () => ({
  listFollowedSpaceIds: async (profileId: string | null) =>
    profileId ? followed : new Set<string>(),
}))

// ── A chainable admin-client mock backed by an in-memory set of spaces rows ─────────────────────────
type SpaceRow = {
  id: string
  slug: string
  name: string
  type: string
  status: string
  brand_name: string | null
  brand_logo_url: string | null
  tagline: string | null
  visibility: string
  /** The Community Collective world switch (ADR-811 §3): only connected Spaces are discoverable. */
  network_connected: boolean
  created_at: string
  /** The preferences jsonb — carries profileData.subject / .kind (or the legacy .category) +
   *  headerCta for the app-code resolvers. */
  preferences?: unknown
  /** LIVE-197: the sitemap's `<lastmod>` source. */
  updated_at?: string | null
  /** The per-Space function on/off switches (spaces.entitlements) the tab gates read. */
  entitlements?: unknown
}
// The four PRESENCE tables the profile-tab reader (LIVE-184) groups over. Each holds plain rows and
// is filtered by the generic builder below, so a test states the world ("bravo has one visible
// review") rather than a query result.
type PresenceRow = Record<string, unknown>

const store: {
  spaces: SpaceRow[]
  counts: Record<string, number>
  followers: Record<string, number>
  upcoming: Record<string, number>
  /** REAL event rows for the upcoming-count read, when a test needs the SERIES shape rather than a
   *  bare per-Space number (LIVE-198). When empty, `upcoming` synthesises one-off rows instead. */
  upcomingRows: PresenceRow[]
  events: PresenceRow[]
  circles: PresenceRow[]
  reviews: PresenceRow[]
  collaborations: PresenceRow[]
} = {
  spaces: [],
  counts: {},
  followers: {},
  upcoming: {},
  upcomingRows: [],
  events: [],
  circles: [],
  reviews: [],
  collaborations: [],
}

/** The stored SUBJECT for a row (preferences.profileData.subject), or null when unset — mirrors the
 *  DB jsonb-path read the real query filters on. */
function rowSubject(r: SpaceRow): string | null {
  const prefs = r.preferences && typeof r.preferences === 'object' ? (r.preferences as Record<string, unknown>) : {}
  const pd = prefs.profileData && typeof prefs.profileData === 'object' ? (prefs.profileData as Record<string, unknown>) : {}
  return typeof pd.subject === 'string' ? pd.subject : null
}

function spacesBuilder() {
  const eqs: Record<string, string | boolean> = {}
  let neqType: string | null = null
  let subjectEq: string | null = null
  let orderCol = 'name'
  let orderAsc = true
  const api = {
    select() {
      return api
    },
    eq(col: string, val: string | boolean) {
      // The subject jsonb-path filter records separately. (KIND never reaches the DB: it filters in
      // app code through the total spaceKind reader, so this mock needs no kind branch.)
      if (col.includes('subject')) subjectEq = String(val)
      else eqs[col] = val
      return api
    },
    neq(col: string, val: string) {
      if (col === 'type') neqType = val
      return api
    },
    or() {
      // One caller: free-text search over name/brand/slug (ignored by this mock).
      return api
    },
    order(col: string, opts: { ascending: boolean }) {
      orderCol = col
      orderAsc = opts.ascending
      return api
    },
    limit() {
      // Terminal: apply the recorded filters + the recorded DB order and resolve. (The 'members'
      // sort is applied in app code AFTER counts, so the DB order there is name — exactly this.)
      const rows = store.spaces
        .filter((r) => (eqs.visibility ? r.visibility === eqs.visibility : true))
        .filter((r) => (eqs.network_connected !== undefined ? r.network_connected === eqs.network_connected : true))
        .filter((r) => (eqs.status ? r.status === eqs.status : true))
        .filter((r) => (eqs.type ? r.type === eqs.type : true))
        .filter((r) => (neqType ? r.type !== neqType : true))
        .filter((r) => (subjectEq ? rowSubject(r) === subjectEq : true))
        .sort((a, b) => {
          const cmp =
            orderCol === 'created_at'
              ? a.created_at.localeCompare(b.created_at)
              : a.name.localeCompare(b.name)
          return orderAsc ? cmp : -cmp
        })
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

/** A generic grouped-count builder over a per-id count map: emits one `{ space_id }` row per counted
 *  unit for the requested ids. Tolerates the extra .eq()/.gt() calls the events read chains. */
function countBuilder(map: Record<string, number>) {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    gt() {
      return api
    },
    in(_col: string, vals: string[]) {
      const data = vals.flatMap((id) => Array.from({ length: map[id] ?? 0 }, () => ({ space_id: id })))
      return Promise.resolve({ data, error: null })
    },
  }
  return api
}

/** The directory's UPCOMING-EVENTS read, which is a ROW read, not a grouped count: since LIVE-198 it
 *  selects the series columns and folds per Space, so a weekly series counts as one gathering rather
 *  than as its nine materialised occurrences.
 *
 *  Two ways to state the world. `store.upcomingRows` gives REAL rows (the series fixture); otherwise
 *  the per-Space `store.upcoming` number is synthesised as that many DISTINCT one-off rows, so every
 *  test that only cares about the number still means exactly what it meant before the fold. */
function upcomingEventsBuilder() {
  const api = {
    select() {
      return api
    },
    eq() {
      return api
    },
    gt() {
      return api
    },
    in(_col: string, vals: string[]) {
      const rows = store.upcomingRows.length
        ? store.upcomingRows.filter((r) => vals.includes(String(r.space_id)))
        : vals.flatMap((id) =>
            Array.from({ length: store.upcoming[id] ?? 0 }, (_, i) => ({
              space_id: id,
              id: `${id}-e${i}`,
              starts_at: '2099-01-01T19:00:00Z',
              parent_event_id: null,
              recurrence_type: 'none',
              recurrence_until: null,
              is_cancelled: false,
            })),
          )
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return api
}

/** A THENABLE builder over a plain row array, applying the filters the presence reads chain. It is
 *  thenable rather than resolving on a terminal method because the real PostgREST builder is: the
 *  events read calls `.in()` twice (once for `visibility`, once for `space_id`) and only the await
 *  ends the chain, so a mock that resolved on the first `.in()` would be testing a different query
 *  from the one production runs. */
function presenceBuilder(rows: PresenceRow[]) {
  let out = rows
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      out = out.filter((r) => r[col] === val)
      return api
    },
    in(col: string, vals: readonly unknown[]) {
      out = out.filter((r) => vals.includes(r[col]))
      return api
    },
    is(col: string, val: null) {
      out = out.filter((r) => (r[col] ?? null) === val)
      return api
    },
    gte(col: string, val: string) {
      out = out.filter((r) => String(r[col] ?? '') >= val)
      return api
    },
    or(filter: string) {
      // The ONE `.or()` the tab reader issues: circles' axis-1 listed rule, where a NULL `unlisted`
      // is a LISTED row. Spelled out rather than parsed, so the mock cannot quietly accept a
      // different filter string than the one the reader sends.
      if (filter === 'unlisted.is.null,unlisted.eq.false') {
        out = out.filter((r) => r.unlisted !== true)
      }
      return api
    },
    limit: () => api,
    then(resolve: (r: { data: PresenceRow[]; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: out, error: null }))
    },
  }
  return api
}

/** Which tables the profile-tab reader groups over. `events` is shared with the directory's own
 *  upcoming-count read, so it routes on the SHAPE of the call: the directory read resolves on its
 *  terminal `.in()` (countBuilder) while the tab read awaits a thenable. `tabRead` flips for the
 *  duration of a tab test, which is honest here because no test exercises both at once. */
let tabRead = false

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'space_members') return countBuilder(store.counts)
      if (table === 'space_follows') return countBuilder(store.followers)
      if (table === 'events') return tabRead ? presenceBuilder(store.events) : upcomingEventsBuilder()
      if (table === 'circles') return presenceBuilder(store.circles)
      if (table === 'space_reviews') return presenceBuilder(store.reviews)
      if (table === 'space_collaborations') return presenceBuilder(store.collaborations)
      return spacesBuilder()
    },
  }),
}))

import { readProfilePages, HOME_SLUG } from './profile-pages'
import {
  listNetworkedSpaces,
  listNetworkedSpaceProfileTabs,
  listNetworkedSpacesPage,
  normalizeSpaceSort,
} from './discovery'

const VIEWER = 'viewer-0000-4000-a000-0000000viewr'

beforeEach(() => {
  followed = new Set()
  tabRead = false
  store.counts = {}
  store.followers = {}
  store.upcoming = {}
  store.upcomingRows = []
  store.events = []
  store.circles = []
  store.reviews = []
  store.collaborations = []
  store.spaces = [
    // s1 is a PRE-MIGRATION row: kind stored on the LEGACY `category` key, plus a subject. s2 stores
    // the CANONICAL `kind` key + a subject. s3 has NEITHER (kind reads as 'business', no subject).
    // All three are connected (in the collective), so they list.
    { id: 's1', slug: 'river-yoga', name: 'River Yoga', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', network_connected: true, created_at: '2026-01-10T00:00:00Z', preferences: { profileData: { category: 'studio', subject: 'movement' } } },
    { id: 's2', slug: 'sound-co', name: 'Sound Co', type: 'business', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', network_connected: true, created_at: '2026-03-01T00:00:00Z', preferences: { profileData: { kind: 'maker', subject: 'meditation' } } },
    { id: 's3', slug: 'forest-org', name: 'Forest Org', type: 'organization', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', network_connected: true, created_at: '2026-02-15T00:00:00Z' },
    // Excluded by the discovery boundary: private + root, never listed.
    { id: 's4', slug: 'private-one', name: 'Private One', type: 'practitioner', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'private', network_connected: true, created_at: '2026-01-01T00:00:00Z' },
    { id: 'root', slug: 'frequency', name: 'Frequency', type: 'root', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', network_connected: true, created_at: '2025-01-01T00:00:00Z' },
    // s5 is network-VISIBLE but DISCONNECTED (standalone / Independent, ADR-811 §3): walled off from
    // discovery even though its visibility is 'network'. The new second gate must exclude it.
    { id: 's5', slug: 'solo-standalone', name: 'Aardvark Standalone', type: 'business', status: 'active', brand_name: null, brand_logo_url: null, tagline: null, visibility: 'network', network_connected: false, created_at: '2026-04-01T00:00:00Z' },
  ]
})

describe('listNetworkedSpaces (no Following filter)', () => {
  it('lists networked, active, non-root spaces, ordered by name', async () => {
    const spaces = await listNetworkedSpaces({})
    expect(spaces.map((s) => s.id)).toEqual(['s3', 's1', 's2']) // Forest Org, River Yoga, Sound Co
  })

  it('excludes a DISCONNECTED Space even when its visibility is network (ADR-811 §3)', async () => {
    // s5 is visibility=network but network_connected=false, and its name (Aardvark) would sort FIRST if
    // it leaked in — so this locks the second discovery gate, not just an ordering coincidence.
    const spaces = await listNetworkedSpaces({})
    expect(spaces.map((s) => s.id)).not.toContain('s5')
    expect(spaces.map((s) => s.name)).not.toContain('Aardvark Standalone')
  })
})

describe('the "Following" filter (onlyFollowed)', () => {
  it('intersects the networked set with the viewer’s follows', async () => {
    followed = new Set(['s1', 's3', 's4']) // s4 is private, so it can never surface even if followed
    const spaces = await listNetworkedSpaces({
      followerProfileId: VIEWER,
      onlyFollowed: true,
    })
    expect(spaces.map((s) => s.id).sort()).toEqual(['s1', 's3'])
  })

  it('a viewer who follows nothing gets an empty directory', async () => {
    followed = new Set()
    expect(await listNetworkedSpaces({ followerProfileId: VIEWER, onlyFollowed: true })).toEqual([])
  })

  it('a signed-out viewer (no profile id) follows nothing -> []', async () => {
    followed = new Set(['s1']) // even if a set existed, no profile id means nothing resolves
    expect(await listNetworkedSpaces({ followerProfileId: null, onlyFollowed: true })).toEqual([])
  })
})

describe('the sort param', () => {
  it('defaults to name (A–Z) when sort is absent or unknown', async () => {
    const byDefault = await listNetworkedSpaces({})
    const byName = await listNetworkedSpaces({ sort: 'name' })
    // @ts-expect-error — a stray value coerces back to 'name'
    const byStray = await listNetworkedSpaces({ sort: 'bogus' })
    const names = ['s3', 's1', 's2'] // Forest Org, River Yoga, Sound Co
    expect(byDefault.map((s) => s.id)).toEqual(names)
    expect(byName.map((s) => s.id)).toEqual(names)
    expect(byStray.map((s) => s.id)).toEqual(names)
  })

  it('newest orders by created_at descending', async () => {
    const spaces = await listNetworkedSpaces({ sort: 'newest' })
    // s2 (Mar) > s3 (Feb) > s1 (Jan)
    expect(spaces.map((s) => s.id)).toEqual(['s2', 's3', 's1'])
  })

  it('members orders by active member count descending, ties fall back to name', async () => {
    store.counts = { s1: 5, s2: 5, s3: 12 }
    const spaces = await listNetworkedSpaces({ sort: 'members' })
    // s3 (12) first; s1 & s2 tie at 5, so name breaks the tie: River Yoga before Sound Co.
    expect(spaces.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
    expect(spaces.map((s) => s.memberCount)).toEqual([12, 5, 5])
  })

  it('members sort sinks a Space with no count below any counted one', async () => {
    store.counts = { s1: 3 } // s2, s3 have no members
    const spaces = await listNetworkedSpaces({ sort: 'members' })
    expect(spaces[0].id).toBe('s1') // the only counted Space leads
    expect(spaces.slice(1).map((s) => s.id).sort()).toEqual(['s2', 's3'])
  })
})

describe('normalizeSpaceSort', () => {
  it('passes known sorts through and coerces everything else to name', () => {
    expect(normalizeSpaceSort('name')).toBe('name')
    expect(normalizeSpaceSort('newest')).toBe('newest')
    expect(normalizeSpaceSort('members')).toBe('members')
    expect(normalizeSpaceSort('bogus')).toBe('name')
    expect(normalizeSpaceSort(undefined)).toBe('name')
    expect(normalizeSpaceSort(null)).toBe('name')
  })
})

describe('the kind field + filter (ADR-887, app-code through the total reader)', () => {
  it('resolves each row kind — canonical key, LEGACY category fallback, business default', async () => {
    const spaces = await listNetworkedSpaces({})
    const byId = Object.fromEntries(spaces.map((s) => [s.id, s.kind]))
    // s1 stores the legacy `category` key, s2 the canonical `kind` key, s3 nothing — one semantics.
    expect(byId).toEqual({ s1: 'studio', s2: 'maker', s3: 'business' })
  })

  it('filters to one specific kind, matching a PRE-MIGRATION legacy-key row too', async () => {
    expect((await listNetworkedSpaces({ kind: 'maker' })).map((s) => s.id)).toEqual(['s2'])
    // s1 carries kind only on the legacy `category` key; the filter still finds it (read fallback).
    expect((await listNetworkedSpaces({ kind: 'studio' })).map((s) => s.id)).toEqual(['s1'])
  })

  it('the business filter also matches Spaces with no stored kind at all', async () => {
    const spaces = await listNetworkedSpaces({ kind: 'business' })
    expect(spaces.map((s) => s.id)).toEqual(['s3']) // only the kind-less row reads as business
  })

  it("'all' / unknown / absent applies no kind filter", async () => {
    const all = await listNetworkedSpaces({ kind: 'all' })
    const bogus = await listNetworkedSpaces({ kind: 'nope' })
    const absent = await listNetworkedSpaces({})
    const ids = ['s3', 's1', 's2'] // Forest Org, River Yoga, Sound Co (name order)
    expect(all.map((s) => s.id)).toEqual(ids)
    expect(bogus.map((s) => s.id)).toEqual(ids)
    expect(absent.map((s) => s.id)).toEqual(ids)
  })
})

describe('the subject filter (ADR-887, the shared vocabulary in the DB path)', () => {
  it('filters to one subject', async () => {
    expect((await listNetworkedSpaces({ subject: 'movement' })).map((s) => s.id)).toEqual(['s1'])
    expect((await listNetworkedSpaces({ subject: 'meditation' })).map((s) => s.id)).toEqual(['s2'])
  })

  it('a Space with no subject matches no subject pill (no default subject)', async () => {
    const spaces = await listNetworkedSpaces({ subject: 'movement' })
    expect(spaces.map((s) => s.id)).not.toContain('s3')
  })

  it("'all' / off-list / absent applies no subject filter (KIND keys are not subjects)", async () => {
    const ids = ['s3', 's1', 's2'] // name order
    expect((await listNetworkedSpaces({ subject: 'all' })).map((s) => s.id)).toEqual(ids)
    expect((await listNetworkedSpaces({ subject: 'studio' })).map((s) => s.id)).toEqual(ids) // a kind, not a subject
    expect((await listNetworkedSpaces({ subject: 'nope' })).map((s) => s.id)).toEqual(ids)
  })

  it('subject + kind stack (each axis narrows independently)', async () => {
    expect((await listNetworkedSpaces({ subject: 'movement', kind: 'studio' })).map((s) => s.id)).toEqual(['s1'])
    expect(await listNetworkedSpaces({ subject: 'movement', kind: 'maker' })).toEqual([])
  })
})

describe('the resolved card action', () => {
  it('defaults to the per-type CTA off the space base path when no header CTA is set', async () => {
    const spaces = await listNetworkedSpaces({})
    const s2 = spaces.find((s) => s.id === 's2')! // type 'business'
    expect(s2.action).toEqual({ label: 'Become a member', href: '/spaces/sound-co/book' })
  })

  it('resolves an operator custom header CTA override to its label + href', async () => {
    store.spaces[1].preferences = {
      profileData: { kind: 'maker', subject: 'meditation' },
      headerCta: { kind: 'custom', url: 'https://book.example.com', label: 'Reserve a spot' },
    }
    const spaces = await listNetworkedSpaces({})
    const s2 = spaces.find((s) => s.id === 's2')!
    expect(s2.action).toEqual({ label: 'Reserve a spot', href: 'https://book.example.com' })
  })
})

describe('the extra per-space stats', () => {
  it('batches follower + upcoming-event counts, null when absent', async () => {
    store.followers = { s1: 4, s3: 9 }
    store.upcoming = { s1: 2 }
    const spaces = await listNetworkedSpaces({})
    const byId = Object.fromEntries(spaces.map((s) => [s.id, { f: s.followerCount, e: s.upcomingEventCount }]))
    expect(byId.s1).toEqual({ f: 4, e: 2 })
    expect(byId.s3).toEqual({ f: 9, e: null }) // no upcoming events -> null
    expect(byId.s2).toEqual({ f: null, e: null }) // neither -> null
  })

  // ── LIVE-198 / SERIES-COUNT: the directory card counts GATHERINGS, not materialised rows ────────
  // The production reading, 2026-09-07: two Spaces each run ONE weekly series and the directory
  // advertised "9 upcoming events" for each of them, because recurrence is materialised (ADR-007)
  // and the count read one row per date. 21 upcoming rows across the community are 5 gatherings.
  it('counts a weekly SERIES once, where the raw rows would say nine', async () => {
    // Exactly what the cron materialises for s1: an anchor plus eight weekly children.
    const start = Date.UTC(2099, 0, 6, 19, 0, 0)
    const week = 7 * 24 * 60 * 60 * 1000
    store.upcomingRows = [
      { space_id: 's1', id: 'anchor', starts_at: new Date(start).toISOString(), parent_event_id: null, recurrence_type: 'weekly', recurrence_until: null, is_cancelled: false },
      ...Array.from({ length: 8 }, (_, i) => ({
        space_id: 's1',
        id: `child-${i}`,
        starts_at: new Date(start + (i + 1) * week).toISOString(),
        parent_event_id: 'anchor',
        recurrence_type: 'none',
        recurrence_until: null,
        is_cancelled: false,
      })),
      // s3 runs two genuinely separate one-offs, which must still count as two.
      { space_id: 's3', id: 'gala', starts_at: '2099-02-01T19:00:00Z', parent_event_id: null, recurrence_type: 'none', recurrence_until: null, is_cancelled: false },
      { space_id: 's3', id: 'clinic', starts_at: '2099-02-08T19:00:00Z', parent_event_id: null, recurrence_type: 'none', recurrence_until: null, is_cancelled: false },
    ]
    const spaces = await listNetworkedSpaces({})
    const byId = Object.fromEntries(spaces.map((sp) => [sp.id, sp.upcomingEventCount]))
    expect(byId.s1).toBe(1) // nine rows, one gathering
    expect(byId.s3).toBe(2)
    expect(byId.s2).toBe(null)
  })

  it('a series whose occurrences are ALL cancelled leaves the Space with no count at all', async () => {
    store.upcomingRows = [
      { space_id: 's1', id: 'anchor', starts_at: '2099-01-06T19:00:00Z', parent_event_id: null, recurrence_type: 'weekly', recurrence_until: null, is_cancelled: true },
      { space_id: 's1', id: 'child-1', starts_at: '2099-01-13T19:00:00Z', parent_event_id: 'anchor', recurrence_type: 'none', recurrence_until: null, is_cancelled: true },
    ]
    const spaces = await listNetworkedSpaces({})
    expect(spaces.find((sp) => sp.id === 's1')!.upcomingEventCount).toBe(null)
  })
})

describe('listNetworkedSpacesPage (pagination)', () => {
  it('returns the total and a limit/offset window over the sorted set', async () => {
    const page1 = await listNetworkedSpacesPage({}, { limit: 2, offset: 0 })
    expect(page1.total).toBe(3)
    expect(page1.spaces.map((s) => s.id)).toEqual(['s3', 's1']) // name order, first 2

    const page2 = await listNetworkedSpacesPage({}, { limit: 2, offset: 2 })
    expect(page2.total).toBe(3)
    expect(page2.spaces.map((s) => s.id)).toEqual(['s2']) // the remainder
  })

  it('returns the whole set + total when no window is given', async () => {
    const page = await listNetworkedSpacesPage({})
    expect(page.total).toBe(3)
    expect(page.spaces.map((s) => s.id)).toEqual(['s3', 's1', 's2'])
  })

  it('carries the filters through to the page (subject narrows the total)', async () => {
    const page = await listNetworkedSpacesPage({ subject: 'movement' }, { limit: 12, offset: 0 })
    expect(page.total).toBe(1)
    expect(page.spaces.map((s) => s.id)).toEqual(['s1'])
  })
})


// ── The public profile TAB routes (LIVE-184) ─────────────────────────────────────────────────────
//
// Seven crawlable tabs sit beside each Space profile (book, calendar, circles, collaborators,
// reviews, shop, and the operator's own pages), every one indexable and canonical to itself, and
// none of them was advertised anywhere. The reader that fixes that has exactly ONE claim worth
// pinning, and it is a negative: an EMPTY tab never gets a URL. Every gate below is the page's own
// gate (or, for the pages that render an honest empty rather than 404ing, the nav's), so what the
// sitemap advertises and what a visitor is actually offered cannot drift.
describe('listNetworkedSpaceProfileTabs (the sitemap tab gates)', () => {
  /** The tab segments emitted for one slug. */
  async function segmentsFor(slug: string): Promise<string[]> {
    tabRead = true
    const rows = await listNetworkedSpaceProfileTabs()
    return rows.filter((r) => r.slug === slug).map((r) => r.segment)
  }

  it('gives a bare Space exactly ONE tab — book, the page that is never empty', async () => {
    // No events, no circles, no reviews, no collaborators, no published storefront, no custom pages.
    expect(await segmentsFor('sound-co')).toEqual(['book'])
  })

  it('advertises calendar only for a Space with an upcoming PUBLIC event', async () => {
    store.events = [
      // s2 (sound-co): a real upcoming public event.
      { space_id: 's2', status: 'published', is_cancelled: false, visibility: 'public', removed_at: null, is_demo: false, starts_at: '2099-01-01T00:00:00Z' },
      // s1 (river-yoga): every row here fails one gate the page applies, so it must gain no tab.
      { space_id: 's1', status: 'draft', is_cancelled: false, visibility: 'public', removed_at: null, is_demo: false, starts_at: '2099-01-01T00:00:00Z' },
      { space_id: 's1', status: 'published', is_cancelled: true, visibility: 'public', removed_at: null, is_demo: false, starts_at: '2099-01-01T00:00:00Z' },
      { space_id: 's1', status: 'published', is_cancelled: false, visibility: 'private', removed_at: null, is_demo: false, starts_at: '2099-01-01T00:00:00Z' },
      { space_id: 's1', status: 'published', is_cancelled: false, visibility: 'public', removed_at: '2026-01-01T00:00:00Z', is_demo: false, starts_at: '2099-01-01T00:00:00Z' },
      { space_id: 's1', status: 'published', is_cancelled: false, visibility: 'public', removed_at: null, is_demo: true, starts_at: '2099-01-01T00:00:00Z' },
      // ...and one that already happened.
      { space_id: 's1', status: 'published', is_cancelled: false, visibility: 'public', removed_at: null, is_demo: false, starts_at: '2000-01-01T00:00:00Z' },
    ]
    expect(await segmentsFor('sound-co')).toContain('calendar')
    expect(await segmentsFor('river-yoga')).not.toContain('calendar')
  })

  it('advertises circles only for a LISTED, joinable circle — and a null `unlisted` is listed', async () => {
    store.circles = [
      { space_id: 's2', status: 'active', unlisted: null }, // NULL means listed (axis 1)
      { space_id: 's1', status: 'active', unlisted: true }, // hidden from the public tab
      { space_id: 's3', status: 'archived', unlisted: false }, // not a joinable status
    ]
    expect(await segmentsFor('sound-co')).toContain('circles')
    expect(await segmentsFor('river-yoga')).not.toContain('circles')
    expect(await segmentsFor('forest-org')).not.toContain('circles')
  })

  it('advertises reviews only for a VISIBLE review, and never when the function is switched off', async () => {
    store.reviews = [
      { space_id: 's2', status: 'visible' },
      { space_id: 's1', status: 'hidden' }, // moderated away: the wall would read empty
    ]
    expect(await segmentsFor('sound-co')).toContain('reviews')
    expect(await segmentsFor('river-yoga')).not.toContain('reviews')

    // An operator turning the function off must take the URL with it — the route 404s.
    store.spaces = store.spaces.map((r) => (r.id === 's2' ? { ...r, entitlements: { reviews: false } } : r))
    expect(await segmentsFor('sound-co')).not.toContain('reviews')
  })

  it('advertises collaborators from EITHER side of an accepted collaboration', async () => {
    store.collaborations = [
      { host_space_id: 's2', collaborator_space_id: 's1', status: 'accepted' },
      { host_space_id: 's3', collaborator_space_id: 's2', status: 'pending' }, // not accepted yet
    ]
    // Both sides of the accepted row list the other, so both get the tab.
    expect(await segmentsFor('sound-co')).toContain('collaborators')
    expect(await segmentsFor('river-yoga')).toContain('collaborators')
    // The pending row advertises nothing.
    expect(await segmentsFor('forest-org')).not.toContain('collaborators')
  })

  it('advertises shop only on the three gates the route itself double-gates on', async () => {
    // s2 is a `business` (a console type) with a PUBLISHED storefront: the full pass.
    store.spaces = store.spaces.map((r) =>
      r.id === 's2' ? { ...r, preferences: { storefront: { published: true } } } : r,
    )
    expect(await segmentsFor('sound-co')).toContain('shop')

    // Same Space, storefront unpublished — the route 404s, so nothing is advertised.
    store.spaces = store.spaces.map((r) =>
      r.id === 's2' ? { ...r, preferences: { storefront: { published: false } } } : r,
    )
    expect(await segmentsFor('sound-co')).not.toContain('shop')

    // Published, but the `shop` FUNCTION is off in the Module Manager — the route 404s on that too.
    store.spaces = store.spaces.map((r) =>
      r.id === 's2'
        ? { ...r, preferences: { storefront: { published: true } }, entitlements: { shop: false } }
        : r,
    )
    expect(await segmentsFor('sound-co')).not.toContain('shop')
  })

  it("advertises the operator's custom pages, and never the `home` page (it canonicalises to the root)", async () => {
    store.spaces = store.spaces.map((r) =>
      r.id === 's2'
        ? {
            ...r,
            preferences: {
              pages: [
                { slug: 'home', label: 'Home' },
                { slug: 'our-story', label: 'Our story' },
              ],
            },
          }
        : r,
    )
    const segs = await segmentsFor('sound-co')
    expect(segs).toContain('our-story')
    // `home` renders the profile root's own doc and points its canonical there: advertising it
    // would submit a self-declared duplicate.
    expect(segs).not.toContain('home')
  })

  // 🔴 THE PARITY TEST. `lib/spaces/discovery.ts` cannot import `readProfilePages`: that module
  // pulls in the whole Puck block registry (page-editor/config), and this module is reachable from
  // app/sitemap.ts — a ROOT metadata file — so the import would multiply the registry across every
  // /spaces function. It restates the slug rule locally instead, which is a drift risk with exactly
  // one honest answer: measure the restatement against the canonical reader on the same input. A
  // TEST may import profile-pages freely; nothing here ships.
  it('reads the operator page slugs identically to the canonical readProfilePages', async () => {
    tabRead = true
    const pages = [
      { slug: 'home', label: 'Home' }, // the system page: never a tab of its own
      { slug: 'our-story', label: 'Our story' },
      { slug: 'Our-Story', label: 'dupe in different case' }, // lowercased, then deduped
      { slug: 'not a slug', label: 'spaces are invalid' },
      { slug: 'x'.repeat(41), label: 'over the 40-char cap' },
      { slug: '-leading-hyphen', label: 'fails the kebab rule' },
      { slug: 'team', label: 'Team' },
      { slug: 'classes', label: 'Classes' },
      { slug: 'press', label: 'Press' },
      { slug: 'contact', label: 'Contact' },
      { slug: 'overflow', label: 'past the cap' },
    ]
    store.spaces = store.spaces.map((r) => (r.id === 's2' ? { ...r, preferences: { pages } } : r))

    const canonical = readProfilePages({ pages })
      .filter((p) => p.slug !== HOME_SLUG)
      .map((p) => p.slug)
    // The static tabs are emitted first, so the custom pages are the tail of this Space's segments.
    const segs = await segmentsFor('sound-co')
    expect(segs.slice(segs.length - canonical.length)).toEqual(canonical)
    // A positive control: the fixture really does exercise the rules (it is not an empty list on
    // both sides, which would make the comparison above vacuous).
    expect(canonical.length).toBeGreaterThan(1)
  })

  it('never advertises the same URL twice when a custom page shadows a static tab', async () => {
    // `RESERVED_PAGE_SLUGS` blocks `book` but not `shop`: an operator can declare a page called
    // "shop" that the static sibling route wins, so the URL exists once and must be advertised once.
    store.spaces = store.spaces.map((r) =>
      r.id === 's2'
        ? {
            ...r,
            preferences: { storefront: { published: true }, pages: [{ slug: 'shop', label: 'Shop' }] },
          }
        : r,
    )
    const segs = await segmentsFor('sound-co')
    expect(segs.filter((x) => x === 'shop')).toHaveLength(1)
    expect(new Set(segs).size).toBe(segs.length)
  })

  it('carries the Space row updated_at onto every tab (the LIVE-197 lastmod source)', async () => {
    tabRead = true
    store.spaces = store.spaces.map((r) => (r.id === 's2' ? { ...r, updated_at: '2026-08-09T11:30:00Z' } : r))
    const rows = await listNetworkedSpaceProfileTabs()
    const mine = rows.filter((r) => r.slug === 'sound-co')
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((r) => r.updatedAt === '2026-08-09T11:30:00Z')).toBe(true)
    // A row with no timestamp carries null, so the sitemap emits no lastmod rather than inventing one.
    expect(rows.filter((r) => r.slug === 'forest-org').every((r) => r.updatedAt === null)).toBe(true)
  })

  it('never advertises a tab for a PRIVATE or standalone Space (the discovery boundary holds)', async () => {
    tabRead = true
    // Give the walled Spaces every reason to qualify; the boundary must still exclude them.
    store.reviews = [
      { space_id: 's4', status: 'visible' },
      { space_id: 's5', status: 'visible' },
    ]
    const slugs = new Set((await listNetworkedSpaceProfileTabs()).map((r) => r.slug))
    expect(slugs.has('private-one')).toBe(false)
    expect(slugs.has('solo-standalone')).toBe(false)
    expect(slugs.has('frequency')).toBe(false) // root is never member-facing
  })
})
