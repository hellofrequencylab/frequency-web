import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── DB fixture for the poster-selection logic ────────────────────────────────
// A filter-aware admin-client mock (same family as poster-quality.test.ts, but
// it honors eq/in/not filters so multiple posters can live in one fixture:
// reviewCandidates lists distinct posters, then getPosterQuality re-queries
// events per poster via .eq('posted_by_profile_id', id)).

interface DbEvent {
  id: string
  posted_by_profile_id: string
  status: string
  host_id: string | null
  claimed_at: string | null
  removed_at: string | null
  source: string | null
}
interface DbState {
  events: DbEvent[]
  rsvps: { event_id: string; profile_id: string; status: string }[]
  memberships: { profile_id: string }[]
  practiceLogs: { profile_id: string }[]
  claimLedger: { idempotency_key: string; context: { valid?: boolean; eventId?: string } }[]
  creatorTips: { creator_id: string; content_type: string; status: string }[]
}

const dbState: DbState = {
  events: [],
  rsvps: [],
  memberships: [],
  practiceLogs: [],
  claimLedger: [],
  creatorTips: [],
}

function rowsFor(table: string): Record<string, unknown>[] {
  switch (table) {
    case 'events':
      return dbState.events as unknown as Record<string, unknown>[]
    case 'event_rsvps':
      return dbState.rsvps as unknown as Record<string, unknown>[]
    case 'memberships':
      return dbState.memberships as unknown as Record<string, unknown>[]
    case 'practice_logs':
      return dbState.practiceLogs as unknown as Record<string, unknown>[]
    case 'engagement_events':
      return dbState.claimLedger as unknown as Record<string, unknown>[]
    case 'creator_tips':
      return dbState.creatorTips as unknown as Record<string, unknown>[]
    default:
      return []
  }
}

function qbuilder(table: string) {
  const filters: ((row: Record<string, unknown>) => boolean)[] = []
  const self: Record<string, unknown> = {}
  const chain = () => self
  self.select = chain
  self.order = chain
  self.limit = chain
  // Honor the filters the code under test actually uses. A missing column
  // passes (lenient, like a select that did not pull the column).
  self.eq = (col: string, val: unknown) => {
    filters.push((r) => !(col in r) || r[col] === val)
    return self
  }
  self.in = (col: string, vals: unknown[]) => {
    filters.push((r) => !(col in r) || vals.includes(r[col]))
    return self
  }
  self.not = (col: string, op: string, val: unknown) => {
    if (op === 'is' && val === null) filters.push((r) => r[col] != null)
    return self
  }
  self.maybeSingle = async () => ({ data: null })
  self.then = (onFulfilled: (r: { data: unknown[] }) => unknown) =>
    Promise.resolve(onFulfilled({ data: rowsFor(table).filter((r) => filters.every((f) => f(r))) }))
  return self
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => qbuilder(table) }),
}))

import { needsReview, reviewCandidates } from './poster-observer'
import { scorePosterCounts } from '@/lib/events/poster-quality'

/** Add N published outreach posts (poster_scan) for one poster. */
function addPosts(posterId: string, n: number, opts: { removedIdx?: number[] } = {}) {
  const removed = new Set(opts.removedIdx ?? [])
  for (let i = 0; i < n; i++) {
    dbState.events.push({
      id: `${posterId}-e${i}`,
      posted_by_profile_id: posterId,
      status: 'published',
      host_id: null,
      claimed_at: null,
      removed_at: removed.has(i) ? '2026-06-02T00:00:00Z' : null,
      source: 'poster_scan',
    })
  }
}

/** Give event ids a real 'going' RSVP from an established member. */
function addRealRsvps(eventIds: string[]) {
  for (const id of eventIds) {
    dbState.rsvps.push({ event_id: id, profile_id: 'established-member', status: 'going' })
  }
  dbState.memberships = [{ profile_id: 'established-member' }]
}

beforeEach(() => {
  dbState.events = []
  dbState.rsvps = []
  dbState.memberships = []
  dbState.practiceLogs = []
  dbState.claimLedger = []
  dbState.creatorTips = []
})

// ── needsReview: the pure selection predicate ────────────────────────────────

describe('needsReview', () => {
  it('watch and throttled bands always need review', () => {
    expect(needsReview(scorePosterCounts({ posted: 6, engaged: 0, claimed: 0, removed: 0 }))).toBe(true) // watch
    expect(needsReview(scorePosterCounts({ posted: 10, engaged: 0, claimed: 0, removed: 0 }))).toBe(true) // throttled
    expect(needsReview(scorePosterCounts({ posted: 3, engaged: 3, claimed: 0, removed: 2 }))).toBe(true) // throttled via removals
  })

  it('a healthy high-volume poster (5+ posted) gets a look too', () => {
    const trusted = scorePosterCounts({ posted: 5, engaged: 4, claimed: 0, removed: 0 })
    expect(trusted.band).toBe('trusted')
    expect(needsReview(trusted)).toBe(true)
  })

  it('new and low-volume healthy posters are left alone', () => {
    expect(needsReview(scorePosterCounts({ posted: 2, engaged: 0, claimed: 0, removed: 0 }))).toBe(false) // new
    expect(needsReview(scorePosterCounts({ posted: 4, engaged: 2, claimed: 0, removed: 0 }))).toBe(false) // trusted, low volume
    expect(needsReview(scorePosterCounts({ posted: 4, engaged: 1, claimed: 0, removed: 0 }))).toBe(false) // neutral, low volume
  })
})

// ── reviewCandidates: who actually gets reviewed this run ────────────────────

describe('reviewCandidates', () => {
  it('selects watch and throttled posters with their quality attached', async () => {
    addPosts('watcher', 6) // 6 posted, 0 engaged → watch
    addPosts('spammer', 10) // 10 posted, 0 engaged → throttled
    const out = await reviewCandidates()
    const byId = new Map(out.map((c) => [c.posterId, c.quality]))
    expect(byId.get('watcher')?.band).toBe('watch')
    expect(byId.get('spammer')?.band).toBe('throttled')
  })

  it('selects a healthy high-volume poster but skips a low-volume one', async () => {
    addPosts('prolific', 5)
    addRealRsvps(['prolific-e0', 'prolific-e1', 'prolific-e2', 'prolific-e3'])
    addPosts('casual', 2)
    const out = await reviewCandidates()
    expect(out.map((c) => c.posterId)).toEqual(['prolific'])
    expect(out[0].quality.band).toBe('trusted')
    expect(out[0].quality.posted).toBe(5)
  })

  it('skips posters who already have a live event tip or flag', async () => {
    addPosts('watcher', 6)
    addPosts('spammer', 10)
    dbState.creatorTips = [
      { creator_id: 'spammer', content_type: 'event', status: 'draft' },
    ]
    const out = await reviewCandidates()
    expect(out.map((c) => c.posterId)).toEqual(['watcher'])
  })

  it('a dismissed or sent event tip does not block a fresh review', async () => {
    addPosts('watcher', 6)
    dbState.creatorTips = [
      { creator_id: 'watcher', content_type: 'event', status: 'dismissed' },
      { creator_id: 'watcher', content_type: 'event', status: 'sent' },
    ]
    const out = await reviewCandidates()
    expect(out.map((c) => c.posterId)).toEqual(['watcher'])
  })

  it('a live tip about other content (journey) does not block an event review', async () => {
    addPosts('watcher', 6)
    dbState.creatorTips = [{ creator_id: 'watcher', content_type: 'journey', status: 'draft' }]
    const out = await reviewCandidates()
    expect(out.map((c) => c.posterId)).toEqual(['watcher'])
  })

  it('caps a run at 10 posters', async () => {
    for (let i = 0; i < 12; i++) addPosts(`spammer-${i}`, 8) // all throttled
    const out = await reviewCandidates()
    expect(out).toHaveLength(10)
  })
})
