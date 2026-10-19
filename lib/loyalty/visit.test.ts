import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stamp on a check-in (LIVE-940): the RPC is asked once, Zaps are paid only when a stamp was
// written, and a Space with no program (or the switch off) does nothing.

const h = vi.hoisted(() => ({
  reply: { stamped: true, stamps: 2, required: 6, earned: false } as Record<string, unknown>,
  rpcCalls: [] as unknown[],
  enabled: true,
  program: { status: 'on', rewardTitle: 'Free coffee' },
  awards: [] as string[],
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_name: string, args: unknown) => {
      h.rpcCalls.push(args)
      return { data: h.reply, error: null }
    },
  }),
}))
vi.mock('@/lib/zaps', () => ({
  awardZapsForAction: vi.fn(async (_p: string, action: string) => {
    h.awards.push(action)
    return { awarded: true, amount: 25 }
  }),
}))
vi.mock('./store', () => ({
  loyaltyEnabled: () => h.enabled,
  getLoyaltyProgram: async () => h.program,
}))

import { recordLoyaltyVisit } from './visit'

beforeEach(() => {
  h.rpcCalls.length = 0
  h.awards.length = 0
  h.enabled = true
  h.program = { status: 'on', rewardTitle: 'Free coffee' }
  h.reply = { stamped: true, stamps: 2, required: 6, earned: false }
})

describe('recordLoyaltyVisit', () => {
  it('stamps the card and pays the capped check-in Zaps', async () => {
    const r = await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(h.rpcCalls).toEqual([{ _space: 'space-1', _profile: 'member-1', _day: '2026-12-01', _kind: 'visit' }])
    expect(h.awards).toEqual(['space_checkin'])
    expect(r).toEqual({ outcome: { stamps: 2, required: 6, rewardTitle: 'Free coffee', earnedCode: null }, zapsAwarded: 25 })
  })

  it('pays nothing on a same-day retry that wrote no stamp', async () => {
    h.reply = { stamped: false, stamps: 2, required: 6, earned: false }
    const r = await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(h.awards).toEqual([])
    expect(r.zapsAwarded).toBe(0)
    expect(r.outcome?.stamps).toBe(2)
  })

  it('carries the earned code when the card fills', async () => {
    h.reply = { stamped: true, stamps: 0, required: 6, earned: true, reward_code: 'K7Q2MX', reward_title: 'Free coffee' }
    const r = await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(r.outcome?.earnedCode).toBe('K7Q2MX')
  })

  it('does nothing when the switch is off, the program is off, or there is no member day', async () => {
    h.enabled = false
    expect(await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')).toEqual({ outcome: null, zapsAwarded: 0 })
    h.enabled = true
    h.program = { status: 'off', rewardTitle: '' }
    expect(await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')).toEqual({ outcome: null, zapsAwarded: 0 })
    h.program = { status: 'on', rewardTitle: 'x' }
    expect(await recordLoyaltyVisit('space-1', 'member-1', null)).toEqual({ outcome: null, zapsAwarded: 0 })
    expect(h.rpcCalls).toEqual([])
  })
})
