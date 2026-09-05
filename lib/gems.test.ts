import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

// ── A faithful award_gems_atomic simulator, switched on per test ─────────────────────────────
//
// The scripted `rpcResult` above says whatever a test tells it to, which is right for the
// wiring tests. The event_rsvp cap tests below need the RPC's real CONTRACT instead: count this
// profile's rows for this action since UTC midnight, refuse at the cap, otherwise insert
// (20260929000000). This is not the proof the SQL is right; it is here so the TypeScript half is
// exercised against what the RPC actually does with `_daily_cap`. Same shape as lib/zaps.test.ts.
let rpcMode: 'scripted' | 'simulate' = 'scripted'
const ledger: Array<{ profile_id: string; action_type: string; created_at: number }> = []
let nowMs = Date.UTC(2026, 8, 5, 12, 0, 0)

function simulateAwardGemsAtomic(args: Record<string, unknown>) {
  const profile = args._profile as string
  const action = args._action as string
  const amount = args._amount as number
  const cap = args._daily_cap as number | null
  if (!(amount > 0)) return { data: { awarded: false, capped: false }, error: null }
  if (cap !== null && cap !== undefined) {
    const d = new Date(nowMs)
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    const used = ledger.filter(
      (r) => r.profile_id === profile && r.action_type === action && r.created_at >= dayStart,
    ).length
    if (used >= cap) return { data: { awarded: false, capped: true }, error: null }
  }
  ledger.push({ profile_id: profile, action_type: action, created_at: nowMs })
  return { data: { awarded: true, capped: false }, error: null }
}

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
        return rpcMode === 'simulate' ? simulateAwardGemsAtomic(args) : rpcResult
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
  rpcMode = 'scripted'
  ledger.length = 0
  nowMs = Date.UTC(2026, 8, 5, 12, 0, 0)
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

// ── event_rsvp is capped at one award per member per UTC day (scan2 L6-06) ────────────────────
//
// The first-RSVP gem was seeded with `daily_cap = null` (20240120000000, re-asserted by
// 20260605100000), and award_gems_atomic only counts against a cap when `_daily_cap is not null`.
// So a double-submitted first RSVP (two tabs, a retried fetch, a slow-network double POST), whose
// two requests both read "no existing row" and both reach awardGems, paid 5 gems twice.
// 20270345000100 sets the cap to 1. These tests read the cap OUT OF THAT MIGRATION rather than
// hard-coding it, then run the engine against the RPC's real contract with that value: the second
// award in a UTC day is refused, and the control (the old null cap) shows it is the cap doing it.

const EVENT_RSVP_CAP_MIGRATION = join(
  'supabase', 'migrations', '20270345000100_event_capacity_trigger_locks_the_event_row.sql',
)

/** The cap the migration writes for event_rsvp, parsed from its `update public.gem_config` statement. */
function eventRsvpCapFromMigration(): number {
  const sql = readFileSync(EVENT_RSVP_CAP_MIGRATION, 'utf8')
  const m = sql.match(
    /update\s+public\.gem_config\s+set\s+daily_cap\s*=\s*(\d+)\s+where\s+action_type\s*=\s*'event_rsvp'/i,
  )
  if (!m) throw new Error(`${EVENT_RSVP_CAP_MIGRATION} no longer sets gem_config.daily_cap for event_rsvp`)
  return Number(m[1])
}

describe("event_rsvp daily cap (scan2 L6-06): a double-submitted first RSVP pays once", () => {
  it('the migration caps event_rsvp at exactly 1 per member per UTC day', () => {
    expect(eventRsvpCapFromMigration()).toBe(1)
  })

  it('with the migrated cap, the second award in the same UTC day is refused', async () => {
    rpcMode = 'simulate'
    configRow = { gems_amount: 5, daily_cap: eventRsvpCapFromMigration(), is_active: true }

    const first = await awardGems('p1', 'event_rsvp')
    const second = await awardGems('p1', 'event_rsvp')

    expect(first).toEqual({ awarded: true, amount: 5, capped: false })
    expect(second).toEqual({ awarded: false, amount: 0, capped: true })
    expect(ledger.filter((r) => r.profile_id === 'p1' && r.action_type === 'event_rsvp')).toHaveLength(1)
    // The cap reached the RPC as 1 on both calls, which is what makes the RPC count at all.
    expect(rpcCalls.map((c) => c.args._daily_cap)).toEqual([1, 1])
  })

  it('CONTROL: the pre-migration null cap pays twice, so the cap is what closes the double payment', async () => {
    rpcMode = 'simulate'
    configRow = { gems_amount: 5, daily_cap: null, is_active: true }

    await awardGems('p1', 'event_rsvp')
    await awardGems('p1', 'event_rsvp')

    expect(ledger.filter((r) => r.profile_id === 'p1' && r.action_type === 'event_rsvp')).toHaveLength(2)
  })

  it('the cap is per member: another member RSVPing the same day is still paid', async () => {
    rpcMode = 'simulate'
    configRow = { gems_amount: 5, daily_cap: eventRsvpCapFromMigration(), is_active: true }

    await awardGems('p1', 'event_rsvp')
    const other = await awardGems('p2', 'event_rsvp')
    expect(other).toEqual({ awarded: true, amount: 5, capped: false })
  })

  it('the cap rolls over at UTC midnight: the next day pays again', async () => {
    rpcMode = 'simulate'
    configRow = { gems_amount: 5, daily_cap: eventRsvpCapFromMigration(), is_active: true }

    await awardGems('p1', 'event_rsvp')
    nowMs = Date.UTC(2026, 8, 6, 0, 0, 1)
    const nextDay = await awardGems('p1', 'event_rsvp')
    expect(nextDay).toEqual({ awarded: true, amount: 5, capped: false })
  })
})
