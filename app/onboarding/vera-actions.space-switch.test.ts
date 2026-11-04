import { describe, it, expect, vi, beforeEach } from 'vitest'

// LIVE-2157. A tapped Space switch goes through the Module Manager's own guarded action (which re-checks the
// caller is the Space's owner or an admin), money and the team list are refused whatever the request
// carries, and a member's other confirms are untouched.

const mocks = vi.hoisted(() => ({ setSpaceFeatureEnabled: vi.fn(), setSpaceFeatureMinRole: vi.fn(), profileId: 'p1' as string | null }))

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
vi.mock('@/app/(main)/spaces/[slug]/manage/modules/actions', () => ({ setSpaceFeatureEnabled: mocks.setSpaceFeatureEnabled, setSpaceFeatureMinRole: mocks.setSpaceFeatureMinRole }))

import { confirmProposal } from './vera-actions'

beforeEach(() => {
  mocks.setSpaceFeatureEnabled.mockReset()
  mocks.setSpaceFeatureMinRole.mockReset()
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

describe('confirming who can use an area (LIVE-2185)', () => {
  it('runs the Module Manager role action and says where to change it back', async () => {
    mocks.setSpaceFeatureMinRole.mockResolvedValue({ data: undefined })
    const res = await confirmProposal('set_space_role', JSON.stringify({ space: 'sunrise', feature: 'reviews', role: 'editor' }))
    expect(mocks.setSpaceFeatureMinRole).toHaveBeenCalledWith('sunrise', 'reviews', 'editor')
    expect(res).toEqual({ ok: true, message: 'Done. You can change who can use Reviews any time at /spaces/sunrise/manage/modules.' })
  })

  it('passes the action refusal through when the caller does not run the Space', async () => {
    mocks.setSpaceFeatureMinRole.mockResolvedValue({ error: 'You do not have access to manage this space.' })
    const res = await confirmProposal('set_space_role', JSON.stringify({ space: 'someone-else', feature: 'reviews', role: 'admin' }))
    expect(res).toEqual({ ok: false, error: 'You do not have access to manage this space.' })
  })

  it('refuses money, the team list, a role off the ladder and malformed args without writing', async () => {
    for (const args of [
      { space: 'sunrise', feature: 'memberships', role: 'admin' },
      { space: 'sunrise', feature: 'members', role: 'viewer' },
      { space: 'sunrise', feature: 'reviews', role: 'owner' },
      { space: 'sunrise', feature: 'reviews', role: 3 },
      { space: 'sunrise', feature: 'reviews' },
    ]) {
      const res = await confirmProposal('set_space_role', JSON.stringify(args))
      expect(res.ok).toBe(false)
    }
    expect(mocks.setSpaceFeatureMinRole).not.toHaveBeenCalled()
  })
})
