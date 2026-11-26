import { describe, it, expect, beforeEach, vi } from 'vitest'

// LIVE-2541 — a paid Founding Year is recorded on the Space's Founder row from the PAID SESSION, since its
// subscription is held as `trialing` until February 1, 2028 and the ordinary founder grant refuses that.

const h = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  writes: [] as { op: 'insert' | 'update'; row: Record<string, unknown> }[],
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: h.existing, error: null }) }) }),
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          h.writes.push({ op: 'update', row })
          return Promise.resolve({ error: null })
        },
      }),
      insert: (row: Record<string, unknown>) => {
        h.writes.push({ op: 'insert', row })
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { recordFoundingYearFromSession } from './founding-year-record'
import type Stripe from 'stripe'

const session = (over: Partial<Stripe.Checkout.Session> = {}) =>
  ({
    id: 'cs_fy',
    created: Date.parse('2026-12-01T18:00:00Z') / 1000,
    payment_status: 'paid',
    amount_total: 44100,
    client_reference_id: 'space-1',
    metadata: { kind: 'space_plan', space_id: 'space-1', plan: 'business', founding_year: 'prepay' },
    ...over,
  }) as unknown as Stripe.Checkout.Session

beforeEach(() => {
  h.existing = null
  h.writes.length = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('recordFoundingYearFromSession', () => {
  it('writes an active Founder row with the paid year on it', async () => {
    expect(await recordFoundingYearFromSession(session())).toBe(true)
    expect(h.writes).toHaveLength(1)
    const row = h.writes[0]!.row
    expect(h.writes[0]!.op).toBe('insert')
    expect(row.status).toBe('active')
    expect(row.space_id).toBe('space-1')
    expect(row.locked_rate_cents).toBe(4900)
    expect((row.meta as { founding_year: { paid_cents: number; year_ends: string } }).founding_year).toMatchObject({
      paid_cents: 44100,
      year_ends: '2028-02-01T08:00:00.000Z',
    })
  })

  it('records nothing for an unpaid, zero, or ordinary session', async () => {
    expect(await recordFoundingYearFromSession(session({ payment_status: 'unpaid' }))).toBe(false)
    expect(await recordFoundingYearFromSession(session({ amount_total: 0 }))).toBe(false)
    expect(await recordFoundingYearFromSession(session({ metadata: { kind: 'space_plan', space_id: 'space-1', plan: 'business' } }))).toBe(false)
    expect(h.writes).toHaveLength(0)
  })

  it('is a no-op on a redelivery of the same session', async () => {
    h.existing = { id: 'f1', meta: { founding_year: { session_id: 'cs_fy', paid_at: 'x' } } }
    expect(await recordFoundingYearFromSession(session())).toBe(true)
    expect(h.writes).toHaveLength(0)
  })

  it('keeps an existing row and its other notes', async () => {
    h.existing = { id: 'f1', status: 'active', locked_rate_cents: 4900, charged_at: null, meta: { source: 'owner_grant' } }
    await recordFoundingYearFromSession(session())
    expect(h.writes[0]!.op).toBe('update')
    expect((h.writes[0]!.row.meta as Record<string, unknown>).source).toBe('owner_grant')
  })
})
