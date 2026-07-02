import { describe, it, expect, vi, beforeEach } from 'vitest'

// awardGems delegates the cap-check + insert to the award_gems_atomic RPC (migration
// 20260929000000), which serializes per (profile, action) under an advisory lock so the
// count-then-insert race can't over-pay past daily_cap. The real atomicity lives in Postgres
// (not exercisable in vitest); these tests lock the WIRING: config gating, the args passed to
// the RPC, and how its { awarded, capped } result maps to AwardResult.

let configRow: { gems_amount: number; daily_cap: number | null; is_active: boolean } | null = null
let rpcResult: { data: { awarded?: boolean; capped?: boolean } | null; error: { message: string } | null } = {
  data: { awarded: true, capped: false },
  error: null,
}
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: configRow, error: null }) }) }),
    }),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      return rpcResult
    },
  }),
}))

import { awardGems } from './gems'

beforeEach(() => {
  configRow = { gems_amount: 3, daily_cap: 5, is_active: true }
  rpcResult = { data: { awarded: true, capped: false }, error: null }
  rpcCalls.length = 0
})

describe('awardGems', () => {
  it('no-ops when the action config is inactive (no RPC call)', async () => {
    configRow = { gems_amount: 3, daily_cap: 5, is_active: false }
    const r = await awardGems('p1', 'reaction')
    expect(r).toEqual({ awarded: false, amount: 0, capped: false })
    expect(rpcCalls).toHaveLength(0)
  })

  it('no-ops when the amount is <= 0 (no RPC call)', async () => {
    const r = await awardGems('p1', 'reaction', 0)
    expect(r).toEqual({ awarded: false, amount: 0, capped: false })
    expect(rpcCalls).toHaveLength(0)
  })

  it('calls award_gems_atomic with the profile, action, amount and daily_cap', async () => {
    await awardGems('p1', 'reaction')
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('award_gems_atomic')
    expect(rpcCalls[0].args).toMatchObject({ _profile: 'p1', _action: 'reaction', _amount: 3, _daily_cap: 5 })
  })

  it('passes _daily_cap null when the action is uncapped', async () => {
    configRow = { gems_amount: 2, daily_cap: null, is_active: true }
    await awardGems('p1', 'reaction')
    expect(rpcCalls[0].args._daily_cap).toBeNull()
  })

  it('honors an override amount', async () => {
    await awardGems('p1', 'reaction', 10)
    expect(rpcCalls[0].args._amount).toBe(10)
  })

  it('maps an awarded RPC result to the full amount', async () => {
    rpcResult = { data: { awarded: true, capped: false }, error: null }
    const r = await awardGems('p1', 'reaction')
    expect(r).toEqual({ awarded: true, amount: 3, capped: false })
  })

  it('maps a capped RPC result to awarded:false, amount 0, capped:true', async () => {
    rpcResult = { data: { awarded: false, capped: true }, error: null }
    const r = await awardGems('p1', 'reaction')
    expect(r).toEqual({ awarded: false, amount: 0, capped: true })
  })

  it('fails closed on an RPC error', async () => {
    rpcResult = { data: null, error: { message: 'boom' } }
    const r = await awardGems('p1', 'reaction')
    expect(r).toEqual({ awarded: false, amount: 0, capped: false })
  })
})
