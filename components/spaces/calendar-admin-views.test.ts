import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-1464 source shape: five views in Admin chrome. Guest and Admin stay the two
// grids. C3–C4 still own planningLane / productionLane on the PM console.

describe('Admin Calendar views (ADR-1464)', () => {
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')
  const toggle = readFileSync('components/spaces/calendar-mode-toggle.tsx', 'utf8')
  const consoleSrc = readFileSync('components/spaces/calendar-pm-console.tsx', 'utf8')

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

  it('does not close LIVE-417 or LIVE-418 by declaring those lanes on the console', () => {
    expect(consoleSrc).toContain('pencilLane')
    expect(consoleSrc).not.toContain('planningLane')
    expect(consoleSrc).not.toContain('productionLane')
  })
})
