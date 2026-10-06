import { describe, it, expect, beforeEach, vi } from 'vitest'

// SCAN-744 (2026-10-05). Redeeming an invite link used to add one to circles.member_count by hand
// on top of trg_memberships_member_count (migration 20270345000500), so every invite-link join
// counted twice and the circle reported full while seats were free. It also treated ANY membership
// row (pending, inactive) as "already a member". The action now never writes member_count, wakes a
// dormant row the way joinCircle does, maps the cap trigger's raise to "This circle is full.", and
// bumps used_count with a compare-and-set.

type Row = { id: string; status: string } | null

let existing: Row = null
let insertError: { code: string; message: string } | null = null
let updateError: { code: string; message: string } | null = null
let usedCountMatches = true
const writes: { table: string; op: string; row: unknown; filters?: Record<string, unknown> }[] = []

const link = {
  id: 'link-1', circle_id: 'circle-1', created_by: 'host-1',
  max_uses: 0, used_count: 4, expires_at: null, is_active: true,
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) } }),
}))
vi.mock('@/lib/auth', () => ({ getCallerProfile: async () => null }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: vi.fn(async () => ({ recorded: false })) }))
vi.mock('@/lib/zaps', () => ({ awardZapsForAction: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({ sendDispatchNotificationEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/push', () => ({ sendPushToProfile: vi.fn(async () => {}) }))

vi.mock('@/lib/supabase/admin', () => {
  const select = (table: string) => {
    const node: Record<string, unknown> = {}
    node.eq = () => node
    node.maybeSingle = async () => {
      if (table === 'invite_links') return { data: link, error: null }
      if (table === 'profiles') return { data: { id: 'member-1' }, error: null }
      if (table === 'memberships') return { data: existing, error: null }
      if (table === 'circles') return { data: { member_count: 2 }, error: null }
      return { data: null, error: null }
    }
    return node
  }
  const update = (table: string, row: Record<string, unknown>) => {
    const filters: Record<string, unknown> = {}
    const node: Record<string, unknown> = {}
    node.eq = (k: string, v: unknown) => { filters[k] = v; return node }
    node.select = async () => {
      writes.push({ table, op: 'update', row, filters })
      return { data: usedCountMatches ? [{ id: link.id }] : [], error: null }
    }
    node.then = (resolve: (v: unknown) => void) => {
      writes.push({ table, op: 'update', row, filters })
      resolve({ error: table === 'memberships' ? updateError : null })
    }
    return node
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: () => select(table),
        insert: async (row: unknown) => { writes.push({ table, op: 'insert', row }); return { error: insertError } },
        update: (row: Record<string, unknown>) => update(table, row),
      }),
    }),
  }
})

import { joinViaInviteLink } from './actions'

beforeEach(() => {
  existing = null
  insertError = null
  updateError = null
  usedCountMatches = true
  writes.length = 0
})

const circleWrites = () => writes.filter((w) => w.table === 'circles')
const membershipWrites = () => writes.filter((w) => w.table === 'memberships')
const linkWrites = () => writes.filter((w) => w.table === 'invite_links')

describe('joinViaInviteLink: member_count is the trigger\'s job', () => {
  it('inserts the active row and never writes circles.member_count', async () => {
    const res = await joinViaInviteLink('tok')
    expect(res).toEqual({ circleId: 'circle-1' })
    expect(membershipWrites()).toEqual([
      { table: 'memberships', op: 'insert', row: { circle_id: 'circle-1', profile_id: 'member-1', status: 'active' } },
    ])
    expect(circleWrites()).toHaveLength(0)
  })

  it('bumps used_count with a compare-and-set on the value it read', async () => {
    await joinViaInviteLink('tok')
    expect(linkWrites()).toEqual([
      { table: 'invite_links', op: 'update', row: { used_count: 5 }, filters: { id: 'link-1', used_count: 4 } },
    ])
  })

  it('maps the cap trigger raise on insert to "This circle is full."', async () => {
    insertError = { code: 'P0001', message: 'circle_full' }
    await expect(joinViaInviteLink('tok')).rejects.toThrow('This circle is full.')
    expect(linkWrites()).toHaveLength(0)
  })
})

describe('joinViaInviteLink: only an ACTIVE row is already a member', () => {
  it('an active row is a no-op: nothing inserted, nothing counted, still a success', async () => {
    existing = { id: 'm-1', status: 'active' }
    const res = await joinViaInviteLink('tok')
    expect(res).toEqual({ circleId: 'circle-1' })
    expect(membershipWrites()).toHaveLength(0)
    expect(linkWrites()).toHaveLength(0)
    expect(circleWrites()).toHaveLength(0)
  })

  it('a pending row is woken up with the reactivation UPDATE, and the redemption counts', async () => {
    existing = { id: 'm-1', status: 'pending' }
    const res = await joinViaInviteLink('tok')
    expect(res).toEqual({ circleId: 'circle-1' })
    expect(membershipWrites()).toEqual([
      { table: 'memberships', op: 'update', row: { status: 'active' }, filters: { id: 'm-1' } },
    ])
    expect(linkWrites()).toHaveLength(1)
    expect(circleWrites()).toHaveLength(0)
  })

  it('an inactive row waking into a full circle is refused as full', async () => {
    existing = { id: 'm-1', status: 'inactive' }
    updateError = { code: 'P0001', message: 'circle_full' }
    await expect(joinViaInviteLink('tok')).rejects.toThrow('This circle is full.')
    expect(linkWrites()).toHaveLength(0)
  })
})
