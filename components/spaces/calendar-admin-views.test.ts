import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-1464 + ADR-1467 source shape: five views in Admin chrome. Guest first.
// Operators slide in a client shell. The gate is adminAllowed before any admin read.

describe('Admin Calendar views (ADR-1464, ADR-1467)', () => {
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')
  const toggle = readFileSync('components/spaces/calendar-mode-toggle.tsx', 'utf8')
  const shell = readFileSync('components/spaces/calendar-workspace.tsx', 'utf8')
  const consoleSrc = readFileSync('components/spaces/calendar-pm-console.tsx', 'utf8')
  const viewSet = [
    'lib/calendar/admin-views.ts',
    'lib/calendar/list-index.ts',
    'lib/calendar/month-timeline.ts',
    'lib/calendar/project-board.ts',
    'components/spaces/calendar-list-view.tsx',
    'components/spaces/calendar-timeline-view.tsx',
    'components/spaces/calendar-projects-view.tsx',
  ].map((path) => readFileSync(path, 'utf8')).join('\n')

  it('gates the admin read on adminAllowed and mounts the slide shell', () => {
    expect(page).toContain('if (!adminAllowed)')
    expect(page).toContain('loadAdminCalendar(')
    expect(page.indexOf('loadAdminCalendar(')).toBeGreaterThan(page.indexOf('if (!adminAllowed)'))
    expect(page).toContain('CalendarWorkspace')
    expect(page).toContain('guestLiveItems')
    expect(page).not.toContain("view !== 'guest'")
    expect(shell).toContain('CalendarPmConsole')
    expect(shell).toContain('CalendarListView')
    expect(shell).toContain('CalendarTimelineView')
    expect(shell).toContain('CalendarProjectsView')
    expect(shell).toContain('history.replaceState')
    expect(shell).toContain('rememberCalendarView')
  })

  it('switches views with buttons, not a Link navigation', () => {
    expect(toggle).toContain('Calendar views')
    expect(toggle).toContain('CALENDAR_ADMIN_VIEW_DEFS')
    expect(toggle).toContain('onSelect')
    expect(toggle).not.toContain('adminViewHref')
    expect(toggle).not.toContain('from \'next/link\'')
  })

  it('leaves LIVE-417 and LIVE-418 lanes on the console and off the new view files', () => {
    expect(consoleSrc).toContain('pencilLane')
    expect(consoleSrc).toContain('planningLane')
    expect(consoleSrc).toContain('productionLane')
    expect(viewSet).not.toMatch(/\bplanningLane\b/)
    expect(viewSet).not.toMatch(/\bproductionLane\b/)
  })
})
