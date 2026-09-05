import { describe, it, expect, vi, beforeEach } from 'vitest'

// EXECUTING tests for the capability loader (scan2 L8-06, 2026-09-05). This module is the seam
// every authz check reads: 82 production importers, and until today it was `vi.mock`ed by ten
// tests, read as text by ten more, and executed by none. A fake that returns the capabilities
// the caller expects is the same circularity that let scan 1's phantom column survive six tests,
// so these call the REAL module and script only the two things it cannot have in a unit test: the
// caller's profile (lib/auth reads request cookies) and the Supabase admin client.
//
// The fake client is table-aware and RECORDS every chain, so a test can assert both what came
// back and what was asked: which table, scoped by which columns. A fake that ignores the table
// argument (the shape of most fakes in this tree) cannot notice a read aimed at the wrong table.

type Reply = { data?: unknown; error?: { message: string } | null; count?: number | null }
type Call = { table: string; chain: [string, unknown[]][] }

const script = new Map<string, Reply[]>()
const calls: Call[] = []

/** Queue the NEXT reply for reads of `table`. Unscripted reads resolve `{ data: null, error: null }`. */
function reply(table: string, r: Reply) {
  script.set(table, [...(script.get(table) ?? []), r])
}

function builder(table: string): unknown {
  const call: Call = { table, chain: [] }
  calls.push(call)
  const p: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
            const q = script.get(table) ?? []
            const r = q.shift() ?? {}
            return Promise.resolve({ data: null, error: null, count: null, ...r }).then(res, rej)
          }
        }
        if (typeof prop === 'symbol') return undefined
        return (...args: unknown[]) => {
          call.chain.push([prop, args])
          return p
        }
      },
    },
  )
  return p
}

const fakeAdmin = { from: (table: string) => builder(table) }

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: vi.fn() }))
// The Space seam has its own Supabase reads and a lazy lib/auth import; it is scripted at its
// boundary so the space-event delegation can be exercised without its internals.
vi.mock('@/lib/spaces/entitlements', () => ({ getSpaceCapabilities: vi.fn() }))

import { getCallerProfile } from '@/lib/auth'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import {
  getGlobalCapabilities,
  getCircleCapabilities,
  getHubCapabilities,
  getNexusCapabilities,
  getEventCapabilities,
  getChannelCapabilities,
  getPracticeCapabilities,
  getJourneyCapabilities,
  getProfileCapabilities,
  loadCapabilitiesForScope,
  canCreate,
  assertCanCreate,
} from './load-capabilities'

type Profile = NonNullable<Awaited<ReturnType<typeof getCallerProfile>>>
const profile = (over: Partial<Profile> & { id: string }): Profile => ({
  community_role: 'member',
  communityLevel: 'member',
  webRole: 'none',
  membershipTier: 'free',
  realMembershipTier: 'free',
  ...over,
})

const ANON = null
const MEMBER = profile({ id: 'p-member' })
const HOST = profile({ id: 'p-host', community_role: 'host', communityLevel: 'host', membershipTier: 'crew', realMembershipTier: 'crew' })
const STAFF = profile({ id: 'p-staff', webRole: 'admin' })
const JANITOR = profile({ id: 'p-janitor', webRole: 'janitor' })
const GUIDE = profile({ id: 'p-guide', community_role: 'guide', communityLevel: 'guide' })

const viewer = (p: Profile | null) => vi.mocked(getCallerProfile).mockResolvedValue(p)
const reads = (table: string) => calls.filter((c) => c.table === table)
const chainOf = (c: Call) => c.chain.map(([m, a]) => `${m}(${a.map((x) => JSON.stringify(x)).join(',')})`)

beforeEach(() => {
  script.clear()
  calls.length = 0
  vi.mocked(getCallerProfile).mockReset()
  vi.mocked(getSpaceCapabilities).mockReset()
})

describe('anonymous', () => {
  beforeEach(() => viewer(ANON))

  it('holds nothing on the global scope', async () => {
    expect([...(await getGlobalCapabilities())]).toEqual([])
    expect(await canCreate('event.create')).toBe(false)
    await expect(assertCanCreate('circle.create')).rejects.toThrow(/Upgrade to Crew/)
  })

  it('may view a circle and nothing else, and no membership row is even looked for', async () => {
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    const caps = await getCircleCapabilities('c1')
    expect([...caps]).toEqual(['circle.view'])
    expect(reads('memberships')).toEqual([])
    expect(reads('crew_tasks')).toEqual([])
  })

  it('cannot edit an event, a practice, a journey or a profile', async () => {
    reply('events', { data: { host_id: 'p-host', scope_type: 'public', scope_id: null, space_id: null, posted_by_profile_id: null, status: 'published' } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(false)
    reply('practices', { data: { created_by: 'p-host' } })
    expect((await getPracticeCapabilities('pr1')).has('practice.editSettings')).toBe(false)
    reply('journey_plans', { data: { author_id: 'p-host' } })
    expect((await getJourneyCapabilities('j1')).has('journey.editSettings')).toBe(false)
    reply('profiles', { data: { meta: {} } })
    expect((await getProfileCapabilities('p-host')).has('profile.edit')).toBe(false)
  })
})

describe('a signed-in member', () => {
  beforeEach(() => viewer(MEMBER))

  it('manages their own account and may draft the free-first entities, but not a practice', async () => {
    const caps = await getGlobalCapabilities()
    expect(caps.has('account.manage')).toBe(true)
    expect(caps.has('event.create')).toBe(true)
    expect(caps.has('circle.create')).toBe(true)
    expect(caps.has('journey.create')).toBe(true)
    expect(caps.has('practice.create')).toBe(false)
    expect(caps.has('admin.access')).toBe(false)
  })

  it('posts in a circle they are an active member of, and the membership read is scoped to them', async () => {
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    reply('memberships', { data: { status: 'active', volunteer_role: null } })
    const caps = await getCircleCapabilities('c1')
    expect(caps.has('circle.view')).toBe(true)
    expect(caps.has('circle.post')).toBe(true)
    expect(caps.has('circle.editSettings')).toBe(false)
    expect(caps.has('circle.manageRoles')).toBe(false)
    expect(chainOf(reads('circles')[0])).toEqual(['select("host_id, hub_id")', 'eq("id","c1")', 'maybeSingle()'])
    expect(chainOf(reads('memberships')[0])).toEqual([
      'select("status, volunteer_role")',
      'eq("circle_id","c1")',
      'eq("profile_id","p-member")',
      'maybeSingle()',
    ])
  })

  it('a circle Admin by volunteer_role manages the circle but never its roles', async () => {
    // The stored value for the Admin rung is 'guide' (lib/core/circle-roles.ts, ADR-1014); a
    // literal 'admin' in the column is unrecognised and reads as a plain Member, fail-closed.
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    reply('memberships', { data: { status: 'active', volunteer_role: 'guide' } })
    const caps = await getCircleCapabilities('c1')
    expect(caps.has('circle.editSettings')).toBe(true)
    expect(caps.has('circle.broadcast')).toBe(true)
    expect(caps.has('circle.manageRoles')).toBe(false)
  })

  it('a departed Admin keeps nothing: the stored role only counts on an ACTIVE membership', async () => {
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    reply('memberships', { data: { status: 'left', volunteer_role: 'guide' } })
    const caps = await getCircleCapabilities('c1')
    expect(caps.has('circle.post')).toBe(false)
    expect(caps.has('circle.editSettings')).toBe(false)
  })

  it('a free member never triggers the open-task count; a Crew member does and gets the task caps', async () => {
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    reply('memberships', { data: { status: 'active', volunteer_role: null } })
    const free = await getCircleCapabilities('c1')
    expect(free.has('task.volunteer')).toBe(false)
    expect(reads('crew_tasks')).toEqual([])

    viewer(profile({ id: 'p-member', membershipTier: 'crew', realMembershipTier: 'crew' }))
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    reply('memberships', { data: { status: 'active', volunteer_role: null } })
    reply('crew_tasks', { count: 2 })
    const crew = await getCircleCapabilities('c1')
    expect(crew.has('task.volunteer')).toBe(true)
    expect(crew.has('task.claim')).toBe(true)
    expect(chainOf(reads('crew_tasks')[0])).toContain('eq("circle_id","c1")')
  })

  it('edits the draft they posted, and loses that the moment it is published', async () => {
    reply('events', { data: { host_id: null, scope_type: 'public', scope_id: null, space_id: null, posted_by_profile_id: 'p-member', status: 'draft' } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(true)

    reply('events', { data: { host_id: null, scope_type: 'public', scope_id: null, space_id: null, posted_by_profile_id: 'p-member', status: 'published' } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(false)
  })

  it('edits their own profile, and a Spotlight only once the owner has enabled it', async () => {
    reply('profiles', { data: { meta: {} } })
    const own = await getProfileCapabilities('p-member')
    expect(own.has('profile.edit')).toBe(true)
    expect(own.has('spotlight.manage')).toBe(false)

    reply('profiles', { data: { meta: { spotlight: { enabled: true } } } })
    expect((await getProfileCapabilities('p-member')).has('spotlight.manage')).toBe(true)

    reply('profiles', { data: { meta: { spotlight: { enabled: true } } } })
    expect((await getProfileCapabilities('p-other')).has('profile.edit')).toBe(false)
  })
})

describe('a host', () => {
  beforeEach(() => viewer(HOST))

  it('leads the circle whose host_id is theirs: settings, broadcast and roles', async () => {
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    const caps = await getCircleCapabilities('c1')
    expect(caps.has('circle.editSettings')).toBe(true)
    expect(caps.has('circle.broadcast')).toBe(true)
    expect(caps.has('circle.manageRoles')).toBe(true)
    expect(caps.has('circle.post')).toBe(true)
  })

  it('edits the event, practice and journey they own, and may create a practice on the Crew tier', async () => {
    reply('events', { data: { host_id: 'p-host', scope_type: 'public', scope_id: null, space_id: null, posted_by_profile_id: null, status: 'published' } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(true)
    reply('practices', { data: { created_by: 'p-host' } })
    expect((await getPracticeCapabilities('pr1')).has('practice.editSettings')).toBe(true)
    reply('journey_plans', { data: { author_id: 'p-host' } })
    expect((await getJourneyCapabilities('j1')).has('journey.editSettings')).toBe(true)
    expect((await getGlobalCapabilities()).has('practice.create')).toBe(true)
  })

  it('runs the events of the circle they run (scope delegation), without being the event host', async () => {
    reply('events', { data: { host_id: 'p-other', scope_type: 'circle', scope_id: 'c1', space_id: null, posted_by_profile_id: null, status: 'published' } })
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(true)
    expect(chainOf(reads('circles')[0])).toContain('eq("id","c1")')
  })

  it('runs a space event only when the Space seam says they may edit that Space', async () => {
    reply('events', { data: { host_id: 'p-other', scope_type: 'public', scope_id: null, space_id: 's1', posted_by_profile_id: null, status: 'published' } })
    reply('spaces', { data: { id: 's1', owner_profile_id: 'p-owner' } })
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: true } as never)
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(true)
    expect(vi.mocked(getSpaceCapabilities)).toHaveBeenCalledWith({ id: 's1', ownerProfileId: 'p-owner' }, 'p-host')

    reply('events', { data: { host_id: 'p-other', scope_type: 'public', scope_id: null, space_id: 's1', posted_by_profile_id: null, status: 'published' } })
    reply('spaces', { data: { id: 's1', owner_profile_id: 'p-owner' } })
    vi.mocked(getSpaceCapabilities).mockResolvedValue({ canEditProfile: false } as never)
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(false)
  })
})

describe('platform staff', () => {
  it('an admin reaches the Admin tab, manages any circle without a membership, any event, and channels', async () => {
    viewer(STAFF)
    expect((await getGlobalCapabilities()).has('admin.access')).toBe(true)
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    const circle = await getCircleCapabilities('c1')
    expect(circle.has('circle.editSettings')).toBe(true)
    expect(circle.has('circle.manageRoles')).toBe(true)
    reply('events', { data: { host_id: 'p-host', scope_type: 'public', scope_id: null, space_id: null, posted_by_profile_id: null, status: 'published' } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(true)
    expect((await getChannelCapabilities('ch1')).has('channel.manage')).toBe(true)
    // Hub and nexus management are the janitor's, not every admin's.
    reply('hubs', { data: { guide_id: 'p-guide', nexus_id: null } })
    expect((await getHubCapabilities('h1')).has('hub.manage')).toBe(false)
  })

  it('a janitor manages hubs and nexuses they do not lead', async () => {
    viewer(JANITOR)
    reply('hubs', { data: { guide_id: 'p-guide', nexus_id: 'n1' } })
    expect((await getHubCapabilities('h1')).has('hub.manage')).toBe(true)
    reply('nexuses', { data: { mentor_id: 'p-mentor' } })
    expect((await getNexusCapabilities('n1')).has('nexus.manage')).toBe(true)
  })
})

describe('the parent walk', () => {
  it('a guide who leads the circle\'s hub manages the circle, and the hub is read to confirm it', async () => {
    viewer(GUIDE)
    reply('circles', { data: { host_id: 'p-host', hub_id: 'h1' } })
    reply('hubs', { data: { guide_id: 'p-guide', nexus_id: null } })
    const caps = await getCircleCapabilities('c1')
    expect(caps.has('circle.editSettings')).toBe(true)
    expect(caps.has('circle.manageRoles')).toBe(true)
    expect(chainOf(reads('hubs')[0])).toContain('eq("id","h1")')
  })

  it('a guide who leads a DIFFERENT hub gets nothing on this circle', async () => {
    viewer(GUIDE)
    reply('circles', { data: { host_id: 'p-host', hub_id: 'h1' } })
    reply('hubs', { data: { guide_id: 'p-someone-else', nexus_id: null } })
    expect((await getCircleCapabilities('c1')).has('circle.editSettings')).toBe(false)
  })

  it('a plain member never triggers the hub read at all', async () => {
    viewer(MEMBER)
    reply('circles', { data: { host_id: 'p-host', hub_id: 'h1' } })
    await getCircleCapabilities('c1')
    expect(reads('hubs')).toEqual([])
  })
})

describe('a read error fails closed', () => {
  // The loader destructures `data` alone and never reads `error` (the house rule says to). Its
  // safety today is that supabase-js resolves `data: null` beside an error, and a null row grants
  // nothing. These pin that consequence so a future edit that widens on a missing row shows up.
  it('an errored circle read leaves even the host with view only, and does not throw', async () => {
    viewer(HOST)
    reply('circles', { data: null, error: { message: 'connection reset' } })
    const caps = await getCircleCapabilities('c1')
    expect([...caps]).toEqual(['circle.view'])
  })

  it('an errored event read grants the host nothing, and never falls back to the poster', async () => {
    viewer(HOST)
    reply('events', { data: null, error: { message: 'permission denied' } })
    expect((await getEventCapabilities('e1')).has('event.editSettings')).toBe(false)
  })

  it('an errored hub read during the parent walk grants the guide nothing', async () => {
    viewer(GUIDE)
    reply('circles', { data: { host_id: 'p-host', hub_id: 'h1' } })
    reply('hubs', { data: null, error: { message: 'timeout' } })
    expect((await getCircleCapabilities('c1')).has('circle.editSettings')).toBe(false)
  })
})

describe('loadCapabilitiesForScope dispatches, and fails closed on what it cannot resolve', () => {
  beforeEach(() => viewer(HOST))

  it('null, a missing id, and a Space scope all yield an empty set without a read', async () => {
    expect([...(await loadCapabilitiesForScope(null))]).toEqual([])
    expect([...(await loadCapabilitiesForScope({ kind: 'circle' }))]).toEqual([])
    expect([...(await loadCapabilitiesForScope({ kind: 'space', id: 's1' }))]).toEqual([])
    expect(calls).toEqual([])
  })

  it('routes each kind to its resolver', async () => {
    expect((await loadCapabilitiesForScope({ kind: 'global' })).has('account.manage')).toBe(true)
    reply('circles', { data: { host_id: 'p-host', hub_id: null } })
    expect((await loadCapabilitiesForScope({ kind: 'circle', id: 'c1' })).has('circle.editSettings')).toBe(true)
    reply('events', { data: { host_id: 'p-host', scope_type: 'public', scope_id: null, space_id: null, posted_by_profile_id: null, status: 'published' } })
    expect((await loadCapabilitiesForScope({ kind: 'event', id: 'e1' })).has('event.editSettings')).toBe(true)
    reply('profiles', { data: { meta: {} } })
    expect((await loadCapabilitiesForScope({ kind: 'profile', id: 'p-host' })).has('profile.edit')).toBe(true)
  })
})
