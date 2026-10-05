import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-749 (2026-10-05). The four dispatch mutations used to gate on the global host rung
// alone and run on the admin client keyed on id, so the host of one circle could edit,
// retarget, publish or delete any other host's broadcast, and a re-publish after unpublish
// re-sent the whole email and push blast. Each now loads the row and allows only its author
// or staff; a non-staff retarget is held to the led-scope rule; the fan-out runs once.

const state = vi.hoisted(() => ({
  caller: { id: 'host-a', community_role: 'host', webRole: 'none' } as Record<string, unknown>,
  staffRole: null as string | null,
  row: { id: 'd1', author_id: 'host-b', status: 'draft', published_at: null as string | null },
  flips: 1,
  circle: { host_id: 'host-a', hub_id: null } as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  deletes: 0,
  fanouts: 0,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => state.caller }))
vi.mock('@/lib/admin/guard', () => ({ authorizeAction: async (caller: unknown) => caller }))
vi.mock('@/lib/staff', () => ({ getStaffMember: async () => (state.staffRole ? { profileId: 'x', role: state.staffRole } : null) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/email', () => ({ sendDispatchNotificationEmail: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushToProfile: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'dispatches' && cols.includes('status')) return { data: state.row, error: null }
            if (table === 'dispatches') { state.fanouts += 1; return { data: null, error: null } }
            if (table === 'circles') return { data: state.circle, error: null }
            return { data: null, error: null }
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        state.updates.push(patch)
        const done = { error: null, data: [] as { id: string }[] }
        return {
          eq: () => Object.assign(Promise.resolve(done), {
            neq: () => ({ select: async () => ({ error: null, data: state.flips ? [{ id: 'd1' }] : [] }) }),
          }),
        }
      },
      delete: () => ({ eq: async () => { state.deletes += 1; return { error: null } } }),
      insert: async () => ({ error: null }),
    }),
  }),
}))

import { updateDispatch, publishDispatch, unpublishDispatch, deleteDispatch } from './actions'

function form(scope = 'circle', audienceId = 'c1') {
  const fd = new FormData()
  fd.set('title', 'Hello')
  fd.set('body', 'Body')
  fd.set('audience_scope', scope)
  fd.set('audience_id', audienceId)
  return fd
}

const tick = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  state.caller = { id: 'host-a', community_role: 'host', webRole: 'none' }
  state.staffRole = null
  state.row = { id: 'd1', author_id: 'host-b', status: 'draft', published_at: null }
  state.flips = 1
  state.circle = { host_id: 'host-a', hub_id: null }
  state.updates.length = 0
  state.deletes = 0
  state.fanouts = 0
})

describe('dispatch mutations: owner gate (SCAN-749)', () => {
  it("a host cannot edit, publish, unpublish or delete another host's dispatch", async () => {
    await expect(updateDispatch('d1', form())).rejects.toThrow('Unauthorized')
    await expect(publishDispatch('d1')).rejects.toThrow('Unauthorized')
    await expect(unpublishDispatch('d1')).rejects.toThrow('Unauthorized')
    await expect(deleteDispatch('d1')).rejects.toThrow('Unauthorized')
    expect(state.updates).toHaveLength(0)
    expect(state.deletes).toBe(0)
  })

  it('the author may edit and delete their own dispatch', async () => {
    state.row.author_id = 'host-a'
    await updateDispatch('d1', form())
    await deleteDispatch('d1')
    expect(state.updates).toHaveLength(1)
    expect(state.deletes).toBe(1)
  })

  it('platform staff (web_role) and a community-write staff operator reach any dispatch', async () => {
    state.caller = { id: 'staff-1', community_role: 'member', webRole: 'admin' }
    await deleteDispatch('d1')
    state.caller = { id: 'op-1', community_role: 'member', webRole: 'none' }
    state.staffRole = 'owner'
    await deleteDispatch('d1')
    expect(state.deletes).toBe(2)
  })

  it('a missing dispatch is refused before any write', async () => {
    state.row = null as unknown as typeof state.row
    await expect(deleteDispatch('nope')).rejects.toThrow('Dispatch not found')
    expect(state.deletes).toBe(0)
  })
})

describe('updateDispatch: retarget is held to the led-scope rule', () => {
  beforeEach(() => { state.row.author_id = 'host-a' })

  it('a non-staff author cannot retarget to a circle they do not lead', async () => {
    state.circle = { host_id: 'host-z', hub_id: null }
    await expect(updateDispatch('d1', form('circle', 'c-other'))).rejects.toThrow('you lead')
    expect(state.updates).toHaveLength(0)
  })

  it('a non-staff author cannot retarget to global', async () => {
    await expect(updateDispatch('d1', form('global', ''))).rejects.toThrow('you lead')
    expect(state.updates).toHaveLength(0)
  })

  it('staff may retarget to global, and the audience id is cleared', async () => {
    state.caller = { id: 'staff-1', community_role: 'member', webRole: 'admin' }
    await updateDispatch('d1', form('global', 'stale'))
    expect(state.updates[0]).toMatchObject({ audience_scope: 'global', audience_id: null })
  })
})

describe('publishDispatch: the blast goes out once', () => {
  beforeEach(() => { state.row.author_id = 'host-a' })

  it('a first publish flips the draft and fans out', async () => {
    await publishDispatch('d1')
    await tick()
    expect(state.updates[0]).toMatchObject({ status: 'published' })
    expect(state.fanouts).toBe(1)
  })

  it('a re-publish after unpublish flips the row but does not re-send', async () => {
    state.row.published_at = '2026-10-01T00:00:00.000Z'
    await publishDispatch('d1')
    await tick()
    expect(state.updates).toHaveLength(1)
    expect(state.fanouts).toBe(0)
  })

  it('an already-published row is left alone and nothing is sent', async () => {
    state.flips = 0
    await publishDispatch('d1')
    await tick()
    expect(state.fanouts).toBe(0)
  })
})
