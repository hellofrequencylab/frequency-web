import { describe, it, expect, vi, beforeEach } from 'vitest'

// recordCompletionSeen (scan2 L6-09): the seen marker is ONE key merged server-side. It used to read
// the whole meta blob and write it back, which carried every sibling key from a stale read.

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}))

import { recordCompletionSeen } from './celebration'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordCompletionSeen', () => {
  it('merges only lastSeenJourneyCompletionId, with no read and no .from() write', async () => {
    await recordCompletionSeen('p1', 'c9')
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.rpc).toHaveBeenCalledWith('merge_profile_meta', {
      p_profile_id: 'p1',
      p_patch: { lastSeenJourneyCompletionId: 'c9' },
    })
  })

  it('logs a failed merge with a structured argument and does not throw', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(recordCompletionSeen('p1', 'c9')).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[recordCompletionSeen]'), { profileId: 'p1', error: 'boom' })
  })
})
