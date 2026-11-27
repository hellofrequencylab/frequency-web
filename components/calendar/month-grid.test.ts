import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { monthMatrix, WEEKDAY_LABELS } from '@/lib/events/calendar-grid'
import { weekStartOnOrBefore, dayOfWeek } from '@/lib/calendar/planner/days'
import { WEEK_STARTS_ON } from '@/lib/calendar/week-start'
import { monthGridWeekdays, monthGridWeeks } from './month-grid'

// ONE MONTH GRID (SCAN-1345). The public Calendar tab and the team calendar used to start their weeks
// on different days, so the same date sat in a different column on each. These pin that every grid
// takes its weeks and its header order from this one module.

describe('the one month grid', () => {
  it('starts every week on the one week start, and the header agrees', () => {
    for (const ym of ['2026-02', '2026-08', '2026-11', '2027-01']) {
      const weeks = monthGridWeeks(ym)
      for (const week of weeks) {
        expect(week).toHaveLength(7)
        expect(dayOfWeek(week[0].date)).toBe(WEEK_STARTS_ON)
      }
      expect(weeks.flat().filter((d) => d.inMonth).map((d) => d.date)[0]).toBe(`${ym}-01`)
    }
    expect(monthGridWeekdays('short')[0]).toBe(WEEK_STARTS_ON === 0 ? 'Sun' : 'Mon')
    expect(monthGridWeekdays('letter')).toHaveLength(7)
    expect(WEEKDAY_LABELS).toEqual(monthGridWeekdays('short'))
  })

  it('draws the same weeks the public grid draws, and the same week the week view opens on', () => {
    for (const [y, m] of [[2026, 7], [2026, 10], [2027, 2]] as const) {
      const ym = `${y}-${String(m).padStart(2, '0')}`
      expect(monthMatrix(y, m)).toEqual(monthGridWeeks(ym))
    }
    expect(monthGridWeeks('2026-10')[3][0].date).toBe(weekStartOnOrBefore('2026-10-21'))
  })

  it('is the grid both calendars import, so neither works out its own columns', () => {
    for (const file of ['components/events/event-calendar.tsx', 'components/calendar-suite/suite-month.tsx']) {
      const src = readFileSync(file, 'utf8')
      expect(src).toContain("from '@/components/calendar/month-grid'")
      expect(src).not.toMatch(/\['(Mon|Sun)', '(Tue|Mon)'/)
    }
  })
})
