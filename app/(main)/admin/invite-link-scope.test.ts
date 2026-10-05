import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-750 (2026-10-05). createInviteLink gated on the global community host rung only, so the
// host of circle A could mint a link into private or paid circle B, join it free, and disable
// B's real link. It now asks the per-circle resolver (circle.editSettings), like updateCircle.
// joinViaInviteLink also refuses a link whose circle is archived, like the join page does.

const state = {
  hasCap: false,
  circleStatus: 'active' as string,
  link: { id: 'l1', circle_id: 'circle-b', created_by: 'host-b', max_uses: 0, used_count: 0, expires_at: null, is_active: true } as Record<string, unknown> | null,
}
const inserts: Array<{ table: string; row: unknown }> = []
const deactivations: string[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => ({ id: 'host-a', community_role: 'host', webRole: 'member' }) }))
vi.mock('@/lib/admin/guard', () => ({ authorizeAction: async (caller: unknown) => caller }))
vi.mock('@/lib/staff', () => ({ getStaffMember: async () => null }))
vi.mock('@/lib/core/load-capabilities', () => ({
  getCircleCapabilities: async () => ({ has: (cap: string) => cap === 'circle.editSettings' && state.hasCap }),
  getHubCapabilities: async () => ({ has: () => false }),
  getNexusCapabilities: async () => ({ has: () => false }),
  getEventCapabilities: async () => ({ has: () => false }),
  getGlobalCapabilities: async () => ({ has: () => false }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            if (table === 'invite_links') return { data: state.link, error: null }
            if (table === 'circles') return { data: { status: state.circleStatus, member_count: 1 }, error: null }
            if (table === 'profiles') return { data: { id: 'joiner' }, error: null }
            return { data: null, error: null }
          },
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          _col: col, _val: val,
        }),
      }),
      update: () => ({ eq: (_c: string, v: string) => { if (table === 'invite_links') deactivations.push(v); return { eq: async () => ({ error: null }), then: (r: (x: unknown) => void) => r({ error: null }) } } }),
      insert: async (row: unknown) => { inserts.push({ table, row }); return { error: null } },
    }),
  }),
}))

import { createInviteLink, joinViaInviteLink } from './actions'

beforeEach(() => {
  state.hasCap = false
  state.circleStatus = 'active'
  inserts.length = 0
  deactivations.length = 0
})

describe('createInviteLink: scoped to the circle', () => {
  it('refuses a host who does not manage this circle, touching nothing', async () => {
    await expect(createInviteLink('circle-b')).rejects.toThrow('Unauthorized')
    expect(inserts).toHaveLength(0)
    expect(deactivations).toHaveLength(0)
  })

  it('mints a link for someone who manages the circle', async () => {
    state.hasCap = true
    const { token } = await createInviteLink('circle-b')
    expect(token).toBeTruthy()
    expect(inserts).toEqual([{ table: 'invite_links', row: { token, circle_id: 'circle-b', created_by: 'host-a' } }])
  })
})

describe('joinViaInviteLink: archived circle', () => {
  it('refuses a valid link whose circle is archived', async () => {
    state.circleStatus = 'archived'
    await expect(joinViaInviteLink('tok')).rejects.toThrow('no longer open')
    expect(inserts.filter((i) => i.table === 'memberships')).toHaveLength(0)
  })

  it('still joins an open circle', async () => {
    const { circleId } = await joinViaInviteLink('tok')
    expect(circleId).toBe('circle-b')
    expect(inserts.filter((i) => i.table === 'memberships')).toHaveLength(1)
  })
})
