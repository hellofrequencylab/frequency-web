import { describe, expect, it } from 'vitest'
import { DRAFT_REMINDER_KINDS, draftReminderDue, isDraftReminderKind, type DraftReminderSent } from './draft-recovery'

// LIVE-1968: when a draft reminder is owed. Every case is a saved draft, what was already sent, a clock and a zone.

const LA = 'America/Los_Angeles'
// The person last saved at 11:00 PDT on Tuesday 27 October 2026 (18:00Z).
const STOP = '2026-10-27T18:00:00Z'
const hoursAfter = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000)
const draft = (over: Partial<{ savedAt: string; convertedAt: string | null; unsubscribedAt: string | null; handleTaken: boolean }> = {}) => ({
  savedAt: STOP, convertedAt: null, unsubscribedAt: null, handleTaken: false, ...over,
})
const sent = (...kinds: [string, string][]): DraftReminderSent[] => kinds.map(([kind, sentAt]) => ({ kind: kind as DraftReminderSent['kind'], sentAt }))

describe('the three reminders', () => {
  it('names exactly three kinds, in order', () => {
    expect(DRAFT_REMINDER_KINDS).toEqual(['draft_1h', 'draft_1d', 'draft_3d'])
    expect(isDraftReminderKind('draft_1d')).toBe(true)
    expect(isDraftReminderKind('comeback_1d')).toBe(false)
  })

  it('sends nothing before an hour has passed, and the one-hour email at an hour', () => {
    expect(draftReminderDue(hoursAfter(STOP, 0.99), draft(), [], LA)).toEqual({ kind: null, why: 'not_yet' })
    expect(draftReminderDue(hoursAfter(STOP, 1), draft(), [], LA)).toEqual({ kind: 'draft_1h' })
  })

  it('sends the one-day and three-day emails from the same stop once the earlier one is out', () => {
    const s1 = sent(['draft_1h', '2026-10-27T19:05:00Z'])
    expect(draftReminderDue(hoursAfter(STOP, 23.9), draft(), s1, LA)).toEqual({ kind: null, why: 'not_yet' })
    expect(draftReminderDue(hoursAfter(STOP, 24), draft(), s1, LA)).toEqual({ kind: 'draft_1d' })
    const s2 = sent(['draft_1h', '2026-10-27T19:05:00Z'], ['draft_1d', '2026-10-28T18:05:00Z'])
    expect(draftReminderDue(hoursAfter(STOP, 71), draft(), s2, LA)).toEqual({ kind: null, why: 'not_yet' })
    expect(draftReminderDue(hoursAfter(STOP, 72), draft(), s2, LA)).toEqual({ kind: 'draft_3d' })
  })

  it('never sends a fourth', () => {
    const all = DRAFT_REMINDER_KINDS.map((k, i) => ({ kind: k, sentAt: hoursAfter(STOP, (i + 1) * 20).toISOString() }))
    expect(draftReminderDue(hoursAfter(STOP, 200), draft(), all, LA)).toEqual({ kind: null, why: 'all_sent' })
  })
})

describe('local hours', () => {
  it('holds an email that falls at night and sends it at 8am local', () => {
    const night = draft({ savedAt: '2026-10-28T04:30:00Z' }) // 9:30pm PDT
    expect(draftReminderDue(new Date('2026-10-28T05:30:00Z'), night, [], LA)).toEqual({ kind: null, why: 'outside_hours' })
    expect(draftReminderDue(new Date('2026-10-28T15:00:00Z'), night, [], LA)).toEqual({ kind: 'draft_1h' })
  })

  it('7:59pm is open, 8:00pm is closed', () => {
    const evening = draft({ savedAt: '2026-10-28T00:00:00Z' }) // 5pm PDT
    expect(draftReminderDue(new Date('2026-10-28T02:59:00Z'), evening, [], LA)).toEqual({ kind: 'draft_1h' })
    expect(draftReminderDue(new Date('2026-10-28T03:00:00Z'), evening, [], LA)).toEqual({ kind: null, why: 'outside_hours' })
  })

  it('sends nothing with no known zone, ever', () => {
    expect(draftReminderDue(hoursAfter(STOP, 1), draft(), [], null)).toEqual({ kind: null, why: 'no_zone' })
    expect(draftReminderDue(hoursAfter(STOP, 1), draft(), [], 'Not/AZone')).toEqual({ kind: null, why: 'no_zone' })
  })

  it('drops an email more than a day late and moves to the next kind', () => {
    // Two days after the stop, nothing sent: the 1h email is too stale, the 1d one is due.
    expect(draftReminderDue(hoursAfter(STOP, 48), draft(), [], LA)).toEqual({ kind: 'draft_1d' })
    // Ten days after: everything is stale.
    expect(draftReminderDue(hoursAfter(STOP, 240), draft(), [], LA)).toEqual({ kind: null, why: 'too_late' })
  })

  it('keeps twelve hours between two emails', () => {
    const lateFirst = sent(['draft_1h', hoursAfter(STOP, 20).toISOString()])
    expect(draftReminderDue(hoursAfter(STOP, 24), draft(), lateFirst, LA)).toEqual({ kind: null, why: 'spacing' })
  })
})

describe('how it ends', () => {
  it('a save after the last email ends it for good', () => {
    const s = sent(['draft_1h', '2026-10-27T19:05:00Z'])
    expect(draftReminderDue(new Date('2026-10-29T20:00:00Z'), draft({ savedAt: '2026-10-27T20:00:00Z' }), s, LA)).toEqual({ kind: null, why: 'resumed' })
  })

  it('a converted or unsubscribed draft gets nothing', () => {
    expect(draftReminderDue(hoursAfter(STOP, 5), draft({ convertedAt: STOP }), [], LA)).toEqual({ kind: null, why: 'ended' })
    expect(draftReminderDue(hoursAfter(STOP, 5), draft({ unsubscribedAt: STOP }), [], LA)).toEqual({ kind: null, why: 'ended' })
  })

  it('skips the day-3 email when the handle is taken, and only that one', () => {
    const s2 = sent(['draft_1h', '2026-10-27T19:05:00Z'], ['draft_1d', '2026-10-28T18:05:00Z'])
    expect(draftReminderDue(hoursAfter(STOP, 72), draft({ handleTaken: true }), s2, LA)).toEqual({ kind: null, why: 'handle_taken' })
    expect(draftReminderDue(hoursAfter(STOP, 1), draft({ handleTaken: true }), [], LA)).toEqual({ kind: 'draft_1h' })
  })
})
