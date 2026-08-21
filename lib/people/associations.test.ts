import { describe, it, expect, vi, beforeEach } from 'vitest'

// The associations panel's VISIBILITY MATRIX (ADR-895).
//
// The thing under test is not "does it return rows" — it is "does the same member's page say the
// same thing to a stranger, a signed-in member, a friend and a janitor, and only more to the owner".
// Tier A is viewer-INDEPENDENT by construction (`readBuilt` takes no viewer argument), and this file
// is what proves the construction survives a refactor: if anyone threads a viewer into tier A, the
// byte-identical assertions below go red.
//
// The predicates themselves are pinned separately, as SOURCE TEXT, in
// components/profile/profile-associations-wiring.test.ts — no behavioural test over a fake PostgREST
// can prove a filter was not deleted, because the fake honours whatever filters it is handed.

const VIEWER = 'viewer-0000-4000-a000-000000000001'
const FRIEND = 'friend-0000-4000-a000-000000000002'
const JANITOR = 'janitor-000-4000-a000-000000000003'

// Far enough out that the wall-clock floor can never overtake it, so the Events fold is exercised
// for real rather than filtered away by the clock.
const FUTURE = '2099-06-01T18:00:00.000Z'
const FUTURE_2 = '2099-06-08T18:00:00.000Z'
const FUTURE_3 = '2099-06-15T18:00:00.000Z'

type Recorded = { table: string; select: string; filters: Array<[string, string, unknown]> }
const queries: Recorded[] = []
/** Tables the fake should answer with a PostgREST error, so the per-read fail-safe is exercised. */
const failing = new Set<string>()

// One tiny fake PostgREST. It records every filter it is handed (so a test can assert a read was
// NOT issued at all) and answers from fixtures chosen by table + select shape.
function builder(table: string) {
  const rec: Recorded = { table, select: '', filters: [] }
  let count: 'exact' | null = null

  const has = (col: string) => rec.filters.some((f) => f[1] === col)

  function rows(): Record<string, unknown>[] {
    if (table === 'circles') {
      // Tier B / tier C read circles by id; tier A reads them by host.
      if (has('host_id')) {
        return [
          { id: 'c-host-1', name: 'Cold Plunge', slug: 'cold-plunge' },
          { id: 'c-host-2', name: 'Trail Runs', slug: 'trail-runs' },
        ]
      }
      return [{ id: 'c2', name: 'Sunrise Swim', slug: 'sunrise-swim' }]
    }
    if (table === 'spaces') return [{ id: 's1', name: 'Wayfarer', slug: 'wayfarer' }]
    if (table === 'events') {
      // A weekly series (anchor + two children) plus one one-off. The fold must report TWO
      // gatherings, not four dates.
      return [
        { id: 'e1', title: 'Cowork', slug: 'cowork', starts_at: FUTURE, is_cancelled: false, recurrence_type: 'weekly', recurrence_until: null, parent_event_id: null },
        { id: 'e2', title: 'Cowork', slug: 'cowork-2', starts_at: FUTURE_2, is_cancelled: false, recurrence_type: 'none', recurrence_until: null, parent_event_id: 'e1' },
        { id: 'e3', title: 'Cowork', slug: 'cowork-3', starts_at: FUTURE_3, is_cancelled: false, recurrence_type: 'none', recurrence_until: null, parent_event_id: 'e1' },
        { id: 'e9', title: 'Repair Cafe', slug: 'repair-cafe', starts_at: FUTURE, is_cancelled: false, recurrence_type: 'none', recurrence_until: null, parent_event_id: null },
      ]
    }
    if (table === 'journey_plans') return []
    if (table === 'practices') return [{ id: 'p1', title: 'Box Breathing', slug: 'box-breathing' }]
    if (table === 'market_listings') return []
    if (table === 'memberships') {
      // Tier C joins the circle row; tiers B reads bare ids.
      if (rec.select.includes('circles')) {
        return [{ circles: { id: 'c2', name: 'Sunrise Swim', slug: 'sunrise-swim' } }]
      }
      const who = rec.filters.find((f) => f[1] === 'profile_id')?.[2]
      if (typeof who === 'string' && who.startsWith('target')) {
        return [{ circle_id: 'c1' }, { circle_id: 'c2' }, { circle_id: 'c3' }]
      }
      return [{ circle_id: 'c2' }, { circle_id: 'c9' }]
    }
    if (table === 'topical_channel_memberships') {
      return [{ topical_channels: { id: 'ch1', name: 'Cold Water' } }]
    }
    if (table === 'space_members') {
      return [{ spaces: { id: 's7', name: 'Harbor Studio', slug: 'harbor-studio' } }]
    }
    if (table === 'journey_enrollments') {
      return [{ journey_plans: { id: 'j5', title: 'Thirty Mornings', slug: 'thirty-mornings' } }]
    }
    return []
  }

  const settle = () => {
    if (failing.has(table)) return { data: null, error: { message: 'boom' }, count: null }
    const data = rows()
    return { data, error: null, count: count === 'exact' ? data.length : null }
  }

  const api = {
    select(cols: string, opts?: { count?: 'exact' }) {
      rec.select = cols
      if (opts?.count === 'exact') count = 'exact'
      queries.push(rec)
      return api
    },
    eq(col: string, val: unknown) { rec.filters.push(['eq', col, val]); return api },
    neq(col: string, val: unknown) { rec.filters.push(['neq', col, val]); return api },
    in(col: string, val: unknown) { rec.filters.push(['in', col, val]); return api },
    is(col: string, val: unknown) { rec.filters.push(['is', col, val]); return api },
    // The SPACE WALL is a two-arm .or() since 2026-08-20 (null OR the root tenant) — see
    // lib/people/space-wall.test.ts for why the single `is null` arm stopped matching anything.
    or(expr: string) { rec.filters.push(['or', 'space_id', expr]); return api },
    not(col: string, op: string, val: unknown) { rec.filters.push(['not', col, val ?? op]); return api },
    gte(col: string, val: unknown) { rec.filters.push(['gte', col, val]); return api },
    order() { return api },
    limit() { return api },
    then(resolve: (v: ReturnType<typeof settle>) => void) { resolve(settle()) },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

// The panel resolves the root Space once to build the space-wall filter. Pinned to a fixed id here
// so the filter string is deterministic and the assertions below can name it.
const ROOT_SPACE_ID = '00000000-0000-4000-a000-0000000000rt'
vi.mock('@/lib/spaces/store', () => ({
  loadRootSpaceId: async () => ROOT_SPACE_ID,
}))

import { getProfileAssociations } from './associations'

// A fresh target per case: `readBuilt` is request-cached on the profile id, and reusing one id would
// let a memoised first answer hide a second caller's queries.
let n = 0
const nextTarget = () => `target-000-4000-a000-00000000000${++n}`

beforeEach(() => {
  queries.length = 0
  failing.clear()
})

const tables = () => queries.map((q) => q.table)

describe('tier A — what a member built (viewer-independent)', () => {
  it('counts a repeating series ONCE, not once per date', async () => {
    const { built } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: null, isOwner: false,
    })
    const events = built.find((b) => b.kind === 'events')!
    // Four rows in, two gatherings out: the weekly Cowork plus the one-off Repair Cafe.
    expect(events.count).toBe(2)
    expect(events.peek.map((p) => p.href)).toEqual(['/events/cowork', '/events/repair-cafe'])
    expect(events.approximate).toBe(false)
  })

  it('reads the six kinds in a fixed order and links every one somewhere real', async () => {
    const { built } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: null, isOwner: false,
    })
    expect(built.map((b) => b.kind)).toEqual([
      'circles', 'spaces', 'events', 'journeys', 'practices', 'classifieds',
    ])
    for (const stat of built) {
      for (const item of stat.peek) expect(item.href.startsWith('/')).toBe(true)
    }
    // The Spaces peek must NOT point at /spaces, which has no page.tsx and 404s.
    const spaces = built.find((b) => b.kind === 'spaces')!
    expect(spaces.peek[0]!.href).toBe('/spaces/wayfarer')
  })

  it('is byte-identical for a stranger, a signed-in member, a friend, the owner and a janitor', async () => {
    const stranger = await getProfileAssociations({ profileId: nextTarget(), viewerProfileId: null, isOwner: false })
    const member = await getProfileAssociations({ profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: false })
    const friend = await getProfileAssociations({ profileId: nextTarget(), viewerProfileId: FRIEND, isOwner: false })
    const owner = await getProfileAssociations({ profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: true })
    // A janitor is just a signed-in member as far as this panel is concerned: staff power is not a
    // reason to publish a member's private associations on a page anyone can screenshot.
    const janitor = await getProfileAssociations({ profileId: nextTarget(), viewerProfileId: JANITOR, isOwner: false })

    const a = JSON.stringify(stranger.built)
    expect(JSON.stringify(member.built)).toBe(a)
    expect(JSON.stringify(friend.built)).toBe(a)
    expect(JSON.stringify(owner.built)).toBe(a)
    expect(JSON.stringify(janitor.built)).toBe(a)
  })
})

describe('tier B — circles you are both in', () => {
  it('is absent for a signed-out stranger (no read is even issued)', async () => {
    const { shared } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: null, isOwner: false,
    })
    expect(shared).toBeNull()
    expect(tables()).not.toContain('memberships')
  })

  it('lists only the intersection for a signed-in non-owner', async () => {
    const { shared } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: false,
    })
    // Target is in c1/c2/c3, viewer in c2/c9 — only c2 is shared.
    expect(shared).toEqual([{ id: 'c2', label: 'Sunrise Swim', href: '/circles/sunrise-swim' }])
    const byId = queries.find((q) => q.table === 'circles' && q.filters.some((f) => f[1] === 'id'))!
    expect(byId.filters.find((f) => f[1] === 'id')![2]).toEqual(['c2'])
  })

  it('re-filters the circle ROWS by status, because a readable membership is not a readable circle', async () => {
    await getProfileAssociations({ profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: false })
    const byId = queries.find((q) => q.table === 'circles' && q.filters.some((f) => f[1] === 'id'))!
    expect(byId.filters.find((f) => f[1] === 'status')![2]).toEqual(['forming', 'active', 'inactive'])
  })

  it('is withheld from a BLOCKED viewer, and no viewer-scoped read runs', async () => {
    const { shared } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: false, blocked: true,
    })
    expect(shared).toBeNull()
    expect(tables()).not.toContain('memberships')
  })

  it('is not shown to the owner on their own page (tier C is the owner answer)', async () => {
    const { shared } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: true,
    })
    expect(shared).toBeNull()
  })
})

describe('tier C — the owner-only picture', () => {
  it('never runs its reads for a non-owner, not even a janitor', async () => {
    const { mine } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: JANITOR, isOwner: false,
    })
    expect(mine).toBeNull()
    // The gate is BEFORE the read, not before the render: an owner-only read that runs for a
    // stranger and is then discarded is one refactor away from being rendered.
    for (const t of ['topical_channel_memberships', 'space_members', 'journey_enrollments']) {
      expect(tables()).not.toContain(t)
    }
  })

  it('gives the owner their own circles, channels, seats and journeys', async () => {
    const { mine } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: true,
    })
    expect(mine!.map((g) => g.key)).toEqual(['circles', 'channels', 'spaces', 'journeys'])
    expect(mine!.find((g) => g.key === 'channels')!.items[0]).toEqual({
      id: 'ch1', label: 'Cold Water', href: '/channels/ch1',
    })
  })
})

describe('fail-safe', () => {
  it('distinguishes EMPTY from FAILED: a real zero is 0, a broken read is null', async () => {
    const clean = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: null, isOwner: false,
    })
    // Journeys and Classifieds legitimately return no rows here, so they must read 0.
    expect(clean.built.find((b) => b.kind === 'journeys')!.count).toBe(0)
    expect(clean.built.find((b) => b.kind === 'classifieds')!.count).toBe(0)

    failing.add('practices')
    const broken = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: null, isOwner: false,
    })
    // NULL IS NOT ZERO. Rendering 0 here would publish a false statement about the member
    // ("publishes no Practices") off a transient DB hiccup; the UI omits a null tile instead.
    expect(broken.built.find((b) => b.kind === 'practices')!.count).toBeNull()
    // ...and the other five are untouched, so one bad table never takes the panel down.
    expect(broken.built.find((b) => b.kind === 'circles')!.count).toBe(2)
    expect(broken.built.find((b) => b.kind === 'events')!.count).toBe(2)
  })

  it('a broken tier-B read degrades to an empty list, not a thrown page', async () => {
    failing.add('memberships')
    const { shared, built } = await getProfileAssociations({
      profileId: nextTarget(), viewerProfileId: VIEWER, isOwner: false,
    })
    expect(shared).toEqual([])
    expect(built.find((b) => b.kind === 'circles')!.count).toBe(2)
  })
})
