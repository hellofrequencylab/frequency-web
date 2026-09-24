import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-1464 + ADR-1467 source shape, after HYG-118: FOUR views in Admin chrome — Guest, Admin, List,
// Workflow. Guest first. Operators slide in a client shell. The gate is adminAllowed before any
// admin read.
//
// 🔴 WHY THIS FILE CHANGED SHAPE. It used to readFileSync seven files, five of which were the dead
// Timeline / Projects / PM-console views. A readFileSync on a deleted path throws at describe time
// and takes the two unrelated assertions here down with it — which is exactly how a dead file gets
// kept "for the tests" (ADR-1486 said as much). The set below is the LIVE set. What this suite has
// to say about the retired files, it says by asserting their absence.

const RETIRED = [
  'components/spaces/calendar-projects-view.tsx',
  'components/spaces/calendar-timeline-view.tsx',
  'components/spaces/calendar-pm-console.tsx',
  'lib/calendar/month-timeline.ts',
  'lib/calendar/project-board.ts',
]

describe('Admin Calendar views (ADR-1464, ADR-1467, HYG-118)', () => {
  const page = readFileSync('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx', 'utf8')
  const toggle = readFileSync('components/spaces/calendar-mode-toggle.tsx', 'utf8')
  const shell = readFileSync('components/spaces/calendar-workspace.tsx', 'utf8')
  const views = readFileSync('lib/calendar/admin-views.ts', 'utf8')
  const publicMonth = readFileSync('lib/calendar/public-month.ts', 'utf8')
  // The stage lanes' one live home. lib/calendar/list-index.ts reads this module, so it is not a
  // leftover — the previous pass in this lane wrongly called it an orphan.
  const lanes = readFileSync('lib/calendar/pm-console.ts', 'utf8')
  const viewSet = [
    'lib/calendar/admin-views.ts',
    'lib/calendar/list-index.ts',
    'lib/calendar/workflow-board.ts',
    'components/spaces/calendar-list-view.tsx',
    'components/spaces/calendar-workflow-view.tsx',
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')

  it('gates the admin read on adminAllowed and mounts the slide shell', () => {
    expect(page).toContain('if (!adminAllowed)')
    expect(page).toContain('loadAdminCalendar(')
    expect(page.indexOf('loadAdminCalendar(')).toBeGreaterThan(page.indexOf('if (!adminAllowed)'))
    expect(page).toContain('CalendarWorkspace')
    // The Guest feed goes through guestLiveItems ONCE, inside the one public reader every month uses
    // (ADR-1457, LIVE-468). The page names the seam and calls that reader; it does not gate again.
    expect(page).toContain('guestLiveItems')
    expect(page).toContain('loadPublicSpaceWindow(')
    expect(page).not.toContain('guestLiveItems(')
    expect(publicMonth).toMatch(/return guestLiveItems\(/)
    expect(page).not.toContain("view !== 'guest'")
    expect(shell).toContain('StaffCalendar')
    expect(shell).toContain('data-calendar-admin-grid')
    expect(shell).not.toContain('CalendarPmConsole')
    expect(shell).toContain('CalendarListView')
    expect(shell).toContain('CalendarWorkflowView')
    expect(shell).toContain('PlanDrawer')
    expect(shell).toContain('history.replaceState')
    expect(shell).toContain('rememberCalendarView')
  })

  it('switches views with buttons, not a Link navigation', () => {
    // ONE CONTROL (LIVE-490): the box is now the SURFACE -- Grid / List / Workflow -- and no longer
    // the panel list, because the panel list carried a "List" that collided with the grid / list
    // switcher's own. What this test has always been about is unchanged and asserted below: it
    // switches with buttons, never a Link navigation.
    expect(toggle).toContain('How to see the calendar')
    expect(toggle).toContain('CALENDAR_SURFACE_DEFS')
    expect(toggle).toContain('onSelect')
    expect(toggle).not.toContain('adminViewHref')
    expect(toggle).not.toContain("from 'next/link'")
  })

  it('keeps the LIVE-416/417/418 stage lanes in lib/calendar/pm-console.ts and off the view files', () => {
    expect(lanes).toContain('pencilLane')
    expect(lanes).toContain('planningLane')
    expect(lanes).toContain('productionLane')
    expect(viewSet).not.toMatch(/\bplanningLane\b/)
    expect(viewSet).not.toMatch(/\bproductionLane\b/)
  })

  it('has retired Timeline and Projects, and their URL values still land somewhere real (HYG-118)', () => {
    // The four views, by name, from the one registry the toggle renders.
    expect(views).toContain("['guest', 'admin', 'list', 'workflow']")
    for (const file of RETIRED) {
      expect(existsSync(file), `${file} is back; the Projects chain was retired in HYG-118`).toBe(false)
    }
    expect(shell).not.toContain('CalendarTimelineView')
    expect(shell).not.toContain('CalendarProjectsView')
    // An old bookmark or a stale freq-cal-view cookie holding the retired values must still resolve.
    expect(views).toMatch(/value === 'projects'\)\s*return 'workflow'/)
    expect(views).toMatch(/value === 'timeline'\)\s*return 'admin'/)
  })
})
