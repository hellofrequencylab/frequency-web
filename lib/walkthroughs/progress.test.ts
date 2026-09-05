import { describe, it, expect, vi, beforeEach } from 'vitest'

// Walkthrough progress writers (scan2 L6-09): each reads meta to merge its one slug into the
// `walkthroughs` map, then merges ONLY that key server-side. completeWalkthrough pays the step
// zaps only when the completion stamp landed (the stamp is the once-only guard).

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  awardZaps: vi.fn(),
  getWalkthrough: vi.fn(),
  meta: {} as Record<string, unknown>,
  profileUpdates: [] as unknown[],
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { meta: mocks.meta }, error: null }) }) }),
      update: (payload: unknown) => {
        mocks.profileUpdates.push(payload)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/zaps', () => ({ awardZaps: mocks.awardZaps }))
vi.mock('@/lib/walkthroughs', () => ({ getWalkthrough: mocks.getWalkthrough }))

import { markWalkthroughSeen, markWalkthroughPending, dismissWalkthrough, completeWalkthrough } from './progress'

function patchOf(n = 0) {
  return (mocks.rpc.mock.calls[n] as [string, { p_patch: Record<string, unknown> }])[1].p_patch
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profileUpdates.length = 0
  mocks.rpc.mockResolvedValue({ data: {}, error: null })
  mocks.awardZaps.mockResolvedValue({ awarded: true })
  mocks.getWalkthrough.mockResolvedValue({ steps: [{ zaps: 3 }, { zaps: 2 }] })
  // A sibling key rides in the read: it must never reach the write.
  mocks.meta = { practiceStreak: { current: 5 }, walkthroughs: { other: { seenAt: 'x' } } }
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('walkthrough progress writers merge ONLY the walkthroughs key', () => {
  it('markWalkthroughSeen keeps the other slug and drops every sibling key', async () => {
    await markWalkthroughSeen('p1', 'welcome')
    expect(mocks.profileUpdates).toEqual([])
    const patch = patchOf()
    expect(Object.keys(patch)).toEqual(['walkthroughs'])
    const map = patch.walkthroughs as Record<string, Record<string, unknown>>
    expect(map.other).toEqual({ seenAt: 'x' })
    expect(typeof map.welcome.seenAt).toBe('string')
  })

  it('dismissWalkthrough and markWalkthroughPending do the same', async () => {
    await dismissWalkthrough('p1', 'welcome')
    await markWalkthroughPending('p1', 'host-tour')
    expect(Object.keys(patchOf(0))).toEqual(['walkthroughs'])
    expect(Object.keys(patchOf(1))).toEqual(['walkthroughs'])
    expect((patchOf(1).walkthroughs as Record<string, Record<string, unknown>>)['host-tour'].pendingAt).toBeTruthy()
  })

  it('an unsafe slug never reaches the database', async () => {
    await markWalkthroughSeen('p1', '__proto__')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('completeWalkthrough', () => {
  it('stamps completedAt through the merge, then pays the step zaps once', async () => {
    await completeWalkthrough('p1', 'welcome')
    expect(Object.keys(patchOf())).toEqual(['walkthroughs'])
    expect(mocks.awardZaps).toHaveBeenCalledWith('p1', 5, { actionType: 'walkthrough_complete', metadata: { slug: 'welcome' } })
  })

  it('pays NOTHING when the stamp did not land', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await completeWalkthrough('p1', 'welcome')
    expect(mocks.awardZaps).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[completeWalkthrough]'), { profileId: 'p1', slug: 'welcome', error: 'boom' })
  })

  it('never re-pays an already completed walkthrough', async () => {
    mocks.meta = { walkthroughs: { welcome: { completedAt: 'done' } } }
    await completeWalkthrough('p1', 'welcome')
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.awardZaps).not.toHaveBeenCalled()
  })
})
