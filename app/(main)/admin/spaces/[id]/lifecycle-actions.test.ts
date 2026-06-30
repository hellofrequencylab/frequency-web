import { describe, it, expect, vi, beforeEach } from 'vitest'

// Entity Management Overhaul EM1-6 — platform-admin Space LIFECYCLE + OWNERSHIP TRANSFER guards.
// Network-free (auth + the staff gate + the audit writer + the membership seam + the supabase admin
// client are mocked). The invariants locked here, all security-relevant:
//   1. AUTHZ: a denied caller (authorizeAction throws) is rejected with no write and no audit entry.
//   2. ROOT is never lifecycle-managed or transferred (it serves the app + the money partition).
//   3. LIFECYCLE: a valid status move writes spaces.status scoped to the id AND audits before/after;
//      a no-op (already at the target) writes nothing.
//   4. TRANSFER consistency: a valid transfer updates owner_profile_id AND seats the new owner as an
//      admin space_member AND audits before/after; a missing/identical/unknown owner writes nothing.

// ── Mock the caller identity ──────────────────────────────────────────────────────────────
const CALLER = { id: 'actor-0000-4000-a000-0000000actor', community_role: 'member', webRole: 'janitor' }
vi.mock('@/lib/auth', () => ({
  getCallerProfile: async () => CALLER,
}))

// ── Mock the staff gate: authorizeAction throws when denied (the real contract) ─────────────
let authorized = true
vi.mock('@/lib/admin/guard', () => ({
  authorizeAction: async <T,>(caller: T, ..._rest: unknown[]) => {
    void _rest
    if (!authorized) throw new Error('Unauthorized')
    return caller
  },
}))

// ── Mock the audit writer (spy on every recorded action) ────────────────────────────────────
const logAdminAction = vi.fn((entry: Record<string, unknown>) => {
  void entry
  return Promise.resolve()
})
vi.mock('@/lib/admin/audit', () => ({
  logAdminAction: (entry: Record<string, unknown>) => logAdminAction(entry),
}))

// ── Mock the membership seam (spy the owner-seat write); keep nothing else from it ──────────
const addSpaceMember = vi.fn((input: Record<string, unknown>) => {
  void input
  return Promise.resolve({ id: 'm1' })
})
vi.mock('@/lib/spaces/membership', () => ({
  addSpaceMember: (input: Record<string, unknown>) => addSpaceMember(input),
}))

// ── Mock next/cache (revalidatePath is a no-op here) ────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

// ── A chainable admin-client mock over a tiny store ─────────────────────────────────────────
// One space row + a set of known profile ids. Tracks the update patch the action writes.
type Row = { id: string; type: string; slug: string; status: string; owner_profile_id: string | null; name: string }
const store: { space: Row | null; profiles: Set<string>; updates: Record<string, unknown>[] } = {
  space: null,
  profiles: new Set(),
  updates: [],
}

function builder(table: string) {
  const state: { selectCols?: string; eqs: [string, string][]; updateRow?: Record<string, unknown> } = { eqs: [] }
  const api = {
    select(cols: string) {
      state.selectCols = cols
      return api
    },
    eq(col: string, val: string) {
      state.eqs.push([col, val])
      return api
    },
    update(row: Record<string, unknown>) {
      state.updateRow = row
      // An update is awaited directly (returns { error }); record it scoped to the eq.
      return {
        eq: async () => {
          if (table === 'spaces' && store.space) {
            store.updates.push(row)
            Object.assign(store.space, row)
          }
          return { error: null }
        },
      }
    },
    async maybeSingle() {
      if (table === 'spaces') return { data: store.space, error: null }
      if (table === 'profiles') {
        const [, id] = state.eqs.find(([c]) => c === 'id') ?? []
        return { data: id && store.profiles.has(id) ? { id } : null, error: null }
      }
      return { data: null, error: null }
    },
  }
  return api
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import { setSpaceStatus, transferSpaceOwnership } from './lifecycle-actions'

const SPACE_ID = 'space-0000-4000-a000-00000000spc'
const NEW_OWNER = 'newowner-0000-4000-a000-000000new'

function seedSpace(over: Partial<Row> = {}): void {
  store.space = {
    id: SPACE_ID,
    type: 'practitioner',
    slug: 'river-yoga',
    status: 'active',
    owner_profile_id: 'oldowner-0000-4000-a000-000000old',
    name: 'River Yoga',
    ...over,
  }
}

beforeEach(() => {
  authorized = true
  store.space = null
  store.profiles = new Set([NEW_OWNER])
  store.updates = []
  logAdminAction.mockClear()
  addSpaceMember.mockClear()
})

describe('setSpaceStatus — authorization', () => {
  it('rejects a denied caller with no write and no audit', async () => {
    authorized = false
    seedSpace()
    const result = await setSpaceStatus(SPACE_ID, 'suspended')
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})

describe('setSpaceStatus — root + validation', () => {
  it('refuses to lifecycle-manage the root space', async () => {
    seedSpace({ type: 'root' })
    const result = await setSpaceStatus(SPACE_ID, 'suspended')
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it('rejects an unknown status', async () => {
    seedSpace()
    const result = await setSpaceStatus(SPACE_ID, 'frozen' as never)
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it('is a no-op when already at the target status (no write, no audit)', async () => {
    seedSpace({ status: 'active' })
    const result = await setSpaceStatus(SPACE_ID, 'active')
    expect('error' in result).toBe(false)
    expect(store.updates).toHaveLength(0)
    expect(logAdminAction).not.toHaveBeenCalled()
  })
})

describe('setSpaceStatus — happy path', () => {
  it('writes the status scoped to the id and audits before/after', async () => {
    seedSpace({ status: 'active' })
    const result = await setSpaceStatus(SPACE_ID, 'suspended')
    expect('error' in result).toBe(false)
    expect(store.updates).toEqual([{ status: 'suspended' }])
    expect(logAdminAction).toHaveBeenCalledTimes(1)
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: CALLER.id,
        action: 'space.suspended',
        targetType: 'space',
        targetId: SPACE_ID,
        detail: expect.objectContaining({ from: 'active', to: 'suspended' }),
      }),
    )
  })

  it('maps reactivate to the space.reactivated audit kind', async () => {
    seedSpace({ status: 'archived' })
    await setSpaceStatus(SPACE_ID, 'active')
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'space.reactivated', detail: expect.objectContaining({ from: 'archived', to: 'active' }) }),
    )
  })
})

describe('transferSpaceOwnership — authorization + root', () => {
  it('rejects a denied caller with no write and no audit', async () => {
    authorized = false
    seedSpace()
    const result = await transferSpaceOwnership(SPACE_ID, NEW_OWNER)
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
    expect(addSpaceMember).not.toHaveBeenCalled()
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it('refuses to transfer the root space', async () => {
    seedSpace({ type: 'root' })
    const result = await transferSpaceOwnership(SPACE_ID, NEW_OWNER)
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
  })
})

describe('transferSpaceOwnership — validation', () => {
  it('rejects an empty new owner', async () => {
    seedSpace()
    const result = await transferSpaceOwnership(SPACE_ID, '   ')
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it('rejects transferring to the current owner', async () => {
    seedSpace({ owner_profile_id: NEW_OWNER })
    const result = await transferSpaceOwnership(SPACE_ID, NEW_OWNER)
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it('rejects an owner that is not a real profile (no write, no seat)', async () => {
    seedSpace()
    store.profiles = new Set() // the new owner id resolves to no profile
    const result = await transferSpaceOwnership(SPACE_ID, NEW_OWNER)
    expect('error' in result).toBe(true)
    expect(store.updates).toHaveLength(0)
    expect(addSpaceMember).not.toHaveBeenCalled()
  })
})

describe('transferSpaceOwnership — consistency (the core invariant)', () => {
  it('updates owner_profile_id, seats the new owner as admin, and audits before/after', async () => {
    seedSpace({ owner_profile_id: 'oldowner-0000-4000-a000-000000old' })
    const result = await transferSpaceOwnership(SPACE_ID, NEW_OWNER)
    expect('error' in result).toBe(false)

    // 1. The canonical owner reference is updated.
    expect(store.updates).toEqual([{ owner_profile_id: NEW_OWNER }])

    // 2. The per-Space role ladder stays consistent: the new owner is seated as an active admin.
    expect(addSpaceMember).toHaveBeenCalledTimes(1)
    expect(addSpaceMember).toHaveBeenCalledWith({
      spaceId: SPACE_ID,
      profileId: NEW_OWNER,
      role: 'admin',
      status: 'active',
    })

    // 3. The decision is audited with before/after owner.
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: CALLER.id,
        action: 'space.ownership_transfer',
        targetType: 'space',
        targetId: SPACE_ID,
        detail: expect.objectContaining({ from: 'oldowner-0000-4000-a000-000000old', to: NEW_OWNER, seatedAsAdmin: true }),
      }),
    )
  })
})
