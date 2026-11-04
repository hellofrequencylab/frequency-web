import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-2157. A tapped Space switch goes through the Module Manager's own guarded action (which re-checks the
// caller is the Space's owner or an admin), money and the team list are refused whatever the request
// carries, and a member's other confirms are untouched.

const mocks = vi.hoisted(() => ({ setSpaceFeatureEnabled: vi.fn(), profileId: 'p1' as string | null }))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mocks.profileId ? { id: 'u1' } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.profileId ? { id: mocks.profileId } : null }) }) }) }),
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/ai/vera/turn', () => ({ runConciergeTurn: vi.fn() }))
vi.mock('@/lib/ai/vera/execute', () => ({ executeConfirmedTool: vi.fn() }))
vi.mock('@/app/(main)/circles/actions', () => ({ joinCircle: vi.fn() }))
vi.mock('@/app/(main)/spaces/[slug]/manage/modules/actions', () => ({ setSpaceFeatureEnabled: mocks.setSpaceFeatureEnabled }))

import { confirmProposal } from './vera-actions'

beforeEach(() => {
  mocks.setSpaceFeatureEnabled.mockReset()
  mocks.profileId = 'p1'
})

describe('confirming a Space switch (LIVE-2157)', () => {
  it('runs the Module Manager action and says where to switch it back', async () => {
    mocks.setSpaceFeatureEnabled.mockResolvedValue({ data: undefined })
    const res = await confirmProposal('set_space_feature', JSON.stringify({ space: 'sunrise', feature: 'reviews', on: false }))
    expect(mocks.setSpaceFeatureEnabled).toHaveBeenCalledWith('sunrise', 'reviews', false)
    expect(res).toEqual({ ok: true, message: 'Done. Reviews is off. You can switch it back any time at /spaces/sunrise/manage/modules.' })
  })

  it('passes the action refusal through when the caller does not run the Space', async () => {
    mocks.setSpaceFeatureEnabled.mockResolvedValue({ error: 'You do not have access to manage this space.' })
    const res = await confirmProposal('set_space_feature', JSON.stringify({ space: 'someone-else', feature: 'reviews', on: true }))
    expect(res).toEqual({ ok: false, error: 'You do not have access to manage this space.' })
  })

  it('refuses money, the team list and malformed args without writing', async () => {
    for (const args of [
      { space: 'sunrise', feature: 'memberships', on: false },
      { space: 'sunrise', feature: 'members', on: false },
      { space: 'sunrise', feature: 'reviews', on: 'yes' },
      { space: 'sunrise', feature: 'reviews' },
    ]) {
      const res = await confirmProposal('set_space_feature', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    expect(mocks.setSpaceFeatureEnabled).not.toHaveBeenCalled()
  })

  it('needs a signed-in caller', async () => {
    mocks.profileId = null
    const res = await confirmProposal('set_space_feature', JSON.stringify({ space: 'sunrise', feature: 'reviews', on: false }))
    expect(res).toEqual({ ok: false, error: 'Not signed in.' })
    expect(mocks.setSpaceFeatureEnabled).not.toHaveBeenCalled()
  })
})
