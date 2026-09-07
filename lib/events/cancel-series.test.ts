import { describe, it, expect, beforeEach, vi } from 'vitest'

// SERIES-CANCEL (LIVE-198). MONEY CODE, and a BULK one: "cancel this series" moves money for every
// date still to come, at once, irreversibly. What this file pins:
//   1. FUTURE ONLY — a date that already happened is never cancelled and never refunded, and
//      "already happened" is resolved through the event's OWN zone (starts_at is a wall clock kept
//      as UTC parts), so tonight's 7pm gathering survives a run made at 1pm.
//   2. NO DOUBLE REFUND — an occurrence that is already cancelled is a no-op: no flip, no email,
//      and above all NOT one more `ticket_refund` job for tickets that were already queued.
//   3. IDEMPOTENT — a second run (double-click, retry, redelivery) cancels nothing and enqueues
//      nothing.
//   4. BEST-EFFORT PER OCCURRENCE, REPORTED — a refused flip on date 3 of 5 does not stop dates 4
//      and 5, and the caller can tell exactly which dates landed.
// Refunds go through the LIVE-161 outbox path and nowhere else: every refund in here is an
// enqueued `ticket_refund` job, never an inline call.
//
// lib/time/zone.ts is REAL on purpose — the wall-clock rule is half of assertion 1.

const m = vi.hoisted(() => ({
  enqueue: vi.fn(async (_kind: string, _payload: Record<string, unknown>) => {}),
  sendEventCancelledEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  sendGuestEventCancelledEmail: vi.fn(async (_p: Record<string, unknown>) => {}),
  events: [] as Record<string, unknown>[],
  ticketsByEvent: new Map<string, Record<string, unknown>[]>(),
  /** eventId → message. Makes ONE occurrence's flip fail, so the loop's resilience is testable. */
  flipErrors: new Map<string, string>(),
  /** eventId → message. Makes ONE occurrence's fan-out throw, after its flip has landed. */
  ticketReadThrows: new Set<string>(),
}))

vi.mock('@/lib/queue/outbox', () => ({ enqueue: (k: string, p: Record<string, unknown>) => m.enqueue(k, p) }))
vi.mock('@/lib/email', () => ({
  sendEventCancelledEmail: (p: Record<string, unknown>) => m.sendEventCancelledEmail(p),
  sendGuestEventCancelledEmail: (p: Record<string, unknown>) => m.sendGuestEventCancelledEmail(p),
}))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true, reason: 'ok' }) }))
// The drain's handler is not under test here; stubbing the billing module keeps Stripe out of the file.
vi.mock('@/lib/billing/tickets', () => ({ refundTicket: async () => ({ ok: true }) }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@example.com` } } }) } },
    from: (table: string) => {
      if (table === 'events') return eventsTable()
      if (table === 'event_tickets') {
        return {
          select: () => ({
            eq: (_c1: string, eventId: string) => ({
              eq: async (_c2: string, status: string) => {
                if (m.ticketReadThrows.has(eventId)) throw new Error('ticket read exploded')
                const rows = (m.ticketsByEvent.get(eventId) ?? []).filter((t) => t.status === status)
                return { data: rows, error: null }
              },
            }),
          }),
        }
      }
      if (table === 'event_rsvps') {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: [], error: null }) }) }) }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({ data: { display_name: `Buyer ${id}`, auth_user_id: `u-${id}` }, error: null }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

/** Models the two shapes cancellation.ts asks of `events`: a single row by id, and the series read
 *  (`.or(id.eq.K,parent_event_id.eq.K).is(removed_at,null).gte(starts_at,floor).order().limit()`). */
function eventsTable() {
  return {
    select: (_cols: string) => {
      let orExpr: string | null = null
      let gte: string | null = null
      const api: Record<string, unknown> = {}
      Object.assign(api, {
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => ({ data: m.events.find((e) => e[col] === val) ?? null, error: null }),
        }),
        or: (expr: string) => { orExpr = expr; return api },
        is: () => api,
        gte: (_col: string, val: string) => { gte = val; return api },
        order: () => api,
        limit: async () => {
          const key = /id\.eq\.([^,]+)/.exec(orExpr ?? '')?.[1] ?? ''
          const rows = m.events
            .filter((e) => (e.id === key || e.parent_event_id === key) && e.removed_at == null)
            .filter((e) => (gte ? String(e.starts_at) >= gte : true))
            .sort((a, b) => (String(a.starts_at) < String(b.starts_at) ? -1 : 1))
          return { data: rows, error: null }
        },
      })
      return api
    },
    update: (patch: Record<string, unknown>) => ({
      eq: (_c1: string, id: string) => ({
        // The transition guard: `.eq('is_cancelled', false)` matches only a LIVE row, so an
        // already-cancelled occurrence comes back as zero rows exactly as Postgres would.
        eq: (col: string, expected: unknown) => ({
          select: async () => {
            const failure = m.flipErrors.get(id)
            if (failure) return { data: null, error: { message: failure } }
            const row = m.events.find((e) => e.id === id)
            if (!row || row[col] !== expected) return { data: [], error: null }
            Object.assign(row, patch)
            return { data: [{ id }], error: null }
          },
        }),
      }),
    }),
  }
}

import { cancelSeries, loadSeriesCancelPlan, TICKET_REFUND_KIND } from './cancellation'

const TZ = 'America/Los_Angeles'
/** 2026-09-07 13:00 PDT. Chosen so "tonight at 7pm" is still to come while the raw stored string
 *  (`2026-09-07T19:00:00Z`) already sorts BELOW it — the wall-clock trap this must survive. */
const NOW = new Date('2026-09-07T20:00:00Z')
const ANCHOR = 'aaaaaaaa-0000-4000-8000-000000000001'
const id = (n: number) => `aaaaaaaa-0000-4000-8000-00000000000${n}`

function ev(rowId: string, startsAt: string, extra: Record<string, unknown> = {}) {
  return {
    id: rowId,
    slug: `sit-${rowId.slice(-1)}`,
    title: 'Weekly sit',
    starts_at: startsAt,
    ends_at: null,
    time_zone: TZ,
    is_cancelled: false,
    removed_at: null,
    parent_event_id: rowId === ANCHOR ? null : ANCHOR,
    recurrence_type: rowId === ANCHOR ? 'weekly' : 'none',
    ...extra,
  }
}

function ticket(tid: string, eventId: string, buyer: string) {
  return { id: tid, event_id: eventId, status: 'succeeded', buyer_profile_id: buyer }
}

// The fixture is a weekly sit whose ANCHOR has aged out (its own date is a month gone) plus five
// children: one yesterday, one TONIGHT, one already cancelled, and two further out.
const PAST_CHILD = id(2)     // 2026-09-06, yesterday
const TONIGHT = id(3)        // 2026-09-07 19:00 PT — still to come at 13:00 PT
const CANCELLED = id(4)      // 2026-09-13, already cancelled
const NEXT = id(5)           // 2026-09-20
const LAST = id(6)           // 2026-09-27

beforeEach(() => {
  vi.clearAllMocks()
  m.flipErrors = new Map()
  m.ticketReadThrows = new Set()
  m.events = [
    ev(ANCHOR, '2026-08-09T19:00:00Z'),
    ev(PAST_CHILD, '2026-09-06T19:00:00Z'),
    ev(TONIGHT, '2026-09-07T19:00:00Z'),
    ev(CANCELLED, '2026-09-13T19:00:00Z', { is_cancelled: true }),
    ev(NEXT, '2026-09-20T19:00:00Z'),
    ev(LAST, '2026-09-27T19:00:00Z'),
  ]
  m.ticketsByEvent = new Map([
    [PAST_CHILD, [ticket('t-past', PAST_CHILD, 'b1')]],
    [TONIGHT, [ticket('t-tonight', TONIGHT, 'b1')]],
    [CANCELLED, [ticket('t-cancelled', CANCELLED, 'b2')]],
    [NEXT, [ticket('t-next-1', NEXT, 'b2'), ticket('t-next-2', NEXT, 'b3')]],
  ])
})

const refundJobs = () => m.enqueue.mock.calls.filter(([kind]) => kind === TICKET_REFUND_KIND)

describe('loadSeriesCancelPlan', () => {
  it('offers only the dates still to come, keyed on parent_event_id ?? id, with the anchor aged out', async () => {
    const plan = await loadSeriesCancelPlan(NEXT, NOW)
    expect(plan.seriesKey).toBe(ANCHOR)
    expect(plan.recurring).toBe(true)
    expect(plan.upcoming.map((o) => o.id)).toEqual([TONIGHT, CANCELLED, NEXT, LAST])
    // Four upcoming, but only three a cancel would move: the already-cancelled one is not offered.
    expect(plan.cancellable).toBe(3)
    expect(plan.truncated).toBe(false)
  })

  it('counts tonight as still to come even though its stored string sorts below `now`', async () => {
    const plan = await loadSeriesCancelPlan(ANCHOR, NOW)
    expect(plan.upcoming.map((o) => o.id)).toContain(TONIGHT)
    expect(plan.upcoming.map((o) => o.id)).not.toContain(PAST_CHILD)
  })
})

describe('cancelSeries', () => {
  it('cancels every FUTURE date exactly once and queues exactly one refund job per paid ticket', async () => {
    const res = await cancelSeries({ eventId: NEXT, actorProfileId: 'op-1', now: NOW })

    // 1. Future only. The anchor's own date and yesterday's child are out of scope entirely.
    expect(res.considered).toBe(4)
    expect(res.cancelled).toEqual([TONIGHT, NEXT, LAST])
    expect(m.events.find((e) => e.id === PAST_CHILD)?.is_cancelled).toBe(false)
    expect(m.events.find((e) => e.id === ANCHOR)?.is_cancelled).toBe(false)

    // 2. The already-cancelled date is a no-op, not a second refund.
    expect(res.alreadyCancelled).toEqual([CANCELLED])

    // 3. One `ticket_refund` job per succeeded ticket on the dates THIS call cancelled, and none
    //    at all for yesterday's date or the already-cancelled one.
    expect(refundJobs().map(([, p]) => (p as { ticketId: string }).ticketId).sort()).toEqual([
      't-next-1', 't-next-2', 't-tonight',
    ])
    expect(refundJobs()).toHaveLength(3)
    expect(res.failed).toEqual([])
    expect(res.fanoutFailed).toEqual([])
  })

  it('is idempotent: a second run cancels nothing and enqueues no refund at all', async () => {
    await cancelSeries({ eventId: NEXT, actorProfileId: 'op-1', now: NOW })
    const firstRunJobs = refundJobs().length
    expect(firstRunJobs).toBe(3)

    // Clear the FIRST run's history so the assertions below read only the second run.
    m.enqueue.mockClear()
    m.sendEventCancelledEmail.mockClear()
    const again = await cancelSeries({ eventId: NEXT, actorProfileId: 'op-1', now: NOW })
    expect(again.cancelled).toEqual([])
    expect(again.alreadyCancelled).toEqual([TONIGHT, CANCELLED, NEXT, LAST])
    expect(refundJobs()).toHaveLength(0)
    expect(m.sendEventCancelledEmail).not.toHaveBeenCalled()
  })

  it('loses a race cleanly: a row cancelled between the read and the write fans nothing out', async () => {
    // The plan reads NEXT as live, then somebody else cancels it before our guarded update runs.
    const rows = m.events
    const res = await cancelSeries({
      eventId: NEXT,
      actorProfileId: 'op-1',
      now: NOW,
      canCancel: async (occ) => {
        if (occ === NEXT) {
          // Racing writer wins the flip first. Our `.eq('is_cancelled', false)` must now match zero rows.
          const row = rows.find((e) => e.id === NEXT)!
          row.is_cancelled = true
        }
        return true
      },
    })
    expect(res.cancelled).toEqual([TONIGHT, LAST])
    expect(res.alreadyCancelled).toContain(NEXT)
    // NEXT's two tickets belong to the racer's cancel, not ours. We must not queue them a second time.
    expect(refundJobs().map(([, p]) => (p as { ticketId: string }).ticketId)).toEqual(['t-tonight'])
  })

  it('skips an occurrence the caller may not edit, and reports it', async () => {
    const res = await cancelSeries({
      eventId: NEXT,
      actorProfileId: 'op-1',
      now: NOW,
      canCancel: async (occ) => occ !== LAST,
    })
    expect(res.cancelled).toEqual([TONIGHT, NEXT])
    expect(res.unauthorized).toEqual([LAST])
    expect(m.events.find((e) => e.id === LAST)?.is_cancelled).toBe(false)
  })

  it('a refused flip on one date never stops the rest, and no money moves for it', async () => {
    m.flipErrors.set(NEXT, 'row locked')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await cancelSeries({ eventId: NEXT, actorProfileId: 'op-1', now: NOW })
    expect(res.cancelled).toEqual([TONIGHT, LAST])
    expect(res.failed).toEqual([{ id: NEXT, error: 'row locked' }])
    expect(m.events.find((e) => e.id === NEXT)?.is_cancelled).toBe(false)
    expect(refundJobs().map(([, p]) => (p as { ticketId: string }).ticketId)).toEqual(['t-tonight'])
    errSpy.mockRestore()
  })

  it('reports a date whose fan-out threw AFTER the cancel landed, instead of swallowing it', async () => {
    m.ticketReadThrows.add(NEXT)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await cancelSeries({ eventId: NEXT, actorProfileId: 'op-1', now: NOW })
    expect(res.cancelled).toEqual([TONIGHT, NEXT, LAST])
    expect(res.fanoutFailed).toEqual([NEXT])
    // The later date still went through: one failure does not abort the loop.
    expect(m.events.find((e) => e.id === LAST)?.is_cancelled).toBe(true)
    errSpy.mockRestore()
  })

  it('never refunds inline: every refund on the series path is an enqueued outbox job', async () => {
    await cancelSeries({ eventId: NEXT, actorProfileId: 'op-1', now: NOW })
    expect(m.enqueue).toHaveBeenCalled()
    for (const [kind] of m.enqueue.mock.calls) expect(kind).toBe(TICKET_REFUND_KIND)
  })
})
