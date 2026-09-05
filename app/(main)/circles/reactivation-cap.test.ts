import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L6-13 (2026-09-05). Reactivating a dormant membership row (pending / inactive -> active) is
// a join, and since migration 20270345000500 the DB cap trigger fires on that UPDATE too. The JS
// path must treat the trigger's raise on the update exactly as it treats the raise on the insert:
// "This circle is full.", never "try again" (which could never work) and never a false success.

let existing: { id: string; status: string } | null = null
let activeCount = 0
let updateError: { code: string; message: string } | null = null
const updates: Record<string, unknown>[] = []

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => 'member-1', isPlatformStaff: async () => false }))
vi.mock('@/lib/achievements', () => ({ processGamificationEvent: vi.fn(async () => {}) }))
vi.mock('@/lib/gems', () => ({ awardGems: vi.fn(async () => {}) }))
vi.mock('@/lib/analytics/track', () => ({ track: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({ sendInviteEmail: vi.fn(async () => {}) }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))
vi.mock('@/lib/core/load-capabilities', () => ({ getCircleCapabilities: async () => new Set() }))
vi.mock('@/lib/ai/circle-spark', () => ({
  suggestCircleDraft: vi.fn(async () => null),
  fallbackCircleSuggestion: vi.fn(() => ({})),
}))

vi.mock('@/lib/supabase/admin', () => {
  const circle = { member_count: 2, member_cap: 3, hub_id: null, access: 'open', unlisted: false, space_id: null, host_id: 'host-1' }
  const chain = (table: string, opts?: { count?: string; head?: boolean }) => {
    const node: Record<string, unknown> = {}
    node.eq = () => node
    node.maybeSingle = async () => ({ data: table === 'circles' ? circle : existing, error: null })
    // The active-row count is a thenable at the end of the .eq chain.
    node.then = (resolve: (v: unknown) => void) =>
      resolve(opts?.count ? { count: activeCount, error: null } : { data: [], error: null })
    return node
  }
  return {
    createAdminClient: () => ({
      from: (table: string) => ({
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => chain(table, opts),
        insert: async () => ({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => { updates.push(row); return { error: updateError } },
        }),
      }),
    }),
  }
})

import { joinCircle } from './actions'

beforeEach(() => {
  existing = { id: 'm-1', status: 'inactive' }
  activeCount = 0
  updateError = null
  updates.length = 0
})

describe('joinCircle: reactivating a dormant row', () => {
  it('wakes the row and completes the join when there is room', async () => {
    const res = await joinCircle('circle-1', 'open-circle')
    expect(res).toBeUndefined() // redirect (mocked) is the happy path
    expect(updates).toEqual([{ status: 'active' }])
  })

  it('maps the cap trigger raise on the UPDATE to "full", exactly as the insert path does', async () => {
    updateError = { code: 'P0001', message: 'circle_full' }
    const res = await joinCircle('circle-1', 'open-circle')
    expect(res).toEqual({ error: 'This circle is full.' })
  })

  it('still fast-fails on the JS active count before touching the row', async () => {
    activeCount = 3
    const res = await joinCircle('circle-1', 'open-circle')
    expect(res).toEqual({ error: 'This circle is full.' })
    expect(updates).toHaveLength(0)
  })

  it('any other update failure is the generic refusal, not a false success', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    updateError = { code: '42501', message: 'permission denied' }
    const res = await joinCircle('circle-1', 'open-circle')
    expect(res).toEqual({ error: 'Could not join this circle. Please try again.' })
    errorSpy.mockRestore()
  })
})
