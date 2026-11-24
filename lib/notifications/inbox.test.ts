import { describe, expect, it } from 'vitest'
import { inboxCounts, inboxView, parseInboxView, snoozeUntil, type InboxItem } from './inbox'

const NOW = new Date('2026-11-24T18:00:00Z')
function n(id: string, type: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    type,
    reference_type: null,
    reference_id: null,
    body: 'x',
    read_at: null,
    created_at: '2026-11-24T17:00:00Z',
    actor: null,
    snoozed_until: null,
    archived_at: null,
    ...extra,
  }
}

const items = [
  n('tag', 'mention'),
  n('dm', 'direct_message', { read_at: '2026-11-24T17:30:00Z' }),
  n('assign', 'plan_assign'),
  n('rsvp', 'event_rsvp'),
  n('done', 'mention', { archived_at: '2026-11-24T17:10:00Z' }),
  n('later', 'mention', { snoozed_until: '2026-11-25T09:00:00Z' }),
  n('soon', 'event_rsvp', { snoozed_until: '2026-11-24T19:00:00Z' }),
  n('back', 'event_rsvp', { snoozed_until: '2026-11-24T12:00:00Z' }),
]

describe('the Inbox views (LIVE-2526)', () => {
  it('puts tags, DMs and hand-overs in Priority and the rest in Other; Done leaves both', () => {
    expect(inboxView(items, 'priority', NOW).map((x) => x.id)).toEqual(['tag', 'dm', 'assign'])
    expect(inboxView(items, 'other', NOW).map((x) => x.id)).toEqual(['rsvp', 'back'])
  })

  it('holds a snoozed notice until its time, soonest back first', () => {
    expect(inboxView(items, 'snoozed', NOW).map((x) => x.id)).toEqual(['soon', 'later'])
  })

  it('counts unread per view and every snoozed row', () => {
    expect(inboxCounts(items, NOW)).toEqual({ priority: 2, other: 2, snoozed: 2 })
  })

  it('reads the view from the URL and falls back to Priority', () => {
    expect(parseInboxView('other')).toBe('other')
    expect(parseInboxView(['snoozed'])).toBe('snoozed')
    expect(parseInboxView('admin')).toBe('priority')
    expect(parseInboxView(undefined)).toBe('priority')
  })

  it('turns a snooze choice into a time and refuses anything else', () => {
    expect(snoozeUntil('3h', NOW)).toBe('2026-11-24T21:00:00.000Z')
    expect(snoozeUntil('7d', NOW)).toBe('2026-12-01T18:00:00.000Z')
    expect(snoozeUntil('forever', NOW)).toBeNull()
  })
})
