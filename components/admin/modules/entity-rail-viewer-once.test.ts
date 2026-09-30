import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-734. The entity rail bundle (ADR-1685) runs every mounted module's read in ONE Server Action,
// but React `cache()` does not dedupe inside a Server Action, so each getter resolved the viewer for
// itself: one `auth.getUser()` (a network call to Supabase Auth), the viewer's profiles row, the
// stewardship edges and the crew grant, per read. Under vitest `cache()` is the same pass-through it
// is inside an action (React's client build returns `fn.apply(null, arguments)`), so this suite runs
// the REAL bundle, the REAL getters, the REAL lib/auth and the REAL capability loader, and fakes only
// the two Supabase clients and the cookie jar. What it counts is what a live bundle would send.
//
// The consequences, each measured:
//   1. A multi-module bundle verifies the viewer ONCE: one getUser, one profiles read, one
//      stewardship read, one crew-grant read, one capability read of the entity. Measured on the
//      tree before LIVE-734, the circle bundle below made 16 getUser calls and 65 reads; now 1 and 14.
//   2. Every gate still sees the viewer it saw before: each getter's result inside the bundle is
//      exactly what it returns called on its own, for a viewer the gates refuse and one they admit,
//      and the resolver is handed the same viewer fields either way.
//   3. The memo is one request's. Two bundles resolve twice, and the second viewer is not served
//      the first one's identity. A getter called on its own (no bundle) is unchanged.

type Row = Record<string, unknown>
type Call = { client: 'admin' | 'session'; table: string; chain: string[] }

const calls: Call[] = []
let getUserCalls = 0
let viewerRow: Row | null = null

const HUB = {
  id: 'hub-1',
  slug: 'north-county',
  name: 'North County',
  status: 'active',
  guide_id: 'p-guide',
  nexus_id: null,
  guide: { display_name: 'Robin', handle: 'robin' },
}
const CIRCLE = {
  id: 'c-1',
  slug: 'the-circle',
  name: 'The Circle',
  about: null,
  type: 'local',
  member_cap: 12,
  member_count: 9,
  status: 'active',
  image_url: null,
  unlisted: false,
  access: 'open',
  space_id: null,
  topical_channel_id: null,
  is_space_primary: false,
  circle_channels: [],
  host_id: 'p-host',
  hub_id: 'hub-1',
  host: { display_name: 'Ada' },
}

/** One row for a single-row read, a list for anything else. Unknown tables read empty. */
function answer(table: string, single: boolean): unknown {
  const one: Record<string, Row | null> = { hubs: HUB, circles: CIRCLE }
  const many: Record<string, Row[]> = { circles: [CIRCLE] }
  return single ? (one[table] ?? null) : (many[table] ?? [])
}

/** The viewer's own profiles row, found by the auth user id the read is scoped to (as RLS would). */
function ownRow(call: Call): Row | null {
  const eq = call.chain.find((c) => c.startsWith('eq("auth_user_id",'))
  const authId = eq ? (JSON.parse(`[${eq.slice(3, -1)}]`)[1] as string) : null
  return ROWS.find((r) => `auth-${r.id as string}` === authId) ?? null
}

/** A chainable, awaitable query builder that records its chain. */
function builder(client: Call['client'], table: string): unknown {
  const call: Call = { client, table, chain: [] }
  calls.push(call)
  const p: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          const single = call.chain.some((c) => c.startsWith('maybeSingle') || c.startsWith('single'))
          const data = client === 'session' && table === 'profiles' ? ownRow(call) : answer(table, single)
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ data, error: null, count: Array.isArray(data) ? data.length : null }).then(res, rej)
        }
        if (typeof prop === 'symbol') return undefined
        return (...args: unknown[]) => {
          call.chain.push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(',')})`)
          return p
        }
      },
    },
  )
  return p
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder('admin', t), rpc: async () => ({ data: null, error: null }) }),
}))
vi.mock('@/lib/supabase/server', () => ({
  // The cookie is read when the client is built, as the real one reads it: a request that started
  // before the cookie changed keeps its own viewer.
  createClient: async () => {
    const cookie = viewerRow
    return {
      auth: {
        getUser: async () => {
          getUserCalls += 1
          return { data: { user: cookie ? { id: `auth-${cookie.id as string}` } : null }, error: null }
        },
      },
      from: (t: string) => builder('session', t),
    }
  },
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {} }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))

// The resolver is the one place every gate reads the viewer. Wrapped, not replaced: it still decides.
const seen = vi.hoisted(() => ({ viewers: [] as Array<Record<string, unknown>> }))
vi.mock('@/lib/core/capabilities', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/core/capabilities')>()
  return {
    ...mod,
    resolveCapabilities: (viewer: Parameters<typeof mod.resolveCapabilities>[0], scope: Parameters<typeof mod.resolveCapabilities>[1]) => {
      const { leadsScope: _fn, ...fields } = viewer
      seen.viewers.push(fields)
      return mod.resolveCapabilities(viewer, scope)
    },
  }
})

import { getEntityRailBundle } from './entity-rail-actions'
import { getHubAdminData, getHubPeopleData, getHubInsightsData } from '@/lib/hierarchy/hub-admin'

const profileRow = (id: string, over: Row = {}): Row => ({
  id,
  display_name: id,
  handle: id,
  avatar_url: null,
  community_role: 'member',
  community_level: 'member',
  web_role: 'none',
  membership_tier: 'free',
  current_season_zaps: 0,
  lifetime_gems: 0,
  current_streak: 0,
  meta: {},
  home_lat: null,
  home_lng: null,
  feed_radius_m: null,
  ...over,
})
const MEMBER = profileRow('p-member')
const JANITOR = profileRow('p-janitor', { web_role: 'janitor' })
const ROWS = [MEMBER, JANITOR]

const CIRCLE_READS = ['admin', 'placeTime', 'people', 'engage', 'practice', 'journeyRun', 'insights', 'move']
const HUB_READS = ['admin', 'people', 'insights']

const count = (client: Call['client'], table: string, pick: (c: Call) => boolean = () => true) =>
  calls.filter((c) => c.client === client && c.table === table && pick(c)).length
/** The capability resolver's own entity read, told apart from the getters' slug lookups by its select. */
const capabilityRead = (select: string) => (c: Call) => c.chain.some((x) => x === `select(${JSON.stringify(select)})`)

function reset(row: Row | null) {
  calls.length = 0
  getUserCalls = 0
  viewerRow = row
  seen.viewers.length = 0
}

beforeEach(() => reset(MEMBER))

describe('one entity rail bundle resolves the viewer once', () => {
  it('a circle rail bundle of eight reads makes one getUser and one of each viewer read', async () => {
    const out = await getEntityRailBundle('circle', 'the-circle', CIRCLE_READS)

    expect(Object.keys(out).sort()).toEqual([...CIRCLE_READS].sort())
    // A member manages nothing here: every gate refused, and none of them threw.
    for (const read of CIRCLE_READS) expect(out[read], read).toEqual({ ok: true, data: null })

    expect(getUserCalls).toBe(1)
    expect(count('session', 'profiles')).toBe(1)
    expect(count('admin', 'entitlement_grants')).toBe(1)
    expect(count('admin', 'stewardships')).toBe(1)
    // The circle's capability rows are read once for the whole bundle, not once per getter.
    expect(count('admin', 'circles', capabilityRead('host_id, hub_id, space_id, is_space_primary'))).toBe(1)
    expect(count('admin', 'memberships', capabilityRead('status, volunteer_role'))).toBe(1)
  })

  it('a hub rail bundle whose gates admit the viewer still resolves once, and serves every read', async () => {
    reset(JANITOR)
    const out = await getEntityRailBundle('hub', 'north-county', HUB_READS)

    for (const read of HUB_READS) {
      expect(out[read]?.ok, read).toBe(true)
      expect((out[read] as { data: unknown }).data, read).not.toBeNull()
    }
    expect(getUserCalls).toBe(1)
    expect(count('session', 'profiles')).toBe(1)
    expect(count('admin', 'hubs', capabilityRead('guide_id, nexus_id'))).toBe(1)
  })
})

describe('every gate still sees the viewer it saw before', () => {
  async function direct(): Promise<Record<string, unknown>> {
    return {
      admin: await getHubAdminData('north-county'),
      people: await getHubPeopleData('north-county'),
      insights: await getHubInsightsData('north-county'),
    }
  }

  for (const [name, row] of [['a member the gates refuse', MEMBER], ['a janitor the gates admit', JANITOR]] as const) {
    it(`for ${name}, each slice equals the getter called on its own`, async () => {
      reset(row)
      const alone = await direct()
      const aloneViewers = [...seen.viewers]
      // On its own, outside a bundle, nothing changed: each getter resolves for itself (at least
      // once each; the edge-level walk resolves a second time).
      expect(getUserCalls).toBeGreaterThanOrEqual(HUB_READS.length)

      reset(row)
      const bundled = await getEntityRailBundle('hub', 'north-county', HUB_READS)
      for (const read of HUB_READS) expect(bundled[read], read).toEqual({ ok: true, data: alone[read] })

      // The resolver was handed the same viewer, field for field, inside the bundle as outside it.
      expect(seen.viewers.length).toBeGreaterThan(0)
      for (const v of [...aloneViewers, ...seen.viewers]) expect(v).toEqual(aloneViewers[0])
      expect(aloneViewers[0]).toMatchObject({ profileId: row.id })
    })
  }
})

describe('the memo belongs to one request', () => {
  it('two bundles resolve twice, and the second viewer is never served the first one', async () => {
    reset(MEMBER)
    const first = await getEntityRailBundle('hub', 'north-county', HUB_READS)
    viewerRow = JANITOR
    const second = await getEntityRailBundle('hub', 'north-county', HUB_READS)

    expect(getUserCalls).toBe(2)
    expect(first.admin).toEqual({ ok: true, data: null })
    expect(second.admin).toEqual({ ok: true, data: expect.objectContaining({ id: 'hub-1' }) })
  })

  it('two bundles in flight together each keep their own viewer', async () => {
    reset(MEMBER)
    const a = getEntityRailBundle('hub', 'north-county', HUB_READS)
    viewerRow = JANITOR // the next request's cookie
    const b = getEntityRailBundle('hub', 'north-county', HUB_READS)
    const [ra, rb] = await Promise.all([a, b])

    expect(getUserCalls).toBe(2)
    expect(ra.admin).toEqual({ ok: true, data: null })
    expect(rb.admin).toEqual({ ok: true, data: expect.objectContaining({ id: 'hub-1' }) })
  })
})
