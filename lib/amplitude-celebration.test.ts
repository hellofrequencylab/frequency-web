import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decideAmplitudeCelebration, acknowledgeAmplitudeLevel } from './amplitude-celebration'

describe('decideAmplitudeCelebration', () => {
  it('returns null when nothing new', () => {
    expect(decideAmplitudeCelebration(0, 0)).toBeNull()
    expect(decideAmplitudeCelebration(99, 0)).toBeNull() // still level 0
    expect(decideAmplitudeCelebration(150, 1)).toBeNull() // level 1 already seen
  })

  it('fires on a level-up with no milestone', () => {
    const c = decideAmplitudeCelebration(150, 0) // level 1
    expect(c).toMatchObject({ level: 1, amplitude: 150, milestoneLabel: null })
  })

  it('takes the gold treatment when a milestone was crossed', () => {
    const c = decideAmplitudeCelebration(1_050, 3) // level 4, crossed 1k
    expect(c).toMatchObject({ level: 4, milestoneLabel: 'First Thousand' })
  })

  it('celebrates the highest milestone when several were crossed at once', () => {
    const c = decideAmplitudeCelebration(5_600, 0) // backfill jump past 1k + 5k
    expect(c?.milestoneLabel).toBe('Five K')
  })

  it('does not re-fire a milestone already celebrated', () => {
    // 1k = level 4. Seen level 4, climb to level 5 (1500): plain level-up.
    const c = decideAmplitudeCelebration(1_500, 4)
    expect(c).toMatchObject({ level: 5, milestoneLabel: null })
  })
})

// ── acknowledgeAmplitudeLevel (scan2 L6-09): the write is a merge of ONLY amplitudeLevelSeen ────
const ackMocks = vi.hoisted(() => ({ rpc: vi.fn(), meta: {} as Record<string, unknown>, updates: [] as unknown[] }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: ackMocks.rpc,
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { meta: ackMocks.meta }, error: null }) }) }),
      update: (p: unknown) => {
        ackMocks.updates.push(p)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

describe('acknowledgeAmplitudeLevel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ackMocks.updates.length = 0
    ackMocks.rpc.mockResolvedValue({ data: {}, error: null })
    ackMocks.meta = { amplitudeLevelSeen: 1, practiceStreak: { current: 9 } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('merges only amplitudeLevelSeen and never writes profiles through .from()', async () => {
    await acknowledgeAmplitudeLevel('p1', 2)
    expect(ackMocks.updates).toEqual([])
    expect(ackMocks.rpc).toHaveBeenCalledWith('merge_profile_meta', { p_profile_id: 'p1', p_patch: { amplitudeLevelSeen: 2 } })
  })

  it('is monotonic, and logs a failed merge without throwing', async () => {
    await acknowledgeAmplitudeLevel('p1', 1)
    expect(ackMocks.rpc).not.toHaveBeenCalled()
    ackMocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(acknowledgeAmplitudeLevel('p1', 4)).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[acknowledgeAmplitudeLevel]'), { profileId: 'p1', error: 'boom' })
  })
})
