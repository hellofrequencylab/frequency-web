import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ADR-880 — A TOUCH IS STAMPED ONLY WHEN IT ACTUALLY WENT OUT.
//
// THE DEFECT. supabase-js RESOLVES with `{ data, error }` on a DB error; it does not throw. The in-app
// notification insert sat inside a try/catch and set `delivered = true` on the next line, so the catch
// was dead code and a failed insert still reported a delivery. The stamp then went down, and because
// the three reminder windows are disjoint (only recordManualPayment ever clears a stamp) that rung was
// suppressed for the WHOLE cycle: the 7-day warning simply never happened, silently, on a cash deal.
//
// The mirror-image defect lives one layer down: stampAgreementTouch discarded its own write error, so a
// stamp that never landed counted as sent and the same reminder re-sent every day. Both are the same
// habit (not reading the error supabase-js returns) pointing in opposite directions.

const { insertResult, stamped, stampResult, enqueued, agreements } = vi.hoisted(() => ({
  insertResult: { error: null as { message: string } | null },
  stamped: [] as { id: string; column: string }[],
  stampResult: { ok: true },
  enqueued: [] as { to: string }[],
  agreements: { rows: [] as unknown[] },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'notifications') {
        return { insert: () => Promise.resolve({ data: null, error: insertResult.error }) }
      }
      if (table === 'spaces') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: 'space-1', name: 'Temple of Aset', slug: 'aset', owner_profile_id: 'p-1' },
                }),
            }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: { display_name: 'Ana', auth_user_id: null } }),
            }),
          }),
        }
      }
      // space_members (the admin fan-out): nobody but the owner.
      return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) }) }
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: null } }) } },
  }),
}))

vi.mock('@/lib/email', () => ({
  enqueueEmail: (payload: { to: string }) => {
    enqueued.push(payload)
    return Promise.resolve()
  },
}))

vi.mock('@/lib/billing/manual-agreements', () => ({
  agreementsDue: () =>
    Promise.resolve({ reminder30: agreements.rows, reminder7: [], overdue: [] }),
  stampAgreementTouch: (id: string, column: string) => {
    stamped.push({ id, column })
    return Promise.resolve(stampResult.ok)
  },
}))

vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: unknown) => handler,
}))
vi.mock('@/lib/log', () => ({ log: { info: () => {}, warn: () => {}, error: () => {} } }))

import { GET } from './route'

const agreement = {
  id: 'agr-1',
  spaceId: 'space-1',
  plan: 'collective',
  interval: 'year',
  amountCents: 49000,
  method: 'cash',
  label: null,
  startedAt: '2026-07-27',
  paidThrough: '2027-07-27',
  reminder30SentAt: null,
  reminder7SentAt: null,
  overdueNoticeSentAt: null,
  status: 'active',
  note: null,
}

async function run(): Promise<{ reminder_30: { due: number; sent: number } }> {
  const res = await GET({} as NextRequest)
  return (await (res as Response).json()) as { reminder_30: { due: number; sent: number } }
}

beforeEach(() => {
  insertResult.error = null
  stamped.length = 0
  stampResult.ok = true
  enqueued.length = 0
  agreements.rows = [agreement]
})

describe('billing-renewals cron', () => {
  it('a delivered notice is stamped once and counted as sent', async () => {
    const body = await run()
    expect(stamped).toEqual([{ id: 'agr-1', column: 'reminder_30_sent_at' }])
    expect(body.reminder_30).toEqual({ due: 1, sent: 1 })
  })

  it('a FAILED in-app insert does NOT stamp the touch, so tomorrow retries', async () => {
    // The whole fan-out fails: the insert errors and the owner has no email address on file.
    insertResult.error = { message: 'permission denied for table notifications' }
    const body = await run()
    expect(stamped).toEqual([])
    expect(body.reminder_30).toEqual({ due: 1, sent: 0 })
  })

  it('a FAILED stamp is not counted as sent, even though the notice went out', async () => {
    stampResult.ok = false
    const body = await run()
    expect(stamped).toHaveLength(1) // it was attempted
    expect(body.reminder_30.sent).toBe(0) // and honestly reported as not landed
  })

  it('no agreements due is a clean, quiet run', async () => {
    agreements.rows = []
    const body = await run()
    expect(stamped).toEqual([])
    expect(body.reminder_30).toEqual({ due: 0, sent: 0 })
  })
})
