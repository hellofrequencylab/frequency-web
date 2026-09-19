import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-1464 source shape: five views in Admin chrome. Guest and Admin stay the two
// grids. C3–C4 already own planningLane / productionLane on the PM console (main).
// This view set must not redeclare those symbols in the new view files.

describe('Admin Calendar views (ADR-1464)', () => {
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')
  const toggle = readFileSync('components/spaces/calendar-mode-toggle.tsx', 'utf8')
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

  it('keeps the Admin/Guest gate and mounts all five views', () => {
    expect(page).toMatch(/adminAllowed && view !== .guest./)
    expect(page).toContain('guestLiveItems')
    expect(page).toContain('CalendarPmConsole')
    expect(page).toContain('CalendarListView')
    expect(page).toContain('CalendarTimelineView')
    expect(page).toContain('CalendarProjectsView')
    expect(page).toContain('parseAdminCalendarView')
  })

  it('extends the segmented control with List, Timeline, and Projects', () => {
    expect(toggle).toContain('Calendar views')
    expect(toggle).toContain('CALENDAR_ADMIN_VIEW_DEFS')
    expect(toggle).toContain("adminViewHref(slug, o.view)")
  })

  it('leaves LIVE-417 and LIVE-418 lanes on the console and off the new view files', () => {
    expect(consoleSrc).toContain('pencilLane')
    expect(consoleSrc).toContain('planningLane')
    expect(consoleSrc).toContain('productionLane')
    expect(viewSet).not.toMatch(/\bplanningLane\b/)
    expect(viewSet).not.toMatch(/\bproductionLane\b/)
  })
})
