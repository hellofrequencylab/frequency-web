import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── DB fixture for getPosterCounts (the hardened-signal harvest) ─────────────
// A controllable admin-client mock. Each table resolves from `dbState`,
// regardless of how the query is chained. The builder is awaitable (PromiseLike)
// so `await from(...).select().eq()...` yields { data }.

interface DbRsvp { event_id: string; profile_id: string; status: string }
interface DbState {
  events: { id: string; host_id: string | null; claimed_at: string | null; removed_at: string | null; source: string | null }[]
  rsvps: DbRsvp[]
  memberships: { profile_id: string }[]
  practiceLogs: { profile_id: string }[]
  claimLedger: { idempotency_key: string; context: { valid?: boolean; eventId?: string } }[]
}

const dbState: DbState = { events: [], rsvps: [], memberships: [], practiceLogs: [], claimLedger: [] }

function dataFor(table: string): { data: unknown[] } {
  switch (table) {
    case 'events':
      return { data: dbState.events }
    case 'event_rsvps':
      return { data: dbState.rsvps }
    case 'memberships':
      return { data: dbState.memberships }
    case 'practice_logs':
      return { data: dbState.practiceLogs }
    case 'engagement_events':
      return { data: dbState.claimLedger }
    default:
      return { data: [] }
  }
}

function qbuilder(table: string) {
  const result = () => dataFor(table)
  const self: Record<string, unknown> = {}
  const chain = () => self
  self.select = chain
  self.eq = chain
  self.in = chain
  self.is = chain
  self.not = chain
  self.limit = chain
  self.order = chain
  self.maybeSingle = async () => ({ data: null })
  // Awaitable: resolve the table's rows when the chain is awaited.
  self.then = (onFulfilled: (r: { data: unknown[] }) => unknown) =>
    Promise.resolve(onFulfilled(result()))
  return self
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => qbuilder(table) }),
}))

import { scorePosterCounts, getPosterCounts } from './poster-quality'

// The honesty metric is the anti-spam core, so its band/multiplier math is locked
// by fixtures. Evaluation order matters: punitive bands (throttled, watch) win
// before lenient ones, so a high-volume low-engagement poster is throttled even
// though they would otherwise read as "new" or "neutral".

describe('scorePosterCounts', () => {
  it('new: under 3 posts always rides at full multiplier', () => {
    const q = scorePosterCounts({ posted: 2, engaged: 0, claimed: 0, removed: 0 })
    expect(q.band).toBe('new')
    expect(q.multiplier).toBe(1.0)
  })

  it('new: a single post with zero engagement is still new, not punished', () => {
    const q = scorePosterCounts({ posted: 1, engaged: 0, claimed: 0, removed: 0 })
    expect(q.band).toBe('new')
    expect(q.multiplier).toBe(1.0)
  })

  it('trusted: engagementRate >= 0.5 earns full', () => {
    const q = scorePosterCounts({ posted: 4, engaged: 2, claimed: 0, removed: 0 })
    expect(q.engagementRate).toBeCloseTo(0.5)
    expect(q.band).toBe('trusted')
    expect(q.multiplier).toBe(1.0)
  })

  it('trusted: claim ratio >= 0.25 earns full even with low RSVP rate', () => {
    // 4 posted, 1 claimed (0.25), only that one engaged (rate 0.25 < 0.5) → trusted via claims.
    const q = scorePosterCounts({ posted: 4, engaged: 1, claimed: 1, removed: 0 })
    expect(q.band).toBe('trusted')
    expect(q.multiplier).toBe(1.0)
  })

  it('neutral: 0.2 <= rate < 0.5 with no strong claim signal stays at full but neutral', () => {
    // 5 posted, but rate must be >= 0.2 to dodge "watch": 2/5 = 0.4.
    const q = scorePosterCounts({ posted: 5, engaged: 2, claimed: 0, removed: 0 })
    expect(q.band).toBe('neutral')
    expect(q.multiplier).toBe(1.0)
  })

  it('watch: posted >= 5 and rate < 0.2 is halved', () => {
    const q = scorePosterCounts({ posted: 6, engaged: 1, claimed: 0, removed: 0 })
    expect(q.engagementRate).toBeCloseTo(1 / 6)
    expect(q.band).toBe('watch')
    expect(q.multiplier).toBe(0.5)
  })

  it('throttled: posted >= 8 and rate < 0.1 earns nothing', () => {
    const q = scorePosterCounts({ posted: 10, engaged: 0, claimed: 0, removed: 0 })
    expect(q.band).toBe('throttled')
    expect(q.multiplier).toBe(0.0)
  })

  it('throttled: two or more removed events zeroes the multiplier regardless of volume', () => {
    const q = scorePosterCounts({ posted: 3, engaged: 3, claimed: 1, removed: 2 })
    expect(q.band).toBe('throttled')
    expect(q.multiplier).toBe(0.0)
  })

  it('clamps and floors negative / fractional inputs', () => {
    const q = scorePosterCounts({ posted: -5, engaged: 2.9, claimed: -1, removed: 0 })
    expect(q.posted).toBe(0)
    expect(q.engaged).toBe(2)
    expect(q.claimed).toBe(0)
    // posted floored to 0 → under 3 → new.
    expect(q.band).toBe('new')
  })
})

// ── Hardened signals (anti-claim-farming) ────────────────────────────────────
// getPosterCounts must make ENGAGEMENT dominant and CAP the claim contribution,
// so a ring of fake claims moves the band ZERO. These fixtures lock that.

const POSTER = 'poster-1'

/** Build N outreach events (poster_scan, not self-hosted), ids e0..e(N-1). */
function postedEvents(n: number, opts: { claimedIdx?: number[]; removedIdx?: number[] } = {}) {
  const claimed = new Set(opts.claimedIdx ?? [])
  const removed = new Set(opts.removedIdx ?? [])
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    host_id: claimed.has(i) ? `host-${i}` : null,
    claimed_at: claimed.has(i) ? '2026-06-01T00:00:00Z' : null,
    removed_at: removed.has(i) ? '2026-06-02T00:00:00Z' : null,
    source: 'poster_scan' as const,
  }))
}

describe('getPosterCounts — hardened signals', () => {
  beforeEach(() => {
    dbState.events = []
    dbState.rsvps = []
    dbState.memberships = []
    dbState.practiceLogs = []
    dbState.claimLedger = []
  })

  it('reciprocal-ring of fake claims: no quality lift (band stays watch/throttled)', async () => {
    // 8 posted, all "claimed" on the events table but NONE recorded valid on the
    // ledger (a reciprocal ring), and zero real RSVPs. Engagement must read as 0.
    dbState.events = postedEvents(8, { claimedIdx: [0, 1, 2, 3, 4, 5, 6, 7] })
    // No claimLedger rows with valid:true → no valid claims, no claim engagement.
    const counts = await getPosterCounts(POSTER)
    expect(counts.posted).toBe(8)
    expect(counts.claimed).toBe(0) // invalid claims do not count
    expect(counts.engaged).toBe(0) // ring moves engagement ZERO
    const q = scorePosterCounts(counts)
    expect(q.band).toBe('throttled') // posted>=8 && rate<0.1
    expect(q.multiplier).toBe(0.0)
  })

  it('sockpuppet RSVPs do not count: only established-member RSVPs lift engagement', async () => {
    dbState.events = postedEvents(5)
    // A sockpuppet (no membership/practice history) RSVPs to every event.
    dbState.rsvps = dbState.events.map((e) => ({ event_id: e.id, profile_id: 'sock', status: 'going' }))
    // sock has NO membership/practice rows → not established.
    const counts = await getPosterCounts(POSTER)
    expect(counts.engaged).toBe(0)
    const q = scorePosterCounts(counts)
    expect(q.band).toBe('watch') // posted>=5 && rate<0.2
  })

  it('genuine claim: a valid claim recorded on the ledger gets full credit', async () => {
    // 4 posted, 1 claimed and recorded valid:true. Claim lifts claimed=1 and, with
    // zero real RSVPs, adds exactly one engaged (capped at realEngaged+1=1).
    dbState.events = postedEvents(4, { claimedIdx: [0] })
    dbState.claimLedger = [{ idempotency_key: 'event_claimed:e0', context: { valid: true, eventId: 'e0' } }]
    const counts = await getPosterCounts(POSTER)
    expect(counts.claimed).toBe(1)
    expect(counts.engaged).toBe(1)
    const q = scorePosterCounts(counts)
    // claimRate 1/4 = 0.25 → trusted, full multiplier.
    expect(q.band).toBe('trusted')
    expect(q.multiplier).toBe(1.0)
  })

  it('established-member RSVPs dominate and claim lift stays capped', async () => {
    dbState.events = postedEvents(6, { claimedIdx: [0, 1, 2, 3, 4, 5] })
    // Two real RSVPs from an established member (has a membership row).
    dbState.rsvps = [
      { event_id: 'e0', profile_id: 'real', status: 'going' },
      { event_id: 'e1', profile_id: 'real', status: 'going' },
    ]
    dbState.memberships = [{ profile_id: 'real' }]
    // All 6 claimed but NONE valid on the ledger → claim engagement is 0.
    const counts = await getPosterCounts(POSTER)
    expect(counts.engaged).toBe(2) // only the two real RSVPs
    expect(counts.claimed).toBe(0)
  })
})
