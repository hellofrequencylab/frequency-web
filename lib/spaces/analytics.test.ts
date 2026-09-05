import { describe, it, expect, vi, beforeEach } from 'vitest'

// ENTITY-PROFILE TELEMETRY (the first signal on /spaces profiles). What is locked here — all
// network-free (the engagement ledger is mocked):
//   1. A profile VIEW records the named `space.profile_view` event into the EXISTING engagement
//      ledger, on the `web` source, carrying the viewer as actor and the space_id in `context`.
//   2. The view idempotency key buckets per (space, viewer, UTC day) — a reload the same day is
//      one bucket; an anonymous viewer collapses to a single daily bucket per space.
//   3. A CTA CLICK records the named `space.cta_click` event; each click is its own row (no
//      idempotency collapse), tagged with the space_id.
//   4. FAIL-SAFE: a throwing ledger never throws out of either recorder (telemetry can't break a
//      render), and an empty spaceId is a guarded no-op (nothing is written).

type LedgerInput = {
  idempotencyKey: string
  source: string
  eventType: string
  actorProfileId: string | null
  context: Record<string, unknown>
}

// ── Mock the existing engagement ledger (the backbone we reuse) ─────────────────────────────────
const recordEngagementEvent = vi.fn((input: LedgerInput) => {
  void input
  return Promise.resolve({ recorded: true })
})
vi.mock('@/lib/engagement/events', () => ({
  recordEngagementEvent: (input: LedgerInput) => recordEngagementEvent(input),
}))

// ── Mock the admin client for the READER (scan2 L9-07): a chainable count query over a tiny in-memory
// ledger, so getSpaceProfileStats can be checked for the exact filters it binds and the number it returns.
type LedgerRow = { event_type: string; context: Record<string, unknown>; created_at: string }
const ledger: LedgerRow[] = []
let countError: { message: string } | null = null
const countQueries: Array<{ eventType?: string; spaceId?: string; since?: string }> = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'engagement_events') throw new Error(`unexpected table ${table}`)
      const q: { eventType?: string; spaceId?: string; since?: string } = {}
      countQueries.push(q)
      const api = {
        select: () => api,
        eq: (col: string, val: string) => {
          if (col === 'event_type') q.eventType = val
          if (col === 'context->>spaceId') q.spaceId = val
          return api
        },
        gte: (col: string, val: string) => {
          if (col === 'created_at') q.since = val
          return api
        },
        then: (resolve: (v: { count: number | null; error: { message: string } | null }) => void) => {
          if (countError) return resolve({ count: null, error: countError })
          const n = ledger.filter(
            (r) => r.event_type === q.eventType && r.context.spaceId === q.spaceId && r.created_at >= (q.since ?? ''),
          ).length
          return resolve({ count: n, error: null })
        },
      }
      return api
    },
  }),
}))

import { recordSpaceProfileView, recordSpaceCtaClick, getSpaceProfileStats } from './analytics'

const lastCall = (): LedgerInput => {
  const calls = recordEngagementEvent.mock.calls
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  recordEngagementEvent.mockClear()
  recordEngagementEvent.mockImplementation(async () => ({ recorded: true }))
})

describe('recordSpaceProfileView', () => {
  it('records the named view event on the web source, tagged with space_id + actor', async () => {
    await recordSpaceProfileView('space-1', 'viewer-1')
    expect(recordEngagementEvent).toHaveBeenCalledTimes(1)
    const arg = lastCall()
    expect(arg.eventType).toBe('space.profile_view')
    expect(arg.source).toBe('web')
    expect(arg.actorProfileId).toBe('viewer-1')
    expect(arg.context).toEqual({ spaceId: 'space-1' })
  })

  it('buckets the idempotency key per (space, viewer, UTC day)', async () => {
    const day = new Date().toISOString().slice(0, 10)
    await recordSpaceProfileView('space-1', 'viewer-1')
    expect(lastCall().idempotencyKey).toBe(`space_view:space-1:viewer-1:${day}`)
  })

  it('collapses an anonymous viewer to a single daily bucket per space', async () => {
    const day = new Date().toISOString().slice(0, 10)
    await recordSpaceProfileView('space-1') // no viewer id
    const arg = lastCall()
    expect(arg.actorProfileId).toBeNull()
    expect(arg.idempotencyKey).toBe(`space_view:space-1:anon:${day}`)
  })

  it('is a guarded no-op when spaceId is empty (nothing written)', async () => {
    await recordSpaceProfileView('', 'viewer-1')
    expect(recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('never throws when the ledger throws (telemetry is best-effort)', async () => {
    recordEngagementEvent.mockImplementationOnce(async () => {
      throw new Error('ledger down')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordSpaceProfileView('space-1', 'viewer-1')).resolves.toBeUndefined()
    errSpy.mockRestore()
  })
})

describe('recordSpaceCtaClick', () => {
  it('records the named CTA event tagged with space_id + actor', async () => {
    await recordSpaceCtaClick('space-1', 'viewer-1')
    const arg = lastCall()
    expect(arg.eventType).toBe('space.cta_click')
    expect(arg.source).toBe('web')
    expect(arg.actorProfileId).toBe('viewer-1')
    expect(arg.context).toEqual({ spaceId: 'space-1' })
  })

  it('gives each click its own row (distinct idempotency keys, no collapse)', async () => {
    await recordSpaceCtaClick('space-1', 'viewer-1')
    const first = lastCall().idempotencyKey
    await recordSpaceCtaClick('space-1', 'viewer-1')
    const second = lastCall().idempotencyKey
    expect(first).not.toBe(second)
    expect(first.startsWith('space_cta:space-1:viewer-1:')).toBe(true)
  })

  it('is a guarded no-op when spaceId is empty', async () => {
    await recordSpaceCtaClick('')
    expect(recordEngagementEvent).not.toHaveBeenCalled()
  })

  it('never throws when the ledger throws', async () => {
    recordEngagementEvent.mockImplementationOnce(async () => {
      throw new Error('ledger down')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordSpaceCtaClick('space-1')).resolves.toBeUndefined()
    errSpy.mockRestore()
  })
})

// ── The reader (scan2 L9-07): the first consumer of the two recorders above ─────────────────────
describe('getSpaceProfileStats', () => {
  beforeEach(() => {
    ledger.length = 0
    countQueries.length = 0
    countError = null
  })

  it('counts profile views and CTA clicks for ONE space over the trailing window', async () => {
    const now = Date.now()
    const recent = new Date(now - 2 * 86_400_000).toISOString()
    const stale = new Date(now - 45 * 86_400_000).toISOString()
    ledger.push(
      { event_type: 'space.profile_view', context: { spaceId: 'space-1' }, created_at: recent },
      { event_type: 'space.profile_view', context: { spaceId: 'space-1' }, created_at: recent },
      { event_type: 'space.profile_view', context: { spaceId: 'space-1' }, created_at: stale }, // outside 30d
      { event_type: 'space.profile_view', context: { spaceId: 'space-2' }, created_at: recent }, // other space
      { event_type: 'space.cta_click', context: { spaceId: 'space-1' }, created_at: recent },
      { event_type: 'feature.used', context: { spaceId: 'space-1' }, created_at: recent }, // other type
    )
    const stats = await getSpaceProfileStats('space-1', 30)
    expect(stats).toEqual({ windowDays: 30, profileViews: 2, ctaClicks: 1 })
    // Both counts bind the event type, the space, and the window (never an unbounded ledger scan).
    expect(countQueries.map((q) => q.eventType).sort()).toEqual(['space.cta_click', 'space.profile_view'])
    for (const q of countQueries) {
      expect(q.spaceId).toBe('space-1')
      expect(q.since).toBeTruthy()
    }
  })

  it('is a guarded no-op for an empty spaceId (no query, zeros)', async () => {
    const stats = await getSpaceProfileStats('')
    expect(stats).toEqual({ windowDays: 30, profileViews: 0, ctaClicks: 0 })
    expect(countQueries).toHaveLength(0)
  })

  it('reads the supabase error and falls back to zero rather than throwing into the dashboard', async () => {
    countError = { message: 'relation is on fire' }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getSpaceProfileStats('space-1')).resolves.toEqual({ windowDays: 30, profileViews: 0, ctaClicks: 0 })
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
