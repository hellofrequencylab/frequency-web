import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── The award-engine mock ─────────────────────────────────────────────────────────────────────
//
// Deliberately `this`-SENSITIVE, mirroring the real SupabaseClient: from() and rpc() both begin by
// reading `this.rest` (LIVE-053 / LIVE-061, production digest 3920664382). A method detached from
// its client — `const rpc = admin.rpc as unknown as Fn` — runs with `this === undefined` and throws
// `Cannot read properties of undefined (reading 'rest')`. An arrow-function mock would hide that
// regression; this shape makes every test below bite on it, alongside the textual gate
// (scripts/check-detached-client-methods.test.ts). Same shape as lib/gems.test.ts, for the same
// reason.

interface ZapConfigRow {
  zaps_amount: number
  daily_cap: number | null
  is_active: boolean
}
interface LedgerRow {
  profile_id: string
  action_type: string
  amount: number
  created_at: number
}

let configRow: ZapConfigRow | null = null
/** Columns the code actually asked `zap_config` for, captured verbatim. */
let selectedColumns = ''
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
/** Direct `zap_transactions` inserts. MUST stay empty for awardZapsForAction: an insert here is
 *  the old, uncapped path coming back. */
const directInserts: Array<Record<string, unknown>> = []

/** A scripted RPC result, or `'simulate'` to run the faithful award_zaps_atomic simulator. */
let rpcMode: 'simulate' | { data: { awarded?: boolean; capped?: boolean } | null; error: { message: string } | null } =
  'simulate'

/** The fake ledger the simulator counts, plus a fake clock it reads. */
const ledger: LedgerRow[] = []
let nowMs = Date.UTC(2026, 7, 24, 12, 0, 0)

/** A faithful re-implementation of migration 20270322000000's award_zaps_atomic: count the
 *  action's rows for this profile since UTC midnight, refuse at the cap, otherwise insert. It is
 *  NOT the proof that the SQL is right — supabase/tests/award_zaps_atomic.test.sql is, against a
 *  real Postgres. It is here so the TypeScript half is exercised against the RPC's real CONTRACT
 *  rather than a stub that says yes to everything. */
function simulateAwardZapsAtomic(args: Record<string, unknown>) {
  const profile = args._profile as string
  const action = args._action as string
  const amount = args._amount as number
  const cap = args._daily_cap as number | null
  if (!(amount > 0)) return { data: { awarded: false, capped: false }, error: null }
  if (cap !== null && cap !== undefined) {
    const dayStart = Date.UTC(
      new Date(nowMs).getUTCFullYear(),
      new Date(nowMs).getUTCMonth(),
      new Date(nowMs).getUTCDate(),
    )
    const used = ledger.filter(
      (r) => r.profile_id === profile && r.action_type === action && r.created_at >= dayStart,
    ).length
    if (used >= cap) return { data: { awarded: false, capped: true }, error: null }
  }
  ledger.push({ profile_id: profile, action_type: action, amount, created_at: nowMs })
  return { data: { awarded: true, capped: false }, error: null }
}

function makeAdminClient() {
  return {
    rest: {
      from: (table: string) => ({
        // PROJECTS the row to the columns actually asked for, exactly as PostgREST does. This is
        // the difference between a fake that bites and one that flatters: a mock returning the
        // whole row regardless of `select(...)` keeps `daily_cap` populated even after the code
        // stops asking for it, so every cap test below would stay green against the DEFECTIVE
        // version. Verified by mutation — dropping `daily_cap` from the select turns eight of
        // these tests red only because of this projection.
        select: (cols: string) => {
          selectedColumns = cols
          const wanted = cols.split(',').map((c) => c.trim())
          const projected =
            configRow === null
              ? null
              : (Object.fromEntries(
                  Object.entries(configRow).filter(([k]) => wanted.includes(k)),
                ) as Partial<ZapConfigRow>)
          return { eq: () => ({ maybeSingle: async () => ({ data: projected, error: null }) }) }
        },
        insert: async (row: Record<string, unknown>) => {
          if (table === 'zap_transactions') directInserts.push(row)
          return { error: null }
        },
      }),
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return rpcMode === 'simulate' ? simulateAwardZapsAtomic(args) : rpcMode
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

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }))

// The fail-closed branch reports to Sentry through a dynamic import. Mock it so the gate is
// observable (and so vitest never loads the real SDK).
const sentryCaptures: Array<{ message: string; tags: Record<string, unknown> }> = []
vi.mock('@sentry/nextjs', () => ({
  captureException: (err: unknown, ctx?: { tags?: Record<string, unknown> }) => {
    sentryCaptures.push({ message: String((err as Error)?.message ?? err), tags: ctx?.tags ?? {} })
  },
}))

import { ZAP_AMOUNTS, practiceLogAction, awardZapsForAction, awardZaps, type ZapAction } from './zaps'

const P = '00000000-0000-0000-0000-0000000000p1'
const Q = '00000000-0000-0000-0000-0000000000p2'

beforeEach(() => {
  configRow = { zaps_amount: 12, daily_cap: 1, is_active: true }
  rpcMode = 'simulate'
  rpcCalls.length = 0
  directInserts.length = 0
  ledger.length = 0
  sentryCaptures.length = 0
  selectedColumns = ''
  nowMs = Date.UTC(2026, 7, 24, 12, 0, 0)
})

describe('ZAP_AMOUNTS', () => {
  it('contains all expected action keys', () => {
    const expected: ZapAction[] = [
      'circle_start',
      'event_host',
      'circle_activate',
      'invite_accepted',
      'event_attend',
      'outreach_task',
      'practice_logged',
      'practice_logged_light',
      'practice_logged_heavy',
      'practice_claim',
      'node_capture',
      'program_run',
      'entry_point_created',
      'referral_activated',
      'co_op_pulse',
      'welcome_back',
      'practice_full_cycle',
    ]
    for (const key of expected) {
      expect(ZAP_AMOUNTS).toHaveProperty(key)
    }
  })

  it('all amounts are positive integers', () => {
    for (const [action, amount] of Object.entries(ZAP_AMOUNTS)) {
      expect(amount, `${action} amount must be a positive integer`).toBeGreaterThan(0)
      expect(Number.isInteger(amount), `${action} amount must be an integer`).toBe(true)
    }
  })

  it('high-effort actions yield more zaps than low-effort ones', () => {
    // circle_start (starting a circle) outweighs a single node_capture
    expect(ZAP_AMOUNTS.circle_start).toBeGreaterThan(ZAP_AMOUNTS.node_capture)
    // hosting an event outweighs simply attending
    expect(ZAP_AMOUNTS.event_host).toBeGreaterThan(ZAP_AMOUNTS.event_attend)
    // running a program outweighs a single outreach task
    expect(ZAP_AMOUNTS.program_run).toBeGreaterThan(ZAP_AMOUNTS.outreach_task)
  })

  it('specific values match the rebalance migration (ADR-104) + Rewards Economy v2', () => {
    expect(ZAP_AMOUNTS.circle_start).toBe(100)
    expect(ZAP_AMOUNTS.event_host).toBe(60)
    expect(ZAP_AMOUNTS.circle_activate).toBe(40)
    expect(ZAP_AMOUNTS.invite_accepted).toBe(40)
    expect(ZAP_AMOUNTS.event_attend).toBe(25)
    expect(ZAP_AMOUNTS.referral_activated).toBe(25)
    expect(ZAP_AMOUNTS.outreach_task).toBe(20)
    expect(ZAP_AMOUNTS.entry_point_created).toBe(20)
    expect(ZAP_AMOUNTS.practice_logged).toBe(12)
    expect(ZAP_AMOUNTS.practice_claim).toBe(10)
    expect(ZAP_AMOUNTS.node_capture).toBe(10)
    expect(ZAP_AMOUNTS.program_run).toBe(30)
    expect(ZAP_AMOUNTS.practice_logged_light).toBe(8)
    expect(ZAP_AMOUNTS.practice_logged_heavy).toBe(15)
    expect(ZAP_AMOUNTS.co_op_pulse).toBe(3)
    expect(ZAP_AMOUNTS.welcome_back).toBe(10)
    expect(ZAP_AMOUNTS.practice_full_cycle).toBe(50)
  })
})

describe('practiceLogAction', () => {
  it('maps weight classes to their zap actions', () => {
    expect(practiceLogAction('light')).toBe('practice_logged_light')
    expect(practiceLogAction('heavy')).toBe('practice_logged_heavy')
    expect(practiceLogAction('standard')).toBe('practice_logged')
  })

  it('defaults unknown / missing weight classes to standard', () => {
    expect(practiceLogAction(null)).toBe('practice_logged')
    expect(practiceLogAction(undefined)).toBe('practice_logged')
    expect(practiceLogAction('mystery')).toBe('practice_logged')
  })

  it('weight class payouts are ordered light < standard < heavy', () => {
    expect(ZAP_AMOUNTS.practice_logged_light).toBeLessThan(ZAP_AMOUNTS.practice_logged)
    expect(ZAP_AMOUNTS.practice_logged).toBeLessThan(ZAP_AMOUNTS.practice_logged_heavy)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// awardZapsForAction — zap_config.daily_cap enforcement (the defect: it was NEVER read)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Until 2026-08-24 this function selected `zaps_amount, is_active` and handed off to an
// unconditional insert; the string `daily_cap` did not appear in lib/zaps.ts at all, while
// /admin/gamification let a janitor set one. Two production rows carried an inert cap:
// practice_logged (12 Zaps, cap 1) and event_posted (20 Zaps, cap 3).
//
// Every test here measures a CONSEQUENCE, not a shape. Dropping `daily_cap` from the select makes
// the cap arrive as null and the capped tests go red; reverting to the direct insert makes
// `directInserts` non-empty and the RPC tests go red. Both were run.

describe('awardZapsForAction enforces zap_config.daily_cap', () => {
  it('reads the cap out of zap_config and hands it to the RPC', async () => {
    configRow = { zaps_amount: 12, daily_cap: 1, is_active: true }
    await awardZapsForAction(P, 'practice_logged')
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('award_zaps_atomic')
    expect(rpcCalls[0].args).toMatchObject({
      _profile: P,
      _action: 'practice_logged',
      _amount: 12,
      _daily_cap: 1,
    })
    // The column list is asserted too, but only as a SECOND signal — the cap value above is the
    // one that bites, because it is what the RPC actually receives.
    expect(selectedColumns).toContain('daily_cap')
  })

  it('never inserts into zap_transactions directly — the cap-check and the insert are one statement', async () => {
    await awardZapsForAction(P, 'practice_logged')
    expect(directInserts).toEqual([])
    expect(ledger).toHaveLength(1)
  })

  it('a capped action stops paying once the cap is reached in a UTC day', async () => {
    configRow = { zaps_amount: 12, daily_cap: 1, is_active: true }

    const first = await awardZapsForAction(P, 'practice_logged')
    expect(first).toEqual({ awarded: true, amount: 12, capped: false })

    const second = await awardZapsForAction(P, 'practice_logged')
    expect(second).toEqual({ awarded: false, amount: 0, capped: true })

    const third = await awardZapsForAction(P, 'practice_logged')
    expect(third.awarded).toBe(false)
    expect(third.amount).toBe(0)

    // The refusal is the ledger row NOT existing, not a flag on a row that was written anyway.
    expect(ledger.filter((r) => r.action_type === 'practice_logged')).toHaveLength(1)
  })

  it('pays up to the cap and no further (event_posted, cap 3 — the other live capped row)', async () => {
    configRow = { zaps_amount: 20, daily_cap: 3, is_active: true }
    const results = []
    for (let i = 0; i < 5; i++) results.push(await awardZapsForAction(P, 'event_posted'))
    expect(results.map((r) => r.amount)).toEqual([20, 20, 20, 0, 0])
    expect(ledger).toHaveLength(3)
  })

  it('a null cap is uncapped', async () => {
    configRow = { zaps_amount: 10, daily_cap: null, is_active: true }
    for (let i = 0; i < 6; i++) {
      const r = await awardZapsForAction(P, 'node_capture')
      expect(r.awarded).toBe(true)
    }
    expect(rpcCalls.every((c) => c.args._daily_cap === null)).toBe(true)
    expect(ledger).toHaveLength(6)
  })

  it('a cap of 0 means pay nothing — NOT "unlimited" (the `|| null` trap)', async () => {
    configRow = { zaps_amount: 10, daily_cap: 0, is_active: true }
    const r = await awardZapsForAction(P, 'node_capture')
    expect(rpcCalls[0].args._daily_cap).toBe(0)
    expect(r.awarded).toBe(false)
    expect(ledger).toHaveLength(0)
  })

  it('the cap is per profile', async () => {
    configRow = { zaps_amount: 12, daily_cap: 1, is_active: true }
    expect((await awardZapsForAction(P, 'practice_logged')).awarded).toBe(true)
    expect((await awardZapsForAction(P, 'practice_logged')).awarded).toBe(false)
    expect((await awardZapsForAction(Q, 'practice_logged')).awarded).toBe(true)
  })

  it('the cap rolls over at UTC midnight, not at local midnight', async () => {
    configRow = { zaps_amount: 12, daily_cap: 1, is_active: true }

    // 23:30 UTC on the 24th — that is already the 25th in Sydney and still the 24th in Los
    // Angeles, so any local-day rule would disagree with this sequence somewhere.
    nowMs = Date.UTC(2026, 7, 24, 23, 30, 0)
    expect((await awardZapsForAction(P, 'practice_logged')).awarded).toBe(true)

    // 23:59:59 UTC, same UTC day: still spent.
    nowMs = Date.UTC(2026, 7, 24, 23, 59, 59)
    expect((await awardZapsForAction(P, 'practice_logged')).awarded).toBe(false)

    // 00:00:00 UTC on the 25th: a fresh allowance, one second later.
    nowMs = Date.UTC(2026, 7, 25, 0, 0, 0)
    expect((await awardZapsForAction(P, 'practice_logged')).awarded).toBe(true)

    // And spent again for the new UTC day.
    nowMs = Date.UTC(2026, 7, 25, 9, 0, 0)
    expect((await awardZapsForAction(P, 'practice_logged')).awarded).toBe(false)
  })

  it('an inactive action still pays nothing, and never reaches the RPC', async () => {
    configRow = { zaps_amount: 12, daily_cap: null, is_active: false }
    const r = await awardZapsForAction(P, 'practice_logged')
    expect(r).toEqual({ awarded: false, amount: 0 })
    expect(rpcCalls).toHaveLength(0)
    expect(directInserts).toEqual([])
    expect(ledger).toHaveLength(0)
  })

  it('a MISSING config row still pays the static ZAP_AMOUNTS default, uncapped', async () => {
    // Deliberately unlike gems, which pays nothing when the row is missing. A zap grant must not
    // break on a config gap; that fallback predates the cap and survives it.
    configRow = null
    const r = await awardZapsForAction(P, 'circle_start')
    expect(r.awarded).toBe(true)
    expect(r.amount).toBe(ZAP_AMOUNTS.circle_start)
    expect(rpcCalls[0].args._daily_cap).toBeNull()
  })

  it('an override amount is paid, and is still subject to the cap', async () => {
    configRow = { zaps_amount: 20, daily_cap: 1, is_active: true }
    const first = await awardZapsForAction(P, 'event_posted', 14)
    expect(first).toEqual({ awarded: true, amount: 14, capped: false })
    expect(rpcCalls[0].args._amount).toBe(14)
    const second = await awardZapsForAction(P, 'event_posted', 14)
    expect(second.awarded).toBe(false)
  })

  it('a non-positive amount is a no-op before the RPC is called', async () => {
    configRow = { zaps_amount: 12, daily_cap: null, is_active: true }
    expect(await awardZapsForAction(P, 'practice_logged', 0)).toEqual({ awarded: false, amount: 0 })
    expect(await awardZapsForAction(P, 'practice_logged', -5)).toEqual({ awarded: false, amount: 0 })
    expect(rpcCalls).toHaveLength(0)
  })

  // ── The fail-safe direction, and the gate that notices it fired ──────────────────────────────
  it('FAILS CLOSED on an RPC error — it never falls back to an uncapped insert', async () => {
    rpcMode = { data: null, error: { message: 'function public.award_zaps_atomic does not exist' } }
    const r = await awardZapsForAction(P, 'practice_logged')
    expect(r).toEqual({ awarded: false, amount: 0 })
    // The whole point: an error must not become an UNCAPPED payment, which is the defect itself.
    expect(directInserts).toEqual([])
    expect(ledger).toHaveLength(0)
  })

  it('reports the fail-safe to Sentry, tagged, so a swallowed error is not an invisible regression', async () => {
    rpcMode = { data: null, error: { message: 'boom' } }
    await awardZapsForAction(P, 'practice_logged')
    // The dynamic import resolves on a microtask; let it land.
    await new Promise((resolve) => setImmediate(resolve))
    expect(sentryCaptures).toHaveLength(1)
    expect(sentryCaptures[0].message).toContain('award_zaps_atomic failed')
    expect(sentryCaptures[0].tags).toMatchObject({ failsafe: 'fail_closed', currency: 'zaps' })
  })

  it('distinguishes a cap refusal from an error (capped true vs absent)', async () => {
    rpcMode = { data: { awarded: false, capped: true }, error: null }
    expect(await awardZapsForAction(P, 'practice_logged')).toEqual({ awarded: false, amount: 0, capped: true })
    rpcMode = { data: null, error: { message: 'boom' } }
    expect((await awardZapsForAction(P, 'practice_logged')).capped).toBeUndefined()
  })

  // Regression: production digest 3920664382 (LIVE-053 / LIVE-061). A detached alias
  // (`const rpc = admin.rpc as unknown as Fn`) runs with `this === undefined` and throws
  // `Cannot read properties of undefined (reading 'rest')`. The `this`-sensitive mock above
  // reproduces that mechanism, so this passes only while the alias stays bound.
  it('reaches the RPC through a BOUND alias (a detached one throws reading `rest`)', async () => {
    const r = await awardZapsForAction(P, 'practice_logged')
    expect(r.awarded).toBe(true)
    expect(rpcCalls).toHaveLength(1)
  })
})

// ── awardZaps: the uncapped sibling, and why that is not an oversight ─────────────────────────
describe('awardZaps stays the uncapped, caller-computed path', () => {
  it('inserts directly and never consults zap_config or the RPC', async () => {
    const r = await awardZaps(P, 7, { actionType: 'practice_logged' })
    expect(r).toEqual({ awarded: true, amount: 7 })
    expect(rpcCalls).toHaveLength(0)
    expect(directInserts).toHaveLength(1)
    expect(directInserts[0]).toMatchObject({ profile_id: P, action_type: 'practice_logged', amount: 7 })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// The migration's load-bearing SQL. supabase/tests/award_zaps_atomic.test.sql proves the
// BEHAVIOUR against a real Postgres (`supabase test db`); it cannot run under vitest, and CI has
// no database. These are the clauses whose loss would not show up in any mock, pinned here so a
// silent edit to the migration fails `pnpm test`. Each carries a POSITIVE CONTROL asserting the
// same matcher rejects the broken variant — a regex that matches anything is not a gate.
// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('award_zaps_atomic migration (20270322000000)', () => {
  const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '20270322000000_award_zaps_atomic.sql'), 'utf8')
  const code = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  const UTC_DAY = /date_trunc\('day',\s*\(now\(\)\s+at\s+time\s+zone\s+'UTC'\)\)\s*at\s+time\s+zone\s+'UTC'/i
  const LOCAL_DAY_VARIANT = "date_trunc('day', now())"

  it('takes a per-(profile, action) advisory xact lock before counting', () => {
    expect(code).toMatch(/pg_advisory_xact_lock\(\s*hashtextextended\(\s*_profile::text\s*\|\|\s*':'\s*\|\|\s*_action/i)
  })

  it('the day boundary is UTC, not local', () => {
    expect(UTC_DAY.test(code)).toBe(true)
    // Positive control: the matcher must REJECT the local-day form, or it proves nothing.
    expect(UTC_DAY.test(LOCAL_DAY_VARIANT)).toBe(false)
  })

  it('a null cap skips the count entirely — null means uncapped', () => {
    expect(code).toMatch(/if\s+_daily_cap\s+is\s+not\s+null\s+then/i)
  })

  it('refuses at >= the cap, not > it (an off-by-one pays one extra every day)', () => {
    expect(code).toMatch(/v_count\s*>=\s*_daily_cap/i)
    expect(/v_count\s*>=\s*_daily_cap/i.test('if v_count > _daily_cap then')).toBe(false)
  })

  it('counts THIS profile and THIS action since the UTC day start', () => {
    expect(code).toMatch(
      /from\s+public\.zap_transactions\s+where\s+profile_id\s*=\s*_profile\s+and\s+action_type\s*=\s*_action\s+and\s+created_at\s*>=\s*v_day_start/i,
    )
  })

  it('revokes BOTH the PUBLIC grant and the per-role grants (ADR-959), then re-grants service_role only', () => {
    expect(code).toMatch(/revoke\s+all\s+on\s+function\s+public\.award_zaps_atomic\([^)]*\)\s+from\s+public,\s*anon,\s*authenticated/i)
    expect(code).toMatch(/grant\s+execute\s+on\s+function\s+public\.award_zaps_atomic\([^)]*\)\s+to\s+service_role/i)
    // Positive control: revoking from public alone must not satisfy the matcher.
    expect(
      /revoke\s+all\s+on\s+function\s+public\.award_zaps_atomic\([^)]*\)\s+from\s+public,\s*anon,\s*authenticated/i.test(
        'revoke all on function public.award_zaps_atomic(uuid, text, integer, integer, jsonb) from public;',
      ),
    ).toBe(false)
  })

  it('pins search_path and runs SECURITY DEFINER', () => {
    expect(code).toMatch(/security\s+definer/i)
    expect(code).toMatch(/set\s+search_path\s*=\s*''/i)
  })

  it('ships the composite index the cap-count reads', () => {
    expect(code).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+idx_zap_transactions_daily[\s\S]{0,120}\(profile_id,\s*action_type,\s*created_at\)/i,
    )
  })
})
