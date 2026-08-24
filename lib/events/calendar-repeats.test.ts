import { describe, it, expect } from 'vitest'
import {
  cadenceChipLabel,
  computeSeriesDayKeys,
  missingAnchorIds,
  planCalendarRepeats,
  seriesAnchorIsLive,
  type RepeatAnchorRow,
  type RepeatFeedRow,
} from './calendar-repeats'

// The shapes below are the PRODUCTION shape, read from public_calendar_feed() on 2026-08-24: two
// weekly series, every loaded row a materialised child carrying recurrence_type 'none' and a
// parent_event_id, with NEITHER anchor in the feed (both anchor dates are months past the feed's
// `now() - 1 day` floor). Any grouping that keys on cadence finds zero series against this fixture,
// which is the point of it.

const BREATHE = '33071ec5-0bd9-4672-a3be-7734af39fb09'
const MELD = '7742530c-7c48-4c24-9e57-7b1fceb9c858'

function child(parent: string, title: string, startsAt: string, n: number): RepeatFeedRow {
  return {
    id: `${parent}-${n}`,
    slug: `${title.toLowerCase().replace(/\W+/g, '-')}-${startsAt.slice(0, 10)}`,
    title,
    starts_at: startsAt,
    is_cancelled: false,
    recurrence_type: 'none',
    recurrence_until: null,
    parent_event_id: parent,
  }
}

const FEED: RepeatFeedRow[] = [
  child(MELD, 'Meld - Community Cowork', '2026-08-26 10:00:00+00', 1),
  child(BREATHE, 'Breathe Connect Expand', '2026-08-27 18:30:00+00', 1),
  child(MELD, 'Meld - Community Cowork', '2026-09-02 10:00:00+00', 2),
  child(BREATHE, 'Breathe Connect Expand', '2026-09-03 18:30:00+00', 2),
  child(BREATHE, 'Breathe Connect Expand', '2026-09-10 18:30:00+00', 3),
  {
    id: 'one-off',
    slug: 'royal-reset-friday-float-2026-09-11',
    title: 'Royal Reset Friday Float',
    starts_at: '2026-09-11 10:33:00+00',
    is_cancelled: false,
    recurrence_type: 'none',
    recurrence_until: null,
    parent_event_id: null,
  },
]

const ANCHORS: RepeatAnchorRow[] = [
  {
    id: BREATHE,
    starts_at: '2026-07-16 18:30:00+00',
    recurrence_type: 'weekly',
    recurrence_until: null,
    is_cancelled: false,
    status: 'published',
    visibility: 'public',
    removed_at: null,
    is_demo: false,
  },
  {
    id: MELD,
    starts_at: '2026-08-05 10:00:00+00',
    recurrence_type: 'weekly',
    recurrence_until: null,
    is_cancelled: false,
    status: 'published',
    visibility: 'public',
    removed_at: null,
    is_demo: false,
  },
]

const NOW = new Date('2026-08-24T12:00:00.000Z')

describe('missingAnchorIds', () => {
  it('names every parent that is not itself in the loaded rows (trap 2)', () => {
    expect(missingAnchorIds(FEED).sort()).toEqual([BREATHE, MELD].sort())
  })

  it('does not ask for an anchor that is already loaded', () => {
    const withAnchor: RepeatFeedRow[] = [
      {
        id: BREATHE,
        slug: 'breathe-connect-expand',
        title: 'Breathe Connect Expand',
        starts_at: '2026-08-20 18:30:00+00',
        recurrence_type: 'weekly',
        recurrence_until: null,
        parent_event_id: null,
      },
      child(BREATHE, 'Breathe Connect Expand', '2026-08-27 18:30:00+00', 1),
    ]
    expect(missingAnchorIds(withAnchor)).toEqual([])
  })
})

describe('planCalendarRepeats — grouping', () => {
  it('groups on parent_event_id even though every child reads recurrence_type "none" (trap 1)', () => {
    const plan = planCalendarRepeats(FEED, { anchors: ANCHORS, now: NOW })
    expect(plan.series.map((s) => s.key)).toEqual([MELD, BREATHE])
    expect(plan.series.map((s) => s.name)).toEqual(['Meld - Community Cowork', 'Breathe Connect Expand'])
  })

  it('leaves a one-off out of the strip entirely', () => {
    const plan = planCalendarRepeats(FEED, { anchors: ANCHORS, now: NOW })
    expect(plan.seriesKeyByEventId['one-off']).toBeUndefined()
    expect(plan.laterDateIds).not.toContain('one-off')
  })

  it('still forms the group when no anchor could be read, without a cadence label', () => {
    const plan = planCalendarRepeats(FEED, { anchors: [], now: NOW })
    expect(plan.series).toHaveLength(2)
    expect(plan.series.map((s) => s.cadenceLabel)).toEqual(['Repeats', 'Repeats'])
    expect(plan.series.every((s) => s.pendingDayKeys.length === 0)).toBe(true)
  })
})

describe('planCalendarRepeats — next date keeps its card, later dates become dots', () => {
  it('marks every date after the first of each series as a later date', () => {
    const plan = planCalendarRepeats(FEED, { anchors: ANCHORS, now: NOW })
    // 5 series rows, 2 series -> 2 cards, 3 dots.
    expect(plan.laterDateIds.sort()).toEqual(
      [`${MELD}-2`, `${BREATHE}-2`, `${BREATHE}-3`].sort(),
    )
    expect(plan.laterDateIds).not.toContain(`${MELD}-1`)
    expect(plan.laterDateIds).not.toContain(`${BREATHE}-1`)
  })

  it('elects the EARLIEST date as the card regardless of the row order it was handed', () => {
    const shuffled = [...FEED].reverse()
    const plan = planCalendarRepeats(shuffled, { anchors: ANCHORS, now: NOW })
    const breathe = plan.series.find((s) => s.key === BREATHE)!
    expect(breathe.href).toBe('/events/breathe-connect-expand-2026-08-27')
    expect(plan.laterDateIds).toContain(`${BREATHE}-3`)
    expect(plan.laterDateIds).not.toContain(`${BREATHE}-1`)
  })

  it('maps each series row to its series key for the highlight', () => {
    const plan = planCalendarRepeats(FEED, { anchors: ANCHORS, now: NOW })
    expect(plan.seriesKeyByEventId[`${BREATHE}-3`]).toBe(BREATHE)
    expect(plan.seriesKeyByEventId[`${MELD}-1`]).toBe(MELD)
  })
})

describe('planCalendarRepeats — computed future dates are display only', () => {
  it('computes the year of Thursdays past the last materialised row', () => {
    const plan = planCalendarRepeats(FEED, { anchors: ANCHORS, now: NOW })
    const breathe = plan.series.find((s) => s.key === BREATHE)!
    expect(breathe.liveDayKeys).toEqual(['2026-08-27', '2026-09-03', '2026-09-10'])
    // Every computed date is strictly after the last row we hold, and none of them is a row.
    expect(breathe.pendingDayKeys[0]).toBe('2026-09-17')
    for (const k of breathe.pendingDayKeys) {
      expect(k > '2026-09-10').toBe(true)
      expect(breathe.liveDayKeys).not.toContain(k)
    }
    // Weekly, so every computed date is a Thursday, and they stop inside the lookahead year.
    for (const k of breathe.pendingDayKeys) expect(new Date(`${k}T00:00:00Z`).getUTCDay()).toBe(4)
    expect(breathe.pendingDayKeys[breathe.pendingDayKeys.length - 1] <= '2026-08-24').toBe(false)
    expect(breathe.pendingDayKeys[breathe.pendingDayKeys.length - 1] <= '2027-08-24').toBe(true)
  })

  it('labels the cadence with the weekday the series lands on', () => {
    const plan = planCalendarRepeats(FEED, { anchors: ANCHORS, now: NOW })
    expect(plan.series.find((s) => s.key === BREATHE)!.cadenceLabel).toBe('Thursdays')
    expect(plan.series.find((s) => s.key === MELD)!.cadenceLabel).toBe('Wednesdays')
  })

  it('stops computing at recurrence_until', () => {
    const ending: RepeatAnchorRow[] = [{ ...ANCHORS[0], recurrence_until: '2026-10-01 18:30:00+00' }]
    const plan = planCalendarRepeats(
      FEED.filter((r) => r.parent_event_id === BREATHE),
      { anchors: ending, now: NOW },
    )
    expect(plan.series[0].pendingDayKeys).toEqual(['2026-09-17', '2026-09-24', '2026-10-01'])
  })

  it('computes nothing for a series whose anchor is cancelled, hidden or unpublished', () => {
    const dead: RepeatAnchorRow[] = [
      { ...ANCHORS[0], is_cancelled: true },
      { ...ANCHORS[1], visibility: 'private' },
    ]
    const live = dead.filter(seriesAnchorIsLive)
    expect(live).toEqual([])
    const plan = planCalendarRepeats(FEED, { anchors: live, now: NOW })
    expect(plan.series.flatMap((s) => s.pendingDayKeys)).toEqual([])
  })
})

describe('computeSeriesDayKeys', () => {
  const weekly = { starts_at: '2026-07-16 18:30:00+00', recurrence_type: 'weekly', recurrence_until: null }

  it('returns keys strictly after the floor and at or before the horizon', () => {
    const keys = computeSeriesDayKeys(weekly, { afterDayKey: '2026-09-10', throughDayKey: '2026-10-01' })
    expect(keys).toEqual(['2026-09-17', '2026-09-24', '2026-10-01'])
  })

  it('returns nothing for a one-off', () => {
    expect(
      computeSeriesDayKeys({ ...weekly, recurrence_type: 'none' }, { afterDayKey: '2026-09-10', throughDayKey: '2027-01-01' }),
    ).toEqual([])
  })

  it('steps daily and monthly, clamping a month-end anchor to a short month', () => {
    expect(
      computeSeriesDayKeys(
        { starts_at: '2026-08-30 09:00:00+00', recurrence_type: 'daily', recurrence_until: null },
        { afterDayKey: '2026-08-31', throughDayKey: '2026-09-03' },
      ),
    ).toEqual(['2026-09-01', '2026-09-02', '2026-09-03'])
    expect(
      computeSeriesDayKeys(
        { starts_at: '2026-01-31 09:00:00+00', recurrence_type: 'monthly', recurrence_until: null },
        { afterDayKey: '2026-01-31', throughDayKey: '2026-04-30' },
      ),
    ).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('survives an unparseable anchor date', () => {
    expect(
      computeSeriesDayKeys({ starts_at: 'not a date', recurrence_type: 'weekly', recurrence_until: null }, {
        afterDayKey: '2026-09-10',
        throughDayKey: '2027-01-01',
      }),
    ).toEqual([])
  })
})

describe('cadenceChipLabel', () => {
  it('names the weekday for weekly and stays plain for the rest', () => {
    expect(cadenceChipLabel('weekly', '2026-08-27')).toBe('Thursdays')
    expect(cadenceChipLabel('daily', '2026-08-27')).toBe('Every day')
    expect(cadenceChipLabel('monthly', '2026-08-27')).toBe('Monthly')
    expect(cadenceChipLabel(null, '2026-08-27')).toBe('Repeats')
    expect(cadenceChipLabel('weekly', null)).toBe('Repeats')
  })
})

describe('seriesAnchorIsLive', () => {
  const base: RepeatAnchorRow = { ...ANCHORS[0] }

  it('accepts a published, public, uncancelled anchor with a real cadence', () => {
    expect(seriesAnchorIsLive(base)).toBe(true)
  })

  it('rejects anything that would leak a dead or non-public series onto the calendar', () => {
    expect(seriesAnchorIsLive({ ...base, is_cancelled: true })).toBe(false)
    expect(seriesAnchorIsLive({ ...base, status: 'draft' })).toBe(false)
    expect(seriesAnchorIsLive({ ...base, visibility: 'unlisted' })).toBe(false)
    expect(seriesAnchorIsLive({ ...base, removed_at: '2026-08-01' })).toBe(false)
    expect(seriesAnchorIsLive({ ...base, is_demo: true })).toBe(false)
    expect(seriesAnchorIsLive({ ...base, recurrence_type: 'none' })).toBe(false)
  })
})
