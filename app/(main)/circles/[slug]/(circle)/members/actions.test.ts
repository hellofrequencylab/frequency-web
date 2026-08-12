import { describe, it, expect, vi, beforeEach } from 'vitest'

// setCircleMemberRole (ADR-1014) — the ONE write path for a circle's role ladder, tested at the
// gate rather than at the control. The picker on the Members tab is an affordance; these are the
// refusals that hold when someone posts the action directly.
//
// The admin client is a table-driven mock (the lib/messages/scoped-dm.test.ts pattern), extended
// with `update` so the test can assert what was written and, more importantly, that NOTHING was.

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let updates: Array<{ table: string; patch: Row; matched: number }> = []

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let patch: Row | null = null
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const api = {
    select() { return api },
    update(p: Row) { patch = p; return api },
    eq(col: string, val: unknown) {
      filters.push((r) => r[col] === val)
      return api
    },
    async maybeSingle() { return { data: rows()[0] ?? null, error: null } },
    then(resolve: (v: { data: Row[]; error: null }) => void) {
      const matched = rows()
      if (patch) {
        for (const r of matched) Object.assign(r, patch)
        updates.push({ table, patch, matched: matched.length })
      }
      resolve({ data: matched, error: null })
    },
  }
  return api
}

const mocks = vi.hoisted(() => ({
  getMyProfileId: vi.fn<() => Promise<string | null>>(),
  getCircleCapabilities: vi.fn<() => Promise<Set<string>>>(),
  logAdminAction: vi.fn<() => Promise<void>>(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: mocks.getCircleCapabilities,
}))
vi.mock('@/lib/admin/audit', () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { setCircleMemberRole } from './actions'

const OWNER = 'owner-1'
const ADMIN = 'admin-1'
const MEMBER = 'member-1'
const CIRCLE = 'circle-1'

/** The seed roster: an owner, an Admin (volunteer_role 'guide'), and a plain member. */
function seed() {
  tables = {
    circles: [{ id: CIRCLE, slug: 'tuesday-walk', host_id: OWNER }],
    memberships: [
      { id: 'm-owner', circle_id: CIRCLE, profile_id: OWNER, status: 'active', volunteer_role: 'host' },
      { id: 'm-admin', circle_id: CIRCLE, profile_id: ADMIN, status: 'active', volunteer_role: 'guide' },
      { id: 'm-plain', circle_id: CIRCLE, profile_id: MEMBER, status: 'active', volunteer_role: null },
    ],
  }
  updates = []
}

const roleOf = (profileId: string) =>
  (tables.memberships ?? []).find((r) => r.profile_id === profileId)?.volunteer_role

beforeEach(() => {
  seed()
  vi.clearAllMocks()
  mocks.getMyProfileId.mockResolvedValue(OWNER)
  mocks.getCircleCapabilities.mockResolvedValue(new Set(['circle.manageRoles']))
})

describe('setCircleMemberRole · the happy path', () => {
  it('the Host promotes a member to Admin and it is stored as guide', async () => {
    const result = await setCircleMemberRole(CIRCLE, MEMBER, 'admin')
    expect(result).toEqual({ data: undefined })
    expect(roleOf(MEMBER)).toBe('guide')
  })

  it('Moderator stores host, and Member stores NULL', async () => {
    await setCircleMemberRole(CIRCLE, MEMBER, 'moderator')
    expect(roleOf(MEMBER)).toBe('host')
    await setCircleMemberRole(CIRCLE, ADMIN, 'member')
    expect(roleOf(ADMIN)).toBeNull()
  })

  it('records the change in the audit log', async () => {
    await setCircleMemberRole(CIRCLE, MEMBER, 'admin')
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: OWNER, action: 'circle.role.set' }),
    )
  })
})

describe('setCircleMemberRole · the LAST-OWNER guard', () => {
  it('REFUSES to touch the owner’s row, so a circle can never reach zero owners', async () => {
    const result = await setCircleMemberRole(CIRCLE, OWNER, 'member')
    expect(result).toEqual({ error: expect.stringContaining('Host holds the circle') })
    expect(roleOf(OWNER)).toBe('host')
    expect(updates).toHaveLength(0)
  })

  it('refuses even when the OWNER is the one asking (no self-demotion by accident)', async () => {
    mocks.getMyProfileId.mockResolvedValue(OWNER)
    const result = await setCircleMemberRole(CIRCLE, OWNER, 'moderator')
    expect('error' in result).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('never writes circles.host_id — ownership is not reachable from this action', async () => {
    await setCircleMemberRole(CIRCLE, MEMBER, 'admin')
    expect(updates.every((u) => u.table === 'memberships')).toBe(true)
    expect(tables.circles[0].host_id).toBe(OWNER)
  })
})

describe('setCircleMemberRole · the gate', () => {
  it('REFUSES an Admin: every other management capability, and provably not this one', async () => {
    mocks.getMyProfileId.mockResolvedValue(ADMIN)
    mocks.getCircleCapabilities.mockResolvedValue(
      new Set(['circle.editSettings', 'circle.moderate', 'circle.assignTask', 'circle.broadcast']),
    )
    const result = await setCircleMemberRole(CIRCLE, MEMBER, 'admin')
    expect(result).toEqual({ error: expect.stringContaining('Only the Host') })
    expect(roleOf(MEMBER)).toBeNull()
    expect(updates).toHaveLength(0)
  })

  it('refuses a plain member and a signed-out caller', async () => {
    mocks.getMyProfileId.mockResolvedValue(MEMBER)
    mocks.getCircleCapabilities.mockResolvedValue(new Set(['circle.view', 'circle.post']))
    expect('error' in (await setCircleMemberRole(CIRCLE, ADMIN, 'member'))).toBe(true)

    mocks.getMyProfileId.mockResolvedValue(null)
    expect('error' in (await setCircleMemberRole(CIRCLE, MEMBER, 'admin'))).toBe(true)
    expect(updates).toHaveLength(0)
  })
})

describe('setCircleMemberRole · fail closed on the inputs', () => {
  it('refuses a role name that is not one of the three assignable rungs', async () => {
    for (const role of ['host', 'guide', 'owner', 'janitor', 'Admin', '', 'mentor']) {
      const result = await setCircleMemberRole(CIRCLE, MEMBER, role)
      expect(result).toEqual({ error: expect.stringContaining('not a role you can set') })
    }
    expect(updates).toHaveLength(0)
    expect(roleOf(MEMBER)).toBeNull()
  })

  it('refuses a target who is not an ACTIVE member of THIS circle (tenancy)', async () => {
    tables.memberships.push({
      id: 'm-elsewhere', circle_id: 'circle-2', profile_id: 'stranger', status: 'active', volunteer_role: null,
    })
    tables.memberships.push({
      id: 'm-pending', circle_id: CIRCLE, profile_id: 'pending-1', status: 'pending', volunteer_role: null,
    })
    for (const target of ['stranger', 'pending-1', 'nobody']) {
      const result = await setCircleMemberRole(CIRCLE, target, 'admin')
      expect(result).toEqual({ error: expect.stringContaining('not in this circle') })
    }
    expect(updates).toHaveLength(0)
  })

  it('refuses a missing circle and a missing id', async () => {
    expect('error' in (await setCircleMemberRole('nope', MEMBER, 'admin'))).toBe(true)
    expect('error' in (await setCircleMemberRole('', MEMBER, 'admin'))).toBe(true)
    expect('error' in (await setCircleMemberRole(CIRCLE, '', 'admin'))).toBe(true)
    expect(updates).toHaveLength(0)
  })

  it('resolves the capability from the LIVE circle on every call, never from the client', async () => {
    await setCircleMemberRole(CIRCLE, MEMBER, 'admin')
    expect(mocks.getCircleCapabilities).toHaveBeenCalledWith(CIRCLE)
  })
})
