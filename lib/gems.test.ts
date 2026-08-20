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

// The mock client is deliberately `this`-SENSITIVE, mirroring the real SupabaseClient: from()
// and rpc() both begin by reading `this.rest` (LIVE-053 / LIVE-061, production digest
// 3920664382). A method detached from its client — `const rpc = admin.rpc as unknown as Fn` —
// runs with `this === undefined` and throws `Cannot read properties of undefined (reading
// 'rest')`, which is exactly what awardGems did on every daily check-in until the alias was
// bound. An arrow-function mock would hide that regression; this shape makes every test below
// bite on it, alongside the textual gate (scripts/check-detached-client-methods.test.ts).
function makeAdminClient() {
  return {
    rest: {
      from: (_table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: configRow, error: null }) }) }),
      }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return rpcResult
      },
    },
    from(table: string) {
      return this.rest.from(table)
    },
    rpc(name: string, args: Record<string, unknown>) {
      return this.rest.rpc(name, args)
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
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

  // Regression: production digest 3920664382 (LIVE-061, first 2026-07-09 → last 2026-08-19).
  // dailyCheckIn (app/(main)/checkin-actions.ts) awaited awardGems(profileId, 'daily_login') on
  // the first authenticated visit of the member's day, and awardGems reached the RPC through a
  // DETACHED alias (`const rpc = admin.rpc as unknown as (…)`), so SupabaseClient.rpc ran with
  // `this === undefined` and its first read — `this.rest` — threw
  // `TypeError: Cannot read properties of undefined (reading 'rest')`: a 500 on POST /feed.
  // The `this`-sensitive mock above reproduces that mechanism exactly, so this test REJECTS with
  // that same TypeError against the unbound alias and passes only while the alias stays bound.
  it('pays the daily check-in through a bound rpc (digest 3920664382: a detached alias throws reading `rest`)', async () => {
    const r = await awardGems('p1', 'daily_login')
    expect(r).toEqual({ awarded: true, amount: 3, capped: false })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('award_gems_atomic')
    expect(rpcCalls[0].args._action).toBe('daily_login')
  })
})
