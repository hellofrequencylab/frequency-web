import { describe, it, expect } from 'vitest'
import { mapResendEventToInteraction, resendIdempotencyKey } from './email-timeline'

// PURE Resend-event -> timeline mapping (ADR-378). No IO; this locks the event taxonomy + copy +
// the exactly-once key shape that the webhook seam relies on.

describe('mapResendEventToInteraction', () => {
  it('maps an open / click to an inbound touch', () => {
    expect(mapResendEventToInteraction('opened')).toEqual({ direction: 'inbound', summary: 'Opened an email' })
    expect(mapResendEventToInteraction('clicked')).toEqual({
      direction: 'inbound',
      summary: 'Clicked a link in an email',
    })
  })

  it('maps a bounce / complaint to an inbound deliverability touch', () => {
    expect(mapResendEventToInteraction('bounced')).toEqual({ direction: 'inbound', summary: 'Email bounced' })
    expect(mapResendEventToInteraction('complained')).toEqual({
      direction: 'inbound',
      summary: 'Marked an email as spam',
    })
  })

  it('returns null for events we do not project (delivered, sent, unknown)', () => {
    expect(mapResendEventToInteraction('delivered')).toBeNull()
    expect(mapResendEventToInteraction('sent')).toBeNull()
    expect(mapResendEventToInteraction('delivery_delayed')).toBeNull()
    expect(mapResendEventToInteraction('unknown')).toBeNull()
    expect(mapResendEventToInteraction('')).toBeNull()
  })

  it('keeps every summary plain and free of em dashes (CONTENT-VOICE)', () => {
    for (const t of ['opened', 'clicked', 'bounced', 'complained'] as const) {
      const shape = mapResendEventToInteraction(t)!
      expect(shape.summary).not.toMatch(/—/)
    }
  })
})

describe('resendIdempotencyKey', () => {
  it('builds resend:<id>:<type> for a present id', () => {
    expect(resendIdempotencyKey('re_abc123', 'opened')).toBe('resend:re_abc123:opened')
    expect(resendIdempotencyKey('  re_xyz  ', 'bounced')).toBe('resend:re_xyz:bounced')
  })

  it('returns null when the email id is missing (no stable key possible)', () => {
    expect(resendIdempotencyKey(null, 'opened')).toBeNull()
    expect(resendIdempotencyKey(undefined, 'clicked')).toBeNull()
    expect(resendIdempotencyKey('   ', 'bounced')).toBeNull()
  })
})
