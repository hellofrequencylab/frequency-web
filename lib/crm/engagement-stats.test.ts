import { describe, it, expect } from 'vitest'
import {
  summarizeEngagement,
  recencyBandFor,
  EMPTY_ENGAGEMENT_STATS,
  type EmailEventLite,
} from './engagement-stats'
import type { ContactInteraction } from './interactions'

function interaction(over: Partial<ContactInteraction>): ContactInteraction {
  return {
    id: 'i1',
    ownerProfileId: 'owner',
    subjectKind: 'contact',
    subjectId: 'c1',
    spaceId: null,
    channel: 'email',
    direction: 'outbound',
    summary: null,
    body: null,
    metadata: {},
    source: 'manual',
    occurredAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }
}

describe('recencyBandFor', () => {
  it('buckets a day count', () => {
    expect(recencyBandFor(null)).toBe('none')
    expect(recencyBandFor(0)).toBe('today')
    expect(recencyBandFor(3)).toBe('this_week')
    expect(recencyBandFor(20)).toBe('this_month')
    expect(recencyBandFor(90)).toBe('stale')
  })
})

describe('summarizeEngagement', () => {
  const now = Date.parse('2026-06-10T00:00:00.000Z')

  it('returns an all-zero block for empty input', () => {
    expect(summarizeEngagement([], [], now)).toEqual(EMPTY_ENGAGEMENT_STATS)
  })

  it('counts sent (outbound messages) and replied (inbound messages) across channels', () => {
    const out = summarizeEngagement(
      [
        interaction({ id: 'a', channel: 'email', direction: 'outbound' }),
        interaction({ id: 'b', channel: 'in_app', direction: 'outbound' }),
        interaction({ id: 'c', channel: 'sms', direction: 'inbound' }),
        interaction({ id: 'd', channel: 'note', direction: 'internal' }), // not a message, not counted
        interaction({ id: 'e', channel: 'call', direction: 'outbound' }), // a call is not a "sent" message
      ],
      [],
      now,
    )
    expect(out.sent).toBe(2)
    expect(out.replied).toBe(1)
    expect(out.touches).toBe(5)
  })

  it('counts opened and clicked from email events', () => {
    const events: EmailEventLite[] = [
      { event_type: 'opened', created_at: '2026-06-02T00:00:00.000Z' },
      { event_type: 'opened', created_at: '2026-06-03T00:00:00.000Z' },
      { event_type: 'clicked', created_at: '2026-06-03T00:00:00.000Z' },
      { event_type: 'delivered', created_at: '2026-06-01T00:00:00.000Z' },
    ]
    const out = summarizeEngagement([interaction({})], events, now)
    expect(out.opened).toBe(2)
    expect(out.clicked).toBe(1)
  })

  it('takes the newest interaction as last-touch and buckets recency (email opens do not count)', () => {
    const out = summarizeEngagement(
      [
        interaction({ id: 'old', occurredAt: '2026-01-01T00:00:00.000Z' }),
        interaction({ id: 'new', occurredAt: '2026-06-07T00:00:00.000Z' }),
      ],
      [{ event_type: 'opened', created_at: '2026-06-09T00:00:00.000Z' }],
      now,
    )
    expect(out.lastTouchAt).toBe('2026-06-07T00:00:00.000Z')
    expect(out.recencyDays).toBe(3)
    expect(out.recencyBand).toBe('this_week')
  })

  it('ignores a blank / unparseable occurredAt for recency', () => {
    const out = summarizeEngagement([interaction({ occurredAt: 'not-a-date' })], [], now)
    expect(out.lastTouchAt).toBeNull()
    expect(out.recencyDays).toBeNull()
    expect(out.recencyBand).toBe('none')
  })
})
