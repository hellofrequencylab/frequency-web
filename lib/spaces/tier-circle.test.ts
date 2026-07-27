import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// TIER→CIRCLE MEMBERSHIP ACCESS (ADR-859). Two halves are locked here:
//   1. FUNCTIONAL — the provenance rule end to end over a fake admin client: grants stamp
//      granted_by_tier_id, a self-joined row wins untagged, a full circle is a reported miss
//      (never a throw into the membership flow), revoke deletes ONLY tier-granted rows, a tier
//      switch revokes the old grant before the new one, and setTierCircle refuses a circle from
//      another Space.
//   2. SOURCE-SHAPE — every membership lifecycle site calls syncTierCircleAccess (three in
//      memberships.ts, both webhook branches in space-subscriptions.ts) and cancelMembership
//      cancels the Stripe subscription, so a rewrite of a lifecycle site fails here instead of
//      silently stranding circle access.

const SPACE = 'aaaaaaaa-0000-4000-a000-00000000space'
const OTHER_SPACE = 'bbbbbbbb-0000-4000-a000-0000000other'
const TIER_A = 'cccccccc-0000-4000-a000-000000tier-a'
const TIER_B = 'dddddddd-0000-4000-a000-000000tier-b'
const CIRCLE_A = 'eeeeeeee-0000-4000-a000-0000circle-a'
const CIRCLE_B = 'ffffffff-0000-4000-a000-0000circle-b'
const MEMBER = '99999999-0000-4000-a000-000000member'

// ── One tiny fake PostgREST (the circle-space-events.test.ts pattern): in-memory tables,
//    recorded inserts/updates/deletes, and an injectable insert error for the cap trigger. ──────
type Row = Record<string, unknown>
const state = {
  tiers: [] as Row[], // space_membership_tiers
  circles: [] as Row[], // circles
  circleMemberships: [] as Row[], // memberships
  spaceMemberships: [] as Row[], // space_memberships
  inserts: [] as Array<{ table: string; row: Row }>,
  updates: [] as Array<{ table: string; patch: Row; filters: Array<[string, unknown]> }>,
  deletes: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  insertError: null as { code?: string; message?: string } | null,
}

function rowsOf(table: string): Row[] {
  if (table === 'space_membership_tiers') return state.tiers
  if (table === 'circles') return state.circles
  if (table === 'memberships') return state.circleMemberships
  if (table === 'space_memberships') return state.spaceMemberships
  throw new Error(`unexpected table ${table}`)
}

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  let pendingInsert: Row[] | null = null
  let pendingUpdate: Row | null = null
  let pendingDelete = false
  const matching = () =>
    rowsOf(table).filter((r) => filters.every(([col, val]) => r[col] === val))
  const api = {
    select: () => api,
    eq(col: string, val: unknown) {
      filters.push([col, val])
      return api
    },
    limit: () => api,
    insert(rows: Row[]) {
      pendingInsert = rows
      return api
    },
    update(patch: Row) {
      pendingUpdate = patch
      return api
    },
    delete() {
      pendingDelete = true
      return api
    },
    async maybeSingle() {
      return { data: matching()[0] ?? null, error: null }
    },
    then<T>(resolve: (r: { data: Row[] | null; error: unknown }) => T): Promise<T> {
      if (pendingInsert) {
        const rows = pendingInsert
        pendingInsert = null
        if (state.insertError) {
          const error = state.insertError
          state.insertError = null
          return Promise.resolve(resolve({ data: null, error }))
        }
        for (const r of rows) {
          state.inserts.push({ table, row: r })
          rowsOf(table).push({ id: `row-${rowsOf(table).length}`, ...r })
        }
        return Promise.resolve(resolve({ data: null, error: null }))
      }
      if (pendingUpdate) {
        const patch = pendingUpdate
        pendingUpdate = null
        state.updates.push({ table, patch, filters })
        for (const r of matching()) Object.assign(r, patch)
        return Promise.resolve(resolve({ data: null, error: null }))
      }
      if (pendingDelete) {
        pendingDelete = false
        state.deletes.push({ table, filters })
        const doomed = new Set(matching())
        const arr = rowsOf(table)
        for (let i = arr.length - 1; i >= 0; i -= 1) if (doomed.has(arr[i])) arr.splice(i, 1)
        return Promise.resolve(resolve({ data: null, error: null }))
      }
      return Promise.resolve(resolve({ data: matching(), error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('./store', () => ({
  getSpaceById: async (id: string) => ({ id, slug: 'river-studio' }),
}))
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async () => ({ canEditProfile: true, isAdmin: true }),
}))

import { syncTierCircleAccess, setTierCircle, hasActiveSpaceMembership } from './tier-circle'

beforeEach(() => {
  state.tiers = [
    { id: TIER_A, space_id: SPACE, circle_id: CIRCLE_A },
    { id: TIER_B, space_id: SPACE, circle_id: CIRCLE_B },
  ]
  state.circles = [
    { id: CIRCLE_A, space_id: SPACE },
    { id: CIRCLE_B, space_id: SPACE },
  ]
  state.circleMemberships = []
  state.spaceMemberships = []
  state.inserts = []
  state.updates = []
  state.deletes = []
  state.insertError = null
})

describe('syncTierCircleAccess: grant (the provenance stamp)', () => {
  it('(a) inserts an active circle row stamped granted_by_tier_id', async () => {
    const res = await syncTierCircleAccess({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: TIER_A,
      action: 'grant',
    })
    expect(res.granted).toBe(true)
    const ins = state.inserts.find((i) => i.table === 'memberships')
    expect(ins).toBeDefined()
    expect(ins!.row).toEqual({
      circle_id: CIRCLE_A,
      profile_id: MEMBER,
      status: 'active',
      granted_by_tier_id: TIER_A,
    })
  })

  it('(b) is a no-op when an ACTIVE row already exists (a self-joined row stays untagged)', async () => {
    state.circleMemberships.push({
      id: 'self-1',
      circle_id: CIRCLE_A,
      profile_id: MEMBER,
      status: 'active',
      granted_by_tier_id: null,
    })
    const res = await syncTierCircleAccess({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: TIER_A,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'already_member' })
    // Nothing written: no insert, no provenance retag of the member's own row.
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(0)
    expect(state.circleMemberships[0].granted_by_tier_id).toBeNull()
  })

  it('(a2) an unlinked tier is the normal no-op (no circle, nothing granted)', async () => {
    state.tiers = [{ id: TIER_A, space_id: SPACE, circle_id: null }]
    const res = await syncTierCircleAccess({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: TIER_A,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'no_circle' })
    expect(state.inserts).toHaveLength(0)
  })

  it('(c) catches the cap trigger circle_full (P0001): reports the miss, never throws', async () => {
    state.insertError = { code: 'P0001', message: 'circle_full' }
    await expect(
      syncTierCircleAccess({ spaceId: SPACE, profileId: MEMBER, tierId: TIER_A, action: 'grant' }),
    ).resolves.toEqual({ granted: false, reason: 'circle_full' })
  })
})

describe('syncTierCircleAccess: revoke (the provenance rule)', () => {
  it('(d) deletes ONLY the rows this tier granted, never a self-joined row', async () => {
    state.circleMemberships.push(
      {
        id: 'granted-1',
        circle_id: CIRCLE_A,
        profile_id: MEMBER,
        status: 'active',
        granted_by_tier_id: TIER_A,
      },
      {
        id: 'self-1',
        circle_id: CIRCLE_B,
        profile_id: MEMBER,
        status: 'active',
        granted_by_tier_id: null,
      },
    )
    const res = await syncTierCircleAccess({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: TIER_A,
      action: 'revoke',
    })
    expect(res.reason).toBe('revoked')
    // The delete is scoped by member AND provenance, nothing broader.
    const del = state.deletes.find((d) => d.table === 'memberships')
    expect(del!.filters).toEqual(
      expect.arrayContaining([
        ['profile_id', MEMBER],
        ['granted_by_tier_id', TIER_A],
      ]),
    )
    expect(state.circleMemberships.map((r) => r.id)).toEqual(['self-1'])
  })

  it('(e) a tier switch revokes the OLD tier grant and grants the new circle', async () => {
    state.circleMemberships.push({
      id: 'granted-a',
      circle_id: CIRCLE_A,
      profile_id: MEMBER,
      status: 'active',
      granted_by_tier_id: TIER_A,
    })
    const res = await syncTierCircleAccess({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: TIER_B,
      previousTierId: TIER_A,
      action: 'grant',
    })
    expect(res.granted).toBe(true)
    expect(state.circleMemberships).toHaveLength(1)
    expect(state.circleMemberships[0]).toMatchObject({
      circle_id: CIRCLE_B,
      profile_id: MEMBER,
      granted_by_tier_id: TIER_B,
    })
  })
})

describe('setTierCircle (the operator action core)', () => {
  it('(f) refuses a circle from another space (and writes nothing)', async () => {
    state.circles.push({ id: 'circle-x', space_id: OTHER_SPACE })
    const res = await setTierCircle(SPACE, TIER_A, 'circle-x', 'operator-1')
    expect('error' in res).toBe(true)
    expect(state.updates).toHaveLength(0)
    expect(state.tiers.find((t) => t.id === TIER_A)!.circle_id).toBe(CIRCLE_A)
  })

  it('refuses a tier from another space', async () => {
    state.tiers.push({ id: 'tier-x', space_id: OTHER_SPACE, circle_id: null })
    const res = await setTierCircle(SPACE, 'tier-x', CIRCLE_A, 'operator-1')
    expect('error' in res).toBe(true)
    expect(state.updates).toHaveLength(0)
  })

  it('LINK runs the initial sweep: every current active tier member is granted', async () => {
    state.tiers = [{ id: TIER_A, space_id: SPACE, circle_id: null }]
    state.spaceMemberships.push(
      { id: 'sm1', space_id: SPACE, member_profile_id: 'p1', tier_id: TIER_A, status: 'active' },
      { id: 'sm2', space_id: SPACE, member_profile_id: 'p2', tier_id: TIER_A, status: 'active' },
      { id: 'sm3', space_id: SPACE, member_profile_id: 'p3', tier_id: TIER_A, status: 'waitlist' },
    )
    const res = await setTierCircle(SPACE, TIER_A, CIRCLE_A, 'operator-1')
    expect(res).toEqual({ data: { granted: 2, full: 0 } })
    expect(state.tiers[0].circle_id).toBe(CIRCLE_A)
    // Only the ACTIVE members were swept in, each with provenance.
    const grantedTo = state.circleMemberships.map((r) => r.profile_id).sort()
    expect(grantedTo).toEqual(['p1', 'p2'])
    expect(state.circleMemberships.every((r) => r.granted_by_tier_id === TIER_A)).toBe(true)
  })

  it('RE-LINK revokes the tier-granted rows from the old circle first', async () => {
    state.circleMemberships.push(
      {
        id: 'granted-1',
        circle_id: CIRCLE_A,
        profile_id: 'p1',
        status: 'active',
        granted_by_tier_id: TIER_A,
      },
      {
        id: 'self-1',
        circle_id: CIRCLE_A,
        profile_id: 'p2',
        status: 'active',
        granted_by_tier_id: null,
      },
    )
    state.spaceMemberships.push({
      id: 'sm1',
      space_id: SPACE,
      member_profile_id: 'p1',
      tier_id: TIER_A,
      status: 'active',
    })
    const res = await setTierCircle(SPACE, TIER_A, CIRCLE_B, 'operator-1')
    expect('data' in res).toBe(true)
    // p1 moved (old grant revoked, new circle granted); p2's self-join in the old circle survives.
    expect(state.circleMemberships.map((r) => [r.profile_id, r.circle_id]).sort()).toEqual([
      ['p1', CIRCLE_B],
      ['p2', CIRCLE_A],
    ])
  })
})

describe('hasActiveSpaceMembership (the canonical reader)', () => {
  it('true for an active row; the optional tier filter narrows it', async () => {
    state.spaceMemberships.push({
      id: 'sm1',
      space_id: SPACE,
      member_profile_id: MEMBER,
      tier_id: TIER_A,
      status: 'active',
    })
    expect(await hasActiveSpaceMembership(SPACE, MEMBER)).toBe(true)
    expect(await hasActiveSpaceMembership(SPACE, MEMBER, TIER_A)).toBe(true)
    expect(await hasActiveSpaceMembership(SPACE, MEMBER, TIER_B)).toBe(false)
    expect(await hasActiveSpaceMembership(OTHER_SPACE, MEMBER)).toBe(false)
  })
})

describe('(g) every membership lifecycle site is wired (source shape)', () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it('memberships.ts syncs at all three sites: joinTier, promoteMembership, cancelMembership', () => {
    const src = read('lib/spaces/memberships.ts')
    expect(src.match(/syncTierCircleAccess\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('space-subscriptions.ts syncs on BOTH webhook branches (update and first-payment insert)', () => {
    const src = read('lib/billing/space-subscriptions.ts')
    expect(src.match(/syncTierCircleAccess\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('cancelMembership stops the Stripe subscription (or the next webhook re-grants access)', () => {
    const src = read('lib/spaces/memberships.ts')
    expect(src).toContain('subscriptions.cancel')
  })
})
