import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseRecorder, recorded, type SupabaseRecorder } from './supabase-recorder'

// Regression tests for the confused-deputy IDORs fixed in ADR-274: a server action authorizes
// a caller-supplied `eventId`, so the underlying mutation MUST bind the resource to that event
// (not mutate by a bare resource id). These assert the scoping filter is present on the actual
// Supabase query, using the chainable recorder (no live DB needed). If a future refactor drops
// the `.eq('event_id', …)`, these fail.

// A hoisted holder the admin-client mock reads lazily; the recorder is (re)created per test in
// beforeEach (vi.mock factories can't reference non-hoisted module vars).
const h = vi.hoisted(() => ({ client: null as unknown as SupabaseRecorder }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.client }))
// tickets.ts pulls the Stripe module graph (the `stripe` package isn't installed in this
// sandbox); mock its billing deps so the unit under test loads in isolation.
vi.mock('@/lib/billing/stripe', () => ({ stripe: {}, appUrl: () => 'http://localhost', STRIPE_WEBHOOK_SECRET: 'whsec_test' }))
vi.mock('@/lib/billing/connect', () => ({ payoutsLive: async () => true, getConnectStatus: async () => ({}) }))
vi.mock('@/lib/billing/fees', () => ({ platformFeeCents: () => 0 }))
vi.mock('@/lib/finance/record', () => ({
  recordFinancialTransaction: async () => ({ recorded: true }),
  ENTITY_ID: { foundation: 'f', labs: 'l' },
}))

describe('event question mutations are event-scoped (ADR-274 IDOR regression)', () => {
  beforeEach(() => {
    h.client = makeSupabaseRecorder()
  })

  it('updateQuestion binds the update to both the question id and the event id', async () => {
    const { updateQuestion } = await import('@/lib/events/questions')
    await updateQuestion('q-from-another-event', 'event-A', { prompt: 'Hello' })
    expect(recorded(h.client, 'update')).toBe(true)
    expect(recorded(h.client, 'eq', 'id', 'q-from-another-event')).toBe(true)
    expect(recorded(h.client, 'eq', 'event_id', 'event-A')).toBe(true)
  })

  it('deleteQuestion binds the delete to both the question id and the event id', async () => {
    const { deleteQuestion } = await import('@/lib/events/questions')
    await deleteQuestion('q-from-another-event', 'event-A')
    expect(recorded(h.client, 'delete')).toBe(true)
    expect(recorded(h.client, 'eq', 'id', 'q-from-another-event')).toBe(true)
    expect(recorded(h.client, 'eq', 'event_id', 'event-A')).toBe(true)
  })
})

describe('ticket refund is event-scoped (ADR-274 critical IDOR regression)', () => {
  beforeEach(() => {
    // The ticket lookup returns no row → "Ticket not found" before any Stripe call, which is
    // exactly what a cross-event ticket id should produce once the lookup is event-scoped.
    h.client = makeSupabaseRecorder({ data: null, error: null })
  })

  it('looks the ticket up bound to the authorized event id', async () => {
    const { refundTicket } = await import('@/lib/billing/tickets')
    const r = await refundTicket('ticket-from-event-B', 'event-A')
    expect(recorded(h.client, 'eq', 'id', 'ticket-from-event-B')).toBe(true)
    expect(recorded(h.client, 'eq', 'event_id', 'event-A')).toBe(true)
    // A ticket that doesn't belong to event-A is invisible → not refunded.
    expect(r).toEqual({ error: 'Ticket not found.' })
  })
})
