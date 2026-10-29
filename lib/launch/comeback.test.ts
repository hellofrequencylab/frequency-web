import { describe, expect, it } from 'vitest'
import { comebackDue, COMEBACK_KINDS, isComebackKind, type ComebackSent } from './comeback'
import { toSnapshot } from './state'

// VLS-26 / VLS-27: when a come-back email is owed. Every case is a launch row, what was already sent, a clock and a zone.

const LA = 'America/Los_Angeles'
// The person stopped at 11:00 PDT on Tuesday 27 October 2026 (18:00Z).
const STOP = '2026-10-27T18:00:00Z'
const at = (iso: string) => new Date(iso)
const hoursAfter = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000)

const launch = (over: Record<string, unknown> = {}, beat?: string | null) => ({
  ...toSnapshot({ id: 'l1', owner_id: 'p1', niche: 'coaches', started_at: '2026-10-27T17:00:00Z', updated_at: STOP, steps: { spotlight: { status: 'published' } }, ...over })!,
  clockLastBeatAt: beat ?? null,
})
const sent = (...kinds: [string, string][]): ComebackSent[] => kinds.map(([kind, sentAt]) => ({ kind: kind as ComebackSent['kind'], sentAt }))

describe('the three emails', () => {
  it('names exactly three kinds, in order', () => {
    expect(COMEBACK_KINDS).toEqual(['comeback_1h', 'comeback_1d', 'comeback_3d'])
    expect(isComebackKind('comeback_1d')).toBe(true)
    expect(isComebackKind('nope')).toBe(false)
  })

  it('sends nothing before an hour has passed', () => {
    expect(comebackDue(hoursAfter(STOP, 0.99), launch(), [], LA)).toEqual({ kind: null, why: 'not_yet' })
  })

  it('sends the one-hour email at an hour, inside the hours', () => {
    expect(comebackDue(hoursAfter(STOP, 1), launch(), [], LA)).toEqual({ kind: 'comeback_1h' })
  })

  it('sends the one-day email a day after they stopped once the first is out', () => {
    const s = sent(['comeback_1h', '2026-10-27T19:05:00Z'])
    expect(comebackDue(hoursAfter(STOP, 23.9), launch(), s, LA)).toEqual({ kind: null, why: 'not_yet' })
    expect(comebackDue(hoursAfter(STOP, 24), launch(), s, LA)).toEqual({ kind: 'comeback_1d' })
  })

  it('sends the three-day email at three days', () => {
    const s = sent(['comeback_1h', '2026-10-27T19:05:00Z'], ['comeback_1d', '2026-10-28T18:05:00Z'])
    expect(comebackDue(hoursAfter(STOP, 71), launch(), s, LA)).toEqual({ kind: null, why: 'not_yet' })
    expect(comebackDue(hoursAfter(STOP, 72), launch(), s, LA)).toEqual({ kind: 'comeback_3d' })
  })

  it('never sends a fourth', () => {
    const s = sent(['comeback_1h', '2026-10-27T19:05:00Z'], ['comeback_1d', '2026-10-28T18:05:00Z'], ['comeback_3d', '2026-10-30T18:05:00Z'])
    expect(comebackDue(hoursAfter(STOP, 200), launch(), s, LA)).toEqual({ kind: null, why: 'all_sent' })
  })

  it('counts a skipped kind (an opt-out is logged as a kind) as used', () => {
    const s = sent(['comeback_1h', '2026-10-27T19:05:00Z'])
    expect(comebackDue(hoursAfter(STOP, 24), launch(), s, LA)).toEqual({ kind: 'comeback_1d' })
    const both = [...s, ...sent(['comeback_1d', '2026-10-28T18:00:00Z'])]
    expect(comebackDue(hoursAfter(STOP, 24.5), launch(), both, LA)).toEqual({ kind: null, why: 'not_yet' })
  })
})

describe('the hours: 8am up to 8pm where they are', () => {
  // Stopped 9:30pm PDT Tuesday (04:30Z Wednesday). The one-hour email is due at 10:30pm, which is night.
  const NIGHT_STOP = '2026-10-28T04:30:00Z'
  const night = () => launch({ updated_at: NIGHT_STOP })

  it('holds a due email at night and sends it at 8am', () => {
    expect(comebackDue(at('2026-10-28T05:30:00Z'), night(), [], LA)).toEqual({ kind: null, why: 'outside_hours' })
    expect(comebackDue(at('2026-10-28T14:59:00Z'), night(), [], LA)).toEqual({ kind: null, why: 'outside_hours' }) // 7:59am PDT
    expect(comebackDue(at('2026-10-28T15:00:00Z'), night(), [], LA)).toEqual({ kind: 'comeback_1h' }) // 8:00am PDT
  })

  it('stops at 8pm: 7:59pm sends, 8:00pm does not', () => {
    const l = launch({ updated_at: '2026-10-28T00:00:00Z' }) // stopped 5pm PDT
    expect(comebackDue(at('2026-10-28T02:59:00Z'), l, [], LA)).toEqual({ kind: 'comeback_1h' }) // 7:59pm PDT
    expect(comebackDue(at('2026-10-28T03:00:00Z'), l, [], LA)).toEqual({ kind: null, why: 'outside_hours' }) // 8:00pm PDT
  })

  it('reads the hour in the person\'s zone, not the server\'s', () => {
    const l = launch()
    const now = hoursAfter(STOP, 1) // 19:00Z: 12:00 in LA, 15:00 in New York, 04:00 next day in Tokyo, 08:00 next day in Auckland
    expect(comebackDue(now, l, [], 'America/New_York')).toEqual({ kind: 'comeback_1h' })
    expect(comebackDue(now, l, [], 'Asia/Tokyo')).toEqual({ kind: null, why: 'outside_hours' })
    expect(comebackDue(now, l, [], 'Pacific/Auckland')).toEqual({ kind: 'comeback_1h' }) // 8:00am NZDT
    expect(comebackDue(now, l, [], 'Asia/Kolkata')).toEqual({ kind: null, why: 'outside_hours' }) // 00:30
  })

  it('follows daylight saving: the same UTC instant is a different local hour either side of the change', () => {
    // New York falls back at 06:00Z on Sunday 1 November 2026 (EDT, UTC-4, to EST, UTC-5).
    const l = (updated_at: string) => launch({ updated_at })
    // Saturday 31 October, still EDT: 12:00Z is 8:00am.
    expect(comebackDue(at('2026-10-31T12:00:00Z'), l('2026-10-31T10:00:00Z'), [], 'America/New_York')).toEqual({ kind: 'comeback_1h' })
    expect(comebackDue(at('2026-10-31T11:59:00Z'), l('2026-10-31T10:00:00Z'), [], 'America/New_York')).toEqual({ kind: null, why: 'outside_hours' })
    // Monday 2 November, EST: 12:00Z is now 7:00am (closed) and 13:00Z is 8:00am.
    expect(comebackDue(at('2026-11-02T12:00:00Z'), l('2026-11-02T10:00:00Z'), [], 'America/New_York')).toEqual({ kind: null, why: 'outside_hours' })
    expect(comebackDue(at('2026-11-02T13:00:00Z'), l('2026-11-02T10:00:00Z'), [], 'America/New_York')).toEqual({ kind: 'comeback_1h' })
  })

  it('follows the spring change: the closing hour moves with the offset', () => {
    // Los Angeles springs forward at 10:00Z on Sunday 14 March 2027. On Monday 15 March the offset is -7, so 02:59Z Tuesday is 7:59pm and 03:00Z is 8pm.
    const l = launch({ updated_at: '2027-03-15T20:00:00Z' })
    expect(comebackDue(at('2027-03-16T02:59:00Z'), l, [], LA)).toEqual({ kind: 'comeback_1h' })
    expect(comebackDue(at('2027-03-16T03:00:00Z'), l, [], LA)).toEqual({ kind: null, why: 'outside_hours' })
  })

  it('skips rather than guess when the zone is unknown or junk', () => {
    const now = hoursAfter(STOP, 1)
    expect(comebackDue(now, launch(), [], null)).toEqual({ kind: null, why: 'no_zone' })
    expect(comebackDue(now, launch(), [], undefined)).toEqual({ kind: null, why: 'no_zone' })
    expect(comebackDue(now, launch(), [], '')).toEqual({ kind: null, why: 'no_zone' })
    expect(comebackDue(now, launch(), [], 'Not/AZone')).toEqual({ kind: null, why: 'no_zone' })
  })

  it('waits at most a day for a reasonable hour, then drops that email and moves on', () => {
    // The one-hour email was due at noon PDT on Tuesday but the cron was down; it is now Thursday 9am PDT, a day and a half late.
    const now = at('2026-10-29T16:00:00Z')
    const d = comebackDue(now, launch(), [], LA)
    expect(d).toEqual({ kind: 'comeback_1d' }) // the one-hour kind is stale, the one-day kind is 4h past its target and still in range
  })

  it('says too late when every remaining kind has gone stale', () => {
    const now = hoursAfter(STOP, 72 + 25)
    expect(comebackDue(now, launch(), [], LA)).toEqual({ kind: null, why: 'too_late' })
  })
})

describe('it ends when they come back, launch, cancel or opt out', () => {
  it('stops for good once they resume after an email', () => {
    const s = sent(['comeback_1h', '2026-10-27T19:05:00Z'])
    // They came back at 20:00Z (updated_at moved) and stopped again; a day later nothing more goes out.
    const back = launch({ updated_at: '2026-10-27T20:00:00Z' })
    expect(comebackDue(at('2026-10-29T20:00:00Z'), back, s, LA)).toEqual({ kind: null, why: 'resumed' })
  })

  it('treats the clock heartbeat as activity too', () => {
    const s = sent(['comeback_1h', '2026-10-27T19:05:00Z'])
    const back = launch({}, '2026-10-27T21:00:00Z')
    expect(comebackDue(at('2026-10-29T21:00:00Z'), back, s, LA)).toEqual({ kind: null, why: 'resumed' })
  })

  it('measures from the later of updated_at and the last heartbeat', () => {
    const beat = '2026-10-27T20:30:00Z'
    expect(comebackDue(at('2026-10-27T21:00:00Z'), launch({}, beat), [], LA)).toEqual({ kind: null, why: 'not_yet' })
    expect(comebackDue(at('2026-10-27T21:30:00Z'), launch({}, beat), [], LA)).toEqual({ kind: 'comeback_1h' })
  })

  it('sends nothing for a launched launch', () => {
    expect(comebackDue(hoursAfter(STOP, 5), launch({ completed_at: '2026-10-27T18:30:00Z' }), [], LA)).toEqual({ kind: null, why: 'not_active' })
  })

  it('sends nothing for a cancelled launch or one with a cancel request open', () => {
    expect(comebackDue(hoursAfter(STOP, 5), launch({ cancel_requested_at: STOP, cancelled_at: STOP }), [], LA)).toEqual({ kind: null, why: 'not_active' })
    expect(comebackDue(hoursAfter(STOP, 0.1), launch({ cancel_requested_at: STOP }), [], LA)).toEqual({ kind: null, why: 'not_active' })
  })

  it('sends nothing when every step is already settled', () => {
    const steps = Object.fromEntries(['spotlight', 'space', 'offer', 'website', 'event', 'circle', 'journey', 'people', 'paid'].map((id) => [id, { status: 'published' }]))
    expect(comebackDue(hoursAfter(STOP, 5), launch({ steps }), [], LA)).toEqual({ kind: null, why: 'not_active' })
  })

  it('stays quiet when the stored times are junk', () => {
    const l = { ...launch(), updatedAt: 'not a date', clockLastBeatAt: 'also junk' }
    expect(comebackDue(hoursAfter(STOP, 5), l, [], LA)).toEqual({ kind: null, why: 'not_active' })
  })
})

describe('spacing', () => {
  it('keeps two emails at least twelve hours apart', () => {
    // The one-hour email went out late, at 8:00am PDT the next morning, and the one-day target (11:00am PDT) is a few hours after it.
    const s = sent(['comeback_1h', '2026-10-28T15:00:00Z'])
    expect(comebackDue(at('2026-10-28T18:00:00Z'), launch(), s, LA)).toEqual({ kind: null, why: 'spacing' })
    expect(comebackDue(at('2026-10-29T03:00:00Z'), launch(), s, LA)).toEqual({ kind: null, why: 'outside_hours' })
    expect(comebackDue(at('2026-10-29T15:00:00Z'), launch(), s, LA)).toEqual({ kind: 'comeback_1d' })
  })
})
