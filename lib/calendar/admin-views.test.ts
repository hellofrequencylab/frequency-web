import { describe, expect, it } from 'vitest'
import {
  adminViewHref,
  calendarViewBlurb,
  parseAdminCalendarView,
  parseTimelineMonth,
  timelineMonthLabel,
} from './admin-views'

describe('parseAdminCalendarView', () => {
  it('keeps guest as the visitor URL and defaults unknown to admin', () => {
    expect(parseAdminCalendarView('guest')).toBe('guest')
    expect(parseAdminCalendarView('list')).toBe('list')
    expect(parseAdminCalendarView('timeline')).toBe('timeline')
    expect(parseAdminCalendarView('projects')).toBe('projects')
    expect(parseAdminCalendarView('admin')).toBe('admin')
    expect(parseAdminCalendarView(undefined)).toBe('admin')
    expect(parseAdminCalendarView('nope')).toBe('admin')
    expect(parseAdminCalendarView(['list', 'guest'])).toBe('list')
  })
})

describe('adminViewHref', () => {
  it('leaves Admin as the bare calendar URL so ?view=guest stays the only guest switch', () => {
    expect(adminViewHref('lab', 'admin')).toBe('/spaces/lab/calendar')
    expect(adminViewHref('lab', 'guest')).toBe('/spaces/lab/calendar?view=guest')
    expect(adminViewHref('lab', 'list', { item: 'sit|2026-09-22' })).toBe(
      '/spaces/lab/calendar?view=list&item=sit%7C2026-09-22',
    )
    expect(adminViewHref('lab', 'timeline', { year: 2026, month1: 9 })).toBe(
      '/spaces/lab/calendar?view=timeline&y=2026&m=9',
    )
    expect(adminViewHref('lab', 'projects')).toBe('/spaces/lab/calendar?view=projects')
  })
})

describe('calendarViewBlurb', () => {
  it('fills the Space name on Guest and never uses an em dash', () => {
    const guest = calendarViewBlurb('guest', 'Frequency Lab')
    expect(guest).toContain('Frequency Lab')
    expect(guest).not.toContain('—')
    expect(calendarViewBlurb('list', 'Frequency Lab')).not.toContain('—')
  })
})

describe('parseTimelineMonth', () => {
  it('reads y/m and falls back when they are out of range', () => {
    expect(parseTimelineMonth('2026', '9', { year: 2026, month1: 1 })).toEqual({ year: 2026, month1: 9 })
    expect(parseTimelineMonth('nope', '9', { year: 2026, month1: 1 })).toEqual({ year: 2026, month1: 1 })
    expect(timelineMonthLabel(2026, 9)).toBe('September 2026')
  })
})
