import { describe, expect, it } from 'vitest'
import { suggestTimes, wallSpanOf } from './suggest-times'

const at = (iso: string) => Date.parse(iso)
const span = (from: string, to: string) => ({ startMs: at(from), endMs: at(to) })
const dana = { id: 'dana', name: 'Dana' }
const sam = { id: 'sam', name: 'Sam' }

// 2026-12-01 is a Tuesday. Options start on Wednesday the 2nd.
const base = { people: [dana, sam], fromDayKey: '2026-12-01', durationMin: 60, spaceBusy: [] }

describe('suggestTimes', () => {
  it('offers three times on three different days, each with a reason', () => {
    const out = suggestTimes(base)
    expect(out).toHaveLength(3)
    expect(new Set(out.map((o) => o.dayKey)).size).toBe(3)
    for (const o of out) {
      expect(o.dayKey > '2026-12-01').toBe(true)
      expect(o.reason).toMatch(/^Nothing else is on the calendar then/)
      expect(o.reason).not.toMatch(/[–—!]/)
    }
  })

  it('never overlaps the Space calendar or a person busy time', () => {
    const out = suggestTimes({
      ...base,
      days: 1,
      spaceBusy: [span('2026-12-02T09:00:00Z', '2026-12-02T13:00:00Z')],
      personBusy: { sam: [span('2026-12-02T16:00:00Z', '2026-12-02T17:00:00Z')] },
      count: 3,
    })
    // Wednesday offers 10:00, 12:30, 16:00 and 18:30: the first two clash with the Space, 16:00 with Sam.
    expect(out.map((o) => o.startsAt)).toEqual(['2026-12-02T18:30:00.000Z'])
  })

  it('keeps out of quiet hours', () => {
    const out = suggestTimes({ ...base, durationMin: 180, days: 1, quietHours: { startMin: 21 * 60, endMin: 8 * 60 } })
    // 18:30 + 3h runs past 9 PM, so the evening slot is not offered.
    expect(out.every((o) => o.endMin <= 21 * 60)).toBe(true)
  })

  it('leans to the weekday and time people said yes to before, and says so', () => {
    const out = suggestTimes({
      ...base,
      pastYes: [
        { profileId: 'dana', weekday: 6, startMin: 14 * 60 },
        { profileId: 'sam', weekday: 6, startMin: 14 * 60 },
      ],
    })
    expect(out[0].dayKey).toBe('2026-12-05')
    expect(out[0].startMin).toBe(14 * 60)
    expect(out[0].reason).toContain('Dana and Sam said yes to Saturdays before')
  })

  it('steers off days people already have to-dos due, and ignores people not asked', () => {
    const out = suggestTimes({
      ...base,
      days: 2,
      count: 1,
      personDueDays: { dana: ['2026-12-02'], stranger: ['2026-12-03'] },
    })
    expect(out[0].dayKey).toBe('2026-12-03')
    expect(out[0].reason).toContain('nobody has to-dos due that day')
  })

  it('reads the people it is given, and answers none when nothing is free', () => {
    expect(suggestTimes({ ...base, days: 1, spaceBusy: [span('2026-12-02T00:00:00Z', '2026-12-03T00:00:00Z')] })).toEqual([])
    expect(suggestTimes({ ...base, fromDayKey: 'not a day' })).toEqual([])
  })
})

describe('wallSpanOf', () => {
  it('reads stored values with or without a zone, and refuses a backwards span', () => {
    expect(wallSpanOf('2026-12-02T19:00:00', '2026-12-02T20:00:00')).toEqual(span('2026-12-02T19:00:00Z', '2026-12-02T20:00:00Z'))
    expect(wallSpanOf('2026-12-02T19:00:00+00:00', null)).toEqual(span('2026-12-02T19:00:00Z', '2026-12-02T20:00:00Z'))
    expect(wallSpanOf('2026-12-02T19:00:00Z', '2026-12-02T18:00:00Z')).toBeNull()
  })
})
