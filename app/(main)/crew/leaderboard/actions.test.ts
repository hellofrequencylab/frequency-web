import { describe, it, expect, vi, beforeEach } from 'vitest'

// setLeaderboardVisibility (scan2 L6-09): one key (`leaderboardOptOut`) merged server-side with no
// read, and a failed merge reports ok:false instead of repainting a toggle that did not land.

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), revalidatePath: vi.fn(), getMyProfileId: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: mocks.getMyProfileId }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { setLeaderboardVisibility } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.getMyProfileId.mockResolvedValue('p1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('setLeaderboardVisibility', () => {
  it('merges only leaderboardOptOut, with no read and no .from() write, then revalidates', async () => {
    const res = await setLeaderboardVisibility(true, '/circles/abc/practice')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('merge_profile_meta', { p_profile_id: 'p1', p_patch: { leaderboardOptOut: true } })
    expect(res).toEqual({ ok: true, hidden: true })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/crew/leaderboard')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/circles/abc/practice')
  })

  it('reports ok:false and does not revalidate when the merge did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await setLeaderboardVisibility(true)).toEqual({ ok: false, hidden: true })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
