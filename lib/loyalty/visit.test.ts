import { beforeEach, describe, expect, it, vi } from 'vitest'

// The stamp on a check-in (LIVE-940): the RPC is asked once, Zaps are paid only when a stamp was
// written, and a Space with no program (or the switch off) does nothing.

const h = vi.hoisted(() => ({
  reply: { stamped: true, stamps: 2, required: 6, earned: false } as Record<string, unknown>,
  rpcCalls: [] as unknown[],
  enabled: true,
  program: { status: 'on', rewardTitle: 'Free coffee' },
  awards: [] as string[],
  nudges: [] as unknown[],
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (_name: string, args: unknown) => {
      h.rpcCalls.push(args)
      return { data: h.reply, error: null }
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'corner', name: 'The Corner', brand_name: null } }) }) }),
    }),
  }),
}))
vi.mock('@/lib/zaps', () => ({
  awardZapsForAction: vi.fn(async (_p: string, action: string) => {
    h.awards.push(action)
    return { awarded: true, amount: 25 }
  }),
}))
vi.mock('@/lib/notifications/router', () => ({
  routeNotification: vi.fn(async (event: string, _r: unknown, ctx: unknown) => {
    h.nudges.push({ event, ctx })
    return { event, outcomes: [], enqueuedCount: 1 }
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
  h.nudges.length = 0
  h.enabled = true
  h.program = { status: 'on', rewardTitle: 'Free coffee' }
  h.reply = { stamped: true, stamps: 2, required: 6, earned: false }
})

describe('recordLoyaltyVisit', () => {
  it('stamps the card and pays the capped check-in Zaps', async () => {
    const r = await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(h.rpcCalls).toEqual([{ _space: 'space-1', _profile: 'member-1', _day: '2026-12-01', _kind: 'visit' }])
    expect(h.awards).toEqual(['space_checkin'])
    expect(r).toEqual({
      outcome: { stamps: 2, required: 6, rewardTitle: 'Free coffee', earnedCode: null, surprise: false, standing: { regular: false, streakWeeks: 0 } },
      zapsAwarded: 25,
    })
    expect(h.nudges).toEqual([])
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

  it('sends the one-stamp-away nudge exactly when the card reaches required minus one', async () => {
    h.reply = { stamped: true, stamps: 5, required: 6, earned: false }
    await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(h.nudges).toHaveLength(1)
    expect((h.nudges[0] as { event: string }).event).toBe('loyalty.nudge')
    expect((h.nudges[0] as { ctx: { body: string } }).ctx.body).toContain('The Corner')
    h.nudges.length = 0
    h.reply = { stamped: false, stamps: 5, required: 6, earned: false }
    await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(h.nudges).toEqual([])
  })

  it('reads the surprise stamp and the standing off the reply', async () => {
    h.reply = { stamped: true, surprise: true, stamps: 3, required: 6, earned: false, visit_days: ['2026-12-01', '2026-11-24', '2026-11-17'] }
    const r = await recordLoyaltyVisit('space-1', 'member-1', '2026-12-01')
    expect(r.outcome?.surprise).toBe(true)
    expect(r.outcome?.standing).toEqual({ regular: true, streakWeeks: 3 })
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
