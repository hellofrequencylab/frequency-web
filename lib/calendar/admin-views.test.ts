import { describe, expect, it } from 'vitest'
import {
  adminViewHref,
  calendarViewBlurb,
  calendarViewCookieName,
  CALENDAR_ADMIN_VIEWS,
  parseAdminCalendarView,
  parseConsoleFlag,
  parseRememberedCalendarView,
  parseTimelineMonth,
  resolveOperatorCalendarView,
  timelineMonthLabel,
} from './admin-views'
import { adjacentMonth } from './month-window'

describe('CALENDAR_ADMIN_VIEWS', () => {
  it('keeps Guest preview separate from Calendar, List, and Workflow', () => {
    expect(CALENDAR_ADMIN_VIEWS).toEqual(['guest', 'admin', 'list', 'workflow'])
  })
})

describe('parseAdminCalendarView', () => {
  it('keeps guest as the visitor URL and defaults unknown to admin', () => {
    expect(parseAdminCalendarView('guest')).toBe('guest')
    expect(parseAdminCalendarView('list')).toBe('list')
    expect(parseAdminCalendarView('timeline')).toBe('admin')
    expect(parseAdminCalendarView('projects')).toBe('workflow')
    expect(parseAdminCalendarView('admin')).toBe('admin')
    expect(parseAdminCalendarView(undefined)).toBe('admin')
    expect(parseAdminCalendarView('nope')).toBe('admin')
    expect(parseAdminCalendarView(['list', 'guest'])).toBe('list')
  })
})

describe('resolveOperatorCalendarView', () => {
  it('lets the query beat the cookie, and the cookie beat the Admin default', () => {
    expect(resolveOperatorCalendarView('list', 'guest')).toBe('list')
    expect(resolveOperatorCalendarView('projects', 'guest')).toBe('workflow')
    expect(resolveOperatorCalendarView('timeline', 'guest')).toBe('admin')
    expect(resolveOperatorCalendarView(undefined, 'projects')).toBe('workflow')
    expect(resolveOperatorCalendarView(undefined, 'nope')).toBe('admin')
    expect(parseRememberedCalendarView('timeline')).toBe('admin')
    expect(parseRememberedCalendarView('nope')).toBeNull()
    expect(calendarViewCookieName('Lab Space!')).toBe('freq-cal-view-labspace')
  })
})

describe('adminViewHref', () => {
  it('leaves Admin as the bare calendar URL so ?view=guest stays the only guest switch', () => {
    expect(adminViewHref('lab', 'admin')).toBe('/spaces/lab/calendar')
    expect(adminViewHref('lab', 'guest')).toBe('/spaces/lab/calendar?view=guest')
    expect(adminViewHref('lab', 'list', { item: 'sit|2026-09-22' })).toBe(
      '/spaces/lab/calendar?view=list&item=sit%7C2026-09-22',
    )
    expect(adminViewHref('lab', 'workflow')).toBe('/spaces/lab/calendar?view=workflow')
  })

  it('keeps the shared Plan id in every operator view URL', () => {
    expect(adminViewHref('lab', 'admin', { plan: 'plan-1' })).toBe('/spaces/lab/calendar?plan=plan-1')
    expect(adminViewHref('lab', 'list', { item: 'event|day', plan: 'plan-1' })).toBe(
      '/spaces/lab/calendar?view=list&item=event%7Cday&plan=plan-1',
    )
    expect(adminViewHref('lab', 'workflow', { plan: 'plan-1' })).toBe(
      '/spaces/lab/calendar?view=workflow&plan=plan-1',
    )
  })
})

describe('the console flag (PROG-CAL12)', () => {
  it('rides beside view, item and plan, and round-trips through the parser', () => {
    const href = adminViewHref('lab', 'list', { item: 'sit|2026-09-22', plan: 'plan-1', console: true })
    expect(href).toBe('/spaces/lab/calendar?view=list&item=sit%7C2026-09-22&plan=plan-1&console=1')
    const params = new URL(href, 'https://example.test').searchParams
    expect(parseConsoleFlag(params.get('console'))).toBe(true)
    expect(params.get('view')).toBe('list')
    expect(params.get('plan')).toBe('plan-1')
    expect(adminViewHref('lab', 'admin', { console: true })).toBe('/spaces/lab/calendar?console=1')
  })

  it('is absent from the URL unless it is on, and off for anything but 1 or true', () => {
    expect(adminViewHref('lab', 'admin', { console: false })).toBe('/spaces/lab/calendar')
    expect(adminViewHref('lab', 'workflow', { plan: 'plan-1', console: false })).toBe('/spaces/lab/calendar?view=workflow&plan=plan-1')
    expect(parseConsoleFlag('1')).toBe(true)
    expect(parseConsoleFlag('true')).toBe(true)
    expect(parseConsoleFlag(['1', '0'])).toBe(true)
    expect(parseConsoleFlag('0')).toBe(false)
    expect(parseConsoleFlag('yes')).toBe(false)
    expect(parseConsoleFlag(undefined)).toBe(false)
    expect(parseConsoleFlag(null)).toBe(false)
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

describe('adjacentMonth', () => {
  it('steps December to January', () => {
    expect(adjacentMonth(2026, 1, -1)).toEqual({ year: 2025, month1: 12 })
    expect(adjacentMonth(2026, 12, 1)).toEqual({ year: 2027, month1: 1 })
  })
})
