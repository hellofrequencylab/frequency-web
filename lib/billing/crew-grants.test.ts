// CREW GRANTED BY A PAID COMMUNITY MEMBERSHIP (LIVE-223).
//
// Three halves are locked here (the third is the one that keeps this honest):
//   1. FUNCTIONAL — the provenance rule end to end over a fake admin client: a paid member resolves
//      `crew`, cancelling revokes it, a Stripe-paying member is never downgraded by grant logic, a
//      free tier grants nothing, and a Space owner or admin is not grantable by their own tier.
//   2. RESOLUTION — the effective tier is the UNION `stripe_active OR EXISTS(active grant)`, and the
//      grant is additive: it can raise a tier, never lower one.
//   3. SOURCE SHAPE — the grant rides `syncTierCircleAccess`, the one seam every membership
//      lifecycle site already calls, and the sixth site (tier deleted) is wired in the schema as
//      ON DELETE CASCADE. A rewrite that strands the grant fails here.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SPACE = 'aaaaaaaa-0000-4000-a000-00000000space'
const OTHER_SPACE = 'bbbbbbbb-0000-4000-a000-0000000other'
const PAID_TIER = 'cccccccc-0000-4000-a000-00000paid-t'
const FREE_TIER = 'dddddddd-0000-4000-a000-00000free-t'
const OTHER_TIER = 'eeeeeeee-0000-4000-a000-0000other-t'
const MEMBER = '99999999-0000-4000-a000-000000member'
const OWNER = '11111111-0000-4000-a000-0000000owner'
const ADMIN = '22222222-0000-4000-a000-0000000admin'

// ── One tiny fake PostgREST (the tier-circle.test.ts pattern): in-memory tables, recorded writes,
//    and an injectable error per table so the fail-closed / fail-soft directions can be exercised.
type Row = Record<string, unknown>
const state = {
  grants: [] as Row[], // entitlement_grants
  tiers: [] as Row[], // space_membership_tiers
  spaces: [] as Row[], // spaces
  members: [] as Row[], // space_members
  inserts: [] as Array<{ table: string; row: Row }>,
  deletes: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  readError: null as string | null, // table name whose SELECT should error
  insertError: null as { code?: string; message?: string } | null,
}

function rowsOf(table: string): Row[] {
  if (table === 'entitlement_grants') return state.grants
  if (table === 'space_membership_tiers') return state.tiers
  if (table === 'spaces') return state.spaces
  if (table === 'space_members') return state.members
  throw new Error(`unexpected table ${table}`)
}

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  let pendingInsert: Row[] | null = null
  let pendingDelete = false
  const matching = () => rowsOf(table).filter((r) => filters.every(([c, v]) => r[c] === v))
  const err = () => (state.readError === table ? { message: `${table} read boom` } : null)
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
    delete() {
      pendingDelete = true
      return api
    },
    async maybeSingle() {
      const error = err()
      if (error) return { data: null, error }
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
          // Model the (profile_id, granted_by_tier_id) unique index.
          const clash = state.grants.some(
            (g) =>
              table === 'entitlement_grants' &&
              g.profile_id === r.profile_id &&
              g.granted_by_tier_id === r.granted_by_tier_id,
          )
          if (clash) {
            return Promise.resolve(resolve({ data: null, error: { code: '23505' } }))
          }
          state.inserts.push({ table, row: r })
          rowsOf(table).push({ id: `row-${rowsOf(table).length}`, ...r })
        }
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
      const error = err()
      if (error) return Promise.resolve(resolve({ data: null, error }))
      return Promise.resolve(resolve({ data: matching(), error: null }))
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import {
  syncCrewEntitlement,
  hasActiveCrewGrant,
  effectiveTierFor,
  crewGrantProvenance,
  isSpaceOperator,
} from './crew-grants'
import { resolveEffectiveTier } from '@/lib/core/entitlement'

beforeEach(() => {
  state.grants = []
  state.tiers = [
    { id: PAID_TIER, space_id: SPACE, price_cents: 100 }, // a $1 tier: any price grants Crew
    { id: FREE_TIER, space_id: SPACE, price_cents: 0 },
    { id: OTHER_TIER, space_id: OTHER_SPACE, price_cents: 4400 },
  ]
  state.spaces = [
    { id: SPACE, owner_profile_id: OWNER },
    { id: OTHER_SPACE, owner_profile_id: 'someone-else' },
  ]
  state.members = [{ space_id: SPACE, profile_id: ADMIN, role: 'admin', status: 'active' }]
  state.inserts = []
  state.deletes = []
  state.readError = null
  state.insertError = null
  // hasActiveCrewGrant is React-cache memoized per profile id; clear it between cases.
  vi.resetModules()
})

/** The grant read is request-cached, so each assertion reads the rows directly instead. */
const grantsFor = (profileId: string) => state.grants.filter((g) => g.profile_id === profileId)

describe('a paid member resolves crew', () => {
  it('a paid tier at ANY price grants Crew, with provenance', async () => {
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: true, reason: 'granted' })
    expect(grantsFor(MEMBER)).toHaveLength(1)
    expect(grantsFor(MEMBER)[0]).toMatchObject({
      profile_id: MEMBER,
      tier: 'crew',
      source: 'space_membership',
      space_id: SPACE,
      granted_by_tier_id: PAID_TIER, // THE provenance stamp
    })
  })

  it('and the effective tier the app reads is crew', async () => {
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    const effective = await effectiveTierFor(MEMBER, 'free')
    expect(effective.tier).toBe('crew')
    // ...while the BILLED rung is untouched. This is the LIVE-224 seam.
    expect(effective.stripeTier).toBe('free')
    expect(effective.granted).toBe(true)
  })

  it('re-running the grant is idempotent (the unique index, swallowed)', async () => {
    const input = { spaceId: SPACE, profileId: MEMBER, tierId: PAID_TIER, action: 'grant' as const }
    await syncCrewEntitlement(input)
    const again = await syncCrewEntitlement(input)
    expect(again).toEqual({ granted: false, reason: 'already_granted' })
    expect(grantsFor(MEMBER)).toHaveLength(1)
  })

  it('never writes profiles.membership_tier - the grant is its own row', () => {
    expect(state.inserts.every((i) => i.table !== 'profiles')).toBe(true)
    const src = readFileSync(join(__dirname, 'crew-grants.ts'), 'utf8')
    expect(src).not.toContain("from('profiles')")
    expect(src).not.toContain('membership_tier:')
  })
})

describe('cancelling the membership revokes it', () => {
  it('revoke deletes the grant and the tier resolves free again', async () => {
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(grantsFor(MEMBER)).toHaveLength(1)

    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'revoke',
    })
    expect(res).toEqual({ granted: false, reason: 'revoked' })
    expect(grantsFor(MEMBER)).toHaveLength(0)
    expect(resolveEffectiveTier('free', false).tier).toBe('free')
  })

  it('revoke filters on PROVENANCE, so another community grant survives', async () => {
    state.grants.push(
      { id: 'g1', profile_id: MEMBER, tier: 'crew', granted_by_tier_id: PAID_TIER, space_id: SPACE },
      {
        id: 'g2',
        profile_id: MEMBER,
        tier: 'crew',
        granted_by_tier_id: OTHER_TIER,
        space_id: OTHER_SPACE,
      },
    )
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'revoke',
    })
    expect(grantsFor(MEMBER).map((g) => g.granted_by_tier_id)).toEqual([OTHER_TIER])
    // The delete named both the member AND the tier: never a blanket "delete this member's grants".
    const del = state.deletes.find((d) => d.table === 'entitlement_grants')
    expect(del?.filters).toEqual([
      ['profile_id', MEMBER],
      ['granted_by_tier_id', PAID_TIER],
    ])
  })

  it('a tier SWITCH revokes the old grant before granting the new one', async () => {
    state.tiers.push({ id: 'tier-b', space_id: SPACE, price_cents: 900 })
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: 'tier-b',
      previousTierId: PAID_TIER,
      action: 'grant',
    })
    expect(grantsFor(MEMBER).map((g) => g.granted_by_tier_id)).toEqual(['tier-b'])
  })
})

describe('a Stripe-paying member is NEVER downgraded by grant logic', () => {
  it('the union is additive: a crew column stays crew with or without a grant', () => {
    expect(resolveEffectiveTier('crew', false).tier).toBe('crew')
    expect(resolveEffectiveTier('crew', true).tier).toBe('crew')
    // ...and revoking a grant they never had changes nothing.
    expect(resolveEffectiveTier('crew', false).stripeTier).toBe('crew')
  })

  it('a revoke touches only entitlement_grants, never profiles', async () => {
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'revoke',
    })
    expect(state.deletes.every((d) => d.table === 'entitlement_grants')).toBe(true)
  })

  it('effectiveTierFor short-circuits for a Stripe crew (no grant read at all)', async () => {
    const effective = await effectiveTierFor(MEMBER, 'crew')
    expect(effective).toEqual({ stripeTier: 'crew', granted: false, tier: 'crew' })
  })
})

describe('a Space owner is not granted Crew by their own tier', () => {
  it('refuses the Space OWNER', async () => {
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: OWNER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'self_grant' })
    expect(grantsFor(OWNER)).toHaveLength(0)
  })

  it('refuses a Space ADMIN', async () => {
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: ADMIN,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'self_grant' })
    expect(grantsFor(ADMIN)).toHaveLength(0)
  })

  it('clears a grant that predates the promotion', async () => {
    state.grants.push({
      id: 'stale',
      profile_id: ADMIN,
      tier: 'crew',
      granted_by_tier_id: PAID_TIER,
      space_id: SPACE,
    })
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: ADMIN,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(grantsFor(ADMIN)).toHaveLength(0)
  })

  it('still grants an ordinary member, and an admin of ANOTHER space', async () => {
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(grantsFor(MEMBER)).toHaveLength(1)
    // ADMIN administers SPACE, not OTHER_SPACE: paying another community's dues still counts.
    const res = await syncCrewEntitlement({
      spaceId: OTHER_SPACE,
      profileId: ADMIN,
      tierId: OTHER_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: true, reason: 'granted' })
  })

  it('isSpaceOperator fails CLOSED when the space read errors', async () => {
    state.readError = 'spaces'
    expect(await isSpaceOperator(SPACE, MEMBER)).toBe(true)
  })

  it('an inactive or lower-ranked space_members row is not an operator', async () => {
    state.members.push(
      { space_id: SPACE, profile_id: 'p-invited', role: 'admin', status: 'invited' },
      { space_id: SPACE, profile_id: 'p-editor', role: 'editor', status: 'active' },
    )
    expect(await isSpaceOperator(SPACE, 'p-invited')).toBe(false)
    expect(await isSpaceOperator(SPACE, 'p-editor')).toBe(false)
  })
})

describe('only a PAID tier grants, and only its own space can grant it', () => {
  it('a free tier grants nothing', async () => {
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: FREE_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'free_tier' })
    expect(grantsFor(MEMBER)).toHaveLength(0)
  })

  it('a paid tier the operator drops to free revokes on the next lifecycle event', async () => {
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(grantsFor(MEMBER)).toHaveLength(1)
    state.tiers[0].price_cents = 0 // the operator makes it free
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'free_tier' })
    expect(grantsFor(MEMBER)).toHaveLength(0)
  })

  it('a tier belonging to another Space grants nothing (cross-tenant sanity)', async () => {
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: OTHER_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'tier_missing' })
    expect(grantsFor(MEMBER)).toHaveLength(0)
  })
})

describe('the read side is fail-CLOSED and never throws', () => {
  it('an unreadable grants table reads as NO grant, not as crew', async () => {
    state.grants.push({
      id: 'g1',
      profile_id: MEMBER,
      tier: 'crew',
      granted_by_tier_id: PAID_TIER,
      space_id: SPACE,
    })
    state.readError = 'entitlement_grants'
    expect(await hasActiveCrewGrant(MEMBER)).toBe(false)
    expect((await effectiveTierFor(MEMBER, 'free')).tier).toBe('free')
  })

  it('a signed-out caller holds no grant', async () => {
    expect(await hasActiveCrewGrant(null)).toBe(false)
    expect((await effectiveTierFor(null, null)).tier).toBe('free')
  })

  it('a write error is reported, never thrown into the membership flow', async () => {
    state.insertError = { code: '42501', message: 'nope' }
    const res = await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(res).toEqual({ granted: false, reason: 'error' })
  })

  it('provenance answers "why am I crew?"', async () => {
    await syncCrewEntitlement({
      spaceId: SPACE,
      profileId: MEMBER,
      tierId: PAID_TIER,
      action: 'grant',
    })
    expect(await crewGrantProvenance(MEMBER)).toEqual([{ spaceId: SPACE, tierId: PAID_TIER }])
  })
})

describe('every lifecycle site is wired (source shape)', () => {
  const root = join(__dirname, '..', '..')
  const read = (p: string) => readFileSync(join(root, p), 'utf8')

  it('the grant rides syncTierCircleAccess, the seam every lifecycle site calls', () => {
    const src = read('lib/spaces/tier-circle.ts')
    expect(src).toContain("from '@/lib/billing/crew-grants'")
    expect(src).toContain('syncCrewEntitlement(input)')
  })

  it('and runs BEFORE the circle work, outside its early returns', () => {
    const src = read('lib/spaces/tier-circle.ts')
    const fn = src.slice(src.indexOf('export async function syncTierCircleAccess'))
    const crewAt = fn.indexOf('syncCrewEntitlement(input)')
    const tryAt = fn.indexOf('  try {')
    expect(crewAt).toBeGreaterThan(-1)
    // Most tiers carry no circle link, so a grant gated behind one would reach nobody.
    expect(crewAt).toBeLessThan(tryAt)
  })

  it('the five code sites still call the seam (three in memberships, two in the webhook)', () => {
    expect(
      read('lib/spaces/memberships.ts').match(/syncTierCircleAccess\(/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3)
    expect(
      read('lib/billing/space-subscriptions.ts').match(/syncTierCircleAccess\(/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(2)
  })

  it('the SIXTH site (tier deleted) is wired in the schema as ON DELETE CASCADE', () => {
    const sql = read('supabase/migrations/20270345002800_entitlement_grants.sql')
    const create = sql.slice(sql.indexOf('create table if not exists public.entitlement_grants'))
    const decl = create.slice(create.indexOf('granted_by_tier_id'))
    expect(decl.slice(0, 200)).toContain(
      'references public.space_membership_tiers(id) on delete cascade',
    )
    expect(sql).toContain('create table if not exists public.entitlement_grants')
  })

  it('the schema enforces the self-grant guard too, not only the app', () => {
    const sql = read('supabase/migrations/20270345002800_entitlement_grants.sql')
    expect(sql).toContain('entitlement_grants_no_self_grant')
    expect(sql).toContain('owner_profile_id = new.profile_id')
    expect(sql).toContain('price_cents > 0')
  })

  // 🔴 The inverse of what this test first asserted, and the reason is worth keeping.
  // The migration originally added `membership_tier` to prevent_economy_self_edit on the
  // reasoning that every legitimate writer uses the service role. db-tests disproved it on
  // the first real run: the guard fires on `auth.role() is distinct from 'service_role'`,
  // and the atomic SECURITY DEFINER writers run with the CALLER's role. It blocked
  // apply_membership_event_atomic (the Stripe membership webhook) and
  // apply_bundle_seating_atomic, failing 43 subtests across three suites. Shipping it would
  // have put a trigger in front of the write that applies paid memberships.
  //
  // Nothing is lost by leaving it out: refuse_self_granted_entitlement already refuses an
  // owner, an admin and a zero-price tier, and the price floor backs it. This test now
  // stops the clause coming back on the same plausible-sounding reasoning.
  it('membership_tier deliberately does NOT join prevent_economy_self_edit', () => {
    const sql = read('supabase/migrations/20270345002800_entitlement_grants.sql')
    expect(sql).not.toContain('new.membership_tier')
    // and the reason is recorded where the next person will look
    expect(sql).toContain('apply_membership_event_atomic')
  })
})
