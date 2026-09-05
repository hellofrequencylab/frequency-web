import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// scan2 L6-11 + R4 (2026-09-05).
//  L6-11: releaseReferralReward inserted the reward_grants claim (amount 0) and then awarded; a crash in
//         between left a zero-amount claim whose UNIQUE key blocked every later run ("already paid").
//         The award now stamps the paid amount on the claim; a zero-amount claim older than the stale
//         window is re-examined and re-paid (or stamped, if the ledger shows the award did land).
//  R4:    runReferralRelease re-attempted every already-paid pair on every run, relying on the 409 as its
//         dedupe (49 duplicate-key errors a day for one pair). The scan now excludes settled pairs.
// Both drive the real functions over one in-memory fake of the admin client that enforces the
// UNIQUE (rule_key, profile_id) index on reward_grants with a 23505.

type Row = Record<string, unknown>
const store: Record<string, Row[]> = {}
let insertAttempts: { table: string; row: Row }[] = []
const zapAwards: { profileId: string; action: string }[] = []
let awardResult: { awarded: boolean; amount: number } = { awarded: true, amount: 40 }
const warnings: string[] = []
const errors: string[] = []
let claimErrorOverride: { code: string; message: string } | null = null

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

function from(table: string) {
  if (!store[table]) store[table] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row | null = null
  let counting = false
  let single = false
  let wantRows = false
  const preds: Array<(r: Row) => boolean> = []
  const cmp = (r: Row, c: string) => r[c] as string
  const api: Record<string, unknown> = {
    select: (_c?: string, opts?: { count?: string }) => {
      counting = !!opts?.count
      wantRows = true
      return api
    },
    insert: (p: Row) => {
      op = 'insert'
      payload = p
      return api
    },
    update: (p: Row) => {
      op = 'update'
      payload = p
      return api
    },
    delete: () => {
      op = 'delete'
      return api
    },
    eq: (c: string, v: unknown) => {
      preds.push((r) => r[c] === v)
      return api
    },
    in: (c: string, vs: unknown[]) => {
      preds.push((r) => vs.includes(r[c]))
      return api
    },
    like: (c: string, pattern: string) => {
      const prefix = pattern.replace(/%$/, '')
      preds.push((r) => String(r[c]).startsWith(prefix))
      return api
    },
    gte: (c: string, v: string) => {
      preds.push((r) => cmp(r, c) >= v)
      return api
    },
    lt: (c: string, v: string) => {
      preds.push((r) => cmp(r, c) < v)
      return api
    },
    not: (c: string, _op: string, v: unknown) => {
      preds.push((r) => r[c] !== v)
      return api
    },
    limit: () => api,
    maybeSingle: () => {
      single = true
      return api
    },
    then(resolve: (v: unknown) => unknown) {
      const matched = store[table].filter((r) => preds.every((p) => p(r)))
      let out: unknown
      if (op === 'insert') {
        insertAttempts.push({ table, row: payload! })
        if (table === 'reward_grants' && claimErrorOverride) {
          out = { data: null, error: claimErrorOverride }
        } else if (
          table === 'reward_grants' &&
          store[table].some((r) => r.rule_key === payload!.rule_key && r.profile_id === payload!.profile_id)
        ) {
          out = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        } else {
          store[table].push({ granted_at: new Date().toISOString(), ...payload })
          out = { data: null, error: null }
        }
      } else if (op === 'update') {
        for (const r of matched) Object.assign(r, payload)
        out = { data: wantRows ? matched.map((r) => ({ ...r })) : null, error: null }
      } else if (op === 'delete') {
        store[table] = store[table].filter((r) => !preds.every((p) => p(r)))
        out = { data: null, error: null }
      } else if (counting) {
        out = { count: matched.length, error: null }
      } else if (single) {
        out = { data: matched[0] ? { ...matched[0] } : null, error: null }
      } else {
        out = { data: matched.map((r) => ({ ...r })), error: null }
      }
      return Promise.resolve(out).then(resolve)
    },
  }
  return api
}

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, delete: () => undefined }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => from(t) }) }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: async () => ({ recorded: true }) }))
vi.mock('@/lib/analytics/track', () => ({ track: async () => undefined }))
vi.mock('@/lib/entry-points/ab', () => ({ recordEntryPointConversion: async () => undefined }))
vi.mock('@/lib/vcard', () => ({ parseVcard: () => ({ enabled: false }) }))
vi.mock('@/lib/zaps', () => ({
  awardZapsForAction: async (profileId: string, action: string) => {
    zapAwards.push({ profileId, action })
    if (awardResult.awarded) {
      store.zap_transactions ??= []
      store.zap_transactions.push({ profile_id: profileId, action_type: action, amount: awardResult.amount, created_at: new Date().toISOString() })
    }
    return awardResult
  },
}))

import { releaseReferralReward, runReferralRelease, referralClaimState, REFERRAL_CLAIM_STALE_MINUTES } from './referral'

const REFERRER = 'referrer-1'
const REFERRED = 'referred-1'
const KEY = `referral.activated:${REFERRED}`

function seedActivatedReferral(referredId = REFERRED) {
  store.profiles.push({ id: referredId, referred_by_profile_id: REFERRER })
  store.engagement_events.push({ actor_profile_id: referredId, event_type: 'circle.joined', created_at: new Date().toISOString() })
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  store.profiles = []
  store.engagement_events = []
  store.reward_grants = []
  store.zap_transactions = []
  store.notifications = []
  insertAttempts = []
  zapAwards.length = 0
  warnings.length = 0
  errors.length = 0
  awardResult = { awarded: true, amount: 40 }
  claimErrorOverride = null
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    warnings.push(a.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  })
})
afterEach(() => vi.restoreAllMocks())

describe('referralClaimState (pure)', () => {
  it('amount > 0 is paid; a young zero claim is in flight; an old zero claim is stale', () => {
    expect(referralClaimState({ amount: 40, granted_at: minutesAgo(1000) })).toBe('paid')
    expect(referralClaimState({ amount: 0, granted_at: minutesAgo(1) })).toBe('in_flight')
    expect(referralClaimState({ amount: 0, granted_at: minutesAgo(REFERRAL_CLAIM_STALE_MINUTES + 1) })).toBe('stale')
    expect(referralClaimState({ amount: null, granted_at: null })).toBe('stale')
  })
})

describe('releaseReferralReward — claimed-but-unpaid recovery (scan2 L6-11)', () => {
  it('a fresh payout claims, awards, and STAMPS the paid amount onto the claim', async () => {
    seedActivatedReferral()
    expect(await releaseReferralReward(REFERRED)).toBe(true)
    expect(zapAwards).toEqual([{ profileId: REFERRER, action: 'invite_accepted' }])
    expect(store.reward_grants).toHaveLength(1)
    expect(store.reward_grants[0].amount).toBe(40)
    // Second run: already paid, no second award.
    expect(await releaseReferralReward(REFERRED)).toBe(false)
    expect(zapAwards).toHaveLength(1)
  })

  it('a zero-amount claim older than the stale window (the crash state) is RE-PAID on the next run', async () => {
    seedActivatedReferral()
    // The L6-11 repro: insert the claim row by hand as a run that died after claiming.
    store.reward_grants.push({ rule_key: KEY, profile_id: REFERRER, reward_kind: 'zaps', amount: 0, detail: 'x', granted_at: minutesAgo(REFERRAL_CLAIM_STALE_MINUTES + 5) })
    expect(await releaseReferralReward(REFERRED)).toBe(true)
    expect(zapAwards).toHaveLength(1)
    expect(store.reward_grants).toHaveLength(1)
    expect(store.reward_grants[0].amount).toBe(40)
    expect(warnings.some((w) => w.includes('re-paying stale claimed-but-unpaid referral'))).toBe(true)
  })

  it('a young zero-amount claim (another run mid-flight) is left alone', async () => {
    seedActivatedReferral()
    store.reward_grants.push({ rule_key: KEY, profile_id: REFERRER, reward_kind: 'zaps', amount: 0, detail: 'x', granted_at: minutesAgo(1) })
    expect(await releaseReferralReward(REFERRED)).toBe(false)
    expect(zapAwards).toHaveLength(0)
    expect(store.reward_grants[0].amount).toBe(0)
  })

  it('a stale zero claim whose award DID land (crash after the award, before the stamp) is stamped, not paid twice', async () => {
    seedActivatedReferral()
    const claimedAt = minutesAgo(REFERRAL_CLAIM_STALE_MINUTES + 5)
    store.reward_grants.push({ rule_key: KEY, profile_id: REFERRER, reward_kind: 'zaps', amount: 0, detail: 'x', granted_at: claimedAt })
    store.zap_transactions.push({
      profile_id: REFERRER,
      action_type: 'invite_accepted',
      amount: 40,
      created_at: new Date(Date.parse(claimedAt) + 5_000).toISOString(),
    })
    expect(await releaseReferralReward(REFERRED)).toBe(false)
    expect(zapAwards).toHaveLength(0) // exactly-once held
    expect((store.reward_grants[0].amount as number) > 0).toBe(true) // settled
    expect(warnings.some((w) => w.includes('had a landed award; stamped, not re-paid'))).toBe(true)
  })

  it('a failed award still releases the claim (unchanged), so the next run pays', async () => {
    seedActivatedReferral()
    awardResult = { awarded: false, amount: 0 }
    expect(await releaseReferralReward(REFERRED)).toBe(false)
    expect(store.reward_grants).toHaveLength(0)
    awardResult = { awarded: true, amount: 40 }
    expect(await releaseReferralReward(REFERRED)).toBe(true)
  })

  it('a NON-duplicate claim error is logged at error level and nothing is paid (scan2 R3 shape)', async () => {
    seedActivatedReferral()
    claimErrorOverride = { code: '57014', message: 'statement timeout' }
    expect(await releaseReferralReward(REFERRED)).toBe(false)
    expect(zapAwards).toHaveLength(0)
    expect(errors.some((e) => e.includes('reward_grants claim failed') && e.includes('statement timeout'))).toBe(true)
  })
})

describe('runReferralRelease — settled pairs are excluded from the scan (scan2 R4)', () => {
  it('an already-paid pair is never re-attempted (no insert, no 409), and reports as settled', async () => {
    seedActivatedReferral()
    store.reward_grants.push({ rule_key: KEY, profile_id: REFERRER, reward_kind: 'zaps', amount: 40, detail: 'x', granted_at: minutesAgo(600) })
    const res = await runReferralRelease()
    expect(res).toEqual({ released: 0, checked: 0, settled: 1 })
    expect(insertAttempts.filter((a) => a.table === 'reward_grants')).toHaveLength(0)
    expect(zapAwards).toHaveLength(0)
  })

  it('an unpaid pair is released, and the NEXT run then skips it without an insert', async () => {
    seedActivatedReferral()
    expect(await runReferralRelease()).toEqual({ released: 1, checked: 1, settled: 0 })
    expect(insertAttempts.filter((a) => a.table === 'reward_grants')).toHaveLength(1)
    expect(await runReferralRelease()).toEqual({ released: 0, checked: 0, settled: 1 })
    expect(insertAttempts.filter((a) => a.table === 'reward_grants')).toHaveLength(1) // still one
  })

  it('a STALE zero-amount claim is not "settled": the scan still reaches it so L6-11 can re-pay', async () => {
    seedActivatedReferral()
    store.reward_grants.push({ rule_key: KEY, profile_id: REFERRER, reward_kind: 'zaps', amount: 0, detail: 'x', granted_at: minutesAgo(REFERRAL_CLAIM_STALE_MINUTES + 5) })
    const res = await runReferralRelease()
    expect(res).toEqual({ released: 1, checked: 1, settled: 0 })
    expect(store.reward_grants[0].amount).toBe(40)
  })
})
