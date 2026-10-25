import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailPayload } from '@/lib/email'
const state = vi.hoisted(() => ({ failRefundQueue: false, tickets: [] as Record<string, unknown>[], rsvps: [] as Record<string, unknown>[], emails: [] as EmailPayload[], refunds: vi.fn() }))
vi.mock('@/lib/queue/outbox', () => ({ enqueue: async (kind: string, payload: Record<string, unknown>) => {
  if (kind === 'ticket_refund' && state.failRefundQueue) throw new Error('Synthetic queue refusal')
  if (kind === 'email') state.emails.push(payload as unknown as EmailPayload)
} }))
vi.mock('@/lib/billing/tickets', () => ({ refundTicket: (...args: unknown[]) => state.refunds(...args) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: async () => ({ allowed: true }) }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: async () => false }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildUnsubscribeUrl: () => 'https://frequencylocal.com/unsubscribe/synthetic' }))
vi.mock('@/lib/events/event-lifecycle', () => ({ cancelAudit: async () => {} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'synthetic-member@example.com' } } }) } },
  from: (table: string) => {
    const rows = () => table === 'event_tickets' ? state.tickets : table === 'event_rsvps' ? state.rsvps : []
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: table === 'events' ? { title: 'Synthetic cancelled event', slug: 'synthetic', starts_at: '2026-10-23T19:00:00Z', time_zone: 'UTC' } : { display_name: 'Synthetic', auth_user_id: 'synthetic-auth' }, error: null }),
      then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    }
    return q
  },
}) }))
import { refundAndNotifyForCancelledEvent } from './cancellation'
beforeEach(() => { state.failRefundQueue = false; state.tickets = []; state.rsvps = []; state.emails = []; state.refunds.mockReset() })
describe('cancelled-event email follows successful refund request enqueue', () => {
  for (const guest of [false, true]) {
    it(`${guest ? 'guest' : 'member'} gets no refund-success email when its only refund job is refused`, async () => {
      state.tickets = [{ id: 'synthetic-ticket', buyer_profile_id: guest ? null : 'synthetic-member', guest_email: guest ? 'synthetic-guest@example.com' : null }]
      state.failRefundQueue = true
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try { await refundAndNotifyForCancelledEvent('synthetic-event') } finally { log.mockRestore() }
      expect(state.emails).toHaveLength(0)
      expect(state.refunds).not.toHaveBeenCalled()
    })
    it(`${guest ? 'guest' : 'member'} failed ticket refund plus RSVP fallback makes no refund or recipient-type assertion`, async () => {
      state.tickets = [{ id: 'synthetic-ticket', buyer_profile_id: guest ? null : 'synthetic-member', guest_email: guest ? 'synthetic-guest@example.com' : null }]
      state.rsvps = [{ profile_id: guest ? null : 'synthetic-member', guest_email: guest ? 'synthetic-guest@example.com' : null, guest_name: 'Synthetic' }]
      state.failRefundQueue = true
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})
      try { await refundAndNotifyForCancelledEvent('synthetic-event') } finally { log.mockRestore() }
      expect(state.refunds).not.toHaveBeenCalled()
      expect(state.emails).toHaveLength(1)
      for (const part of [state.emails[0].html, state.emails[0].text ?? '']) {
        expect(part).toContain('cancelled')
        expect(part).not.toMatch(/refund.*(?:requested|completed)|fully refunded|refunded in full|used.*RSVP|no longer need this RSVP|nothing you need to do/i)
        if (guest) { expect(part).toContain('hold a place at'); expect(part).toContain('You do not need to attend') }
      }
    })
    it(`${guest ? 'guest' : 'member'} queued refund renders requested wording before any processor call`, async () => {
      state.tickets = [{ id: 'synthetic-ticket', buyer_profile_id: guest ? null : 'synthetic-member', guest_email: guest ? 'synthetic-guest@example.com' : null }]
      await refundAndNotifyForCancelledEvent('synthetic-event')
      expect(state.refunds).not.toHaveBeenCalled()
      expect(state.emails).toHaveLength(1)
      const mail = state.emails[0]
      for (const part of [mail.html, mail.text ?? '']) {
        expect(part).toContain('A full refund has been requested for your ticket.')
        expect(part).not.toMatch(/fully refunded|refunded in full|charge.*(?:has been|is being) reversed/i)
      }
    })
  }
})
