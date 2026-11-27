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
  // The public tab's retired team mode (SCAN-1344): the team works on the calendar suite.
  'components/spaces/calendar-list-view.tsx',
  'components/spaces/calendar-workflow-view.tsx',
  'components/spaces/calendar-console.tsx',
  'components/spaces/calendar-time-views.tsx',
  'components/spaces/vera-calendar-box.tsx',
  'lib/calendar/time-views.ts',
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
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')

  it('shows every viewer the guest calendar, never reads the team records, and links to the team calendar (SCAN-1344)', () => {
    expect(page).not.toContain('loadAdminCalendar(')
    expect(page).toContain('CalendarWorkspace')
    expect(page).toContain('showTeamLink={adminAllowed}')
    // An old operator link still lands on the team calendar it meant.
    expect(page).toMatch(/redirect\(/)
    // The Guest feed goes through guestLiveItems ONCE, inside the one public reader every month uses
    // (ADR-1457, LIVE-468). The page names the seam and calls that reader; it does not gate again.
    expect(page).toContain('guestLiveItems')
    expect(page).toContain('loadPublicSpaceWindow(')
    expect(page).not.toContain('guestLiveItems(')
    expect(publicMonth).toMatch(/return guestLiveItems\(/)
    expect(shell).not.toContain('StaffCalendar')
    expect(shell).not.toContain('PlanDrawer')
    expect(shell).not.toContain('CalendarConsole')
    expect(shell).toContain("audienceHref(slug, 'team')")
    expect(shell).toContain('Open team calendar')
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
      expect(existsSync(file), `${file} is back; it was retired (HYG-118 for the Projects chain, SCAN-1344 for the tab team mode)`).toBe(false)
    }
    expect(shell).not.toContain('CalendarTimelineView')
    expect(shell).not.toContain('CalendarProjectsView')
    // An old bookmark or a stale freq-cal-view cookie holding the retired values must still resolve.
    expect(views).toMatch(/value === 'projects'\)\s*return 'workflow'/)
    expect(views).toMatch(/value === 'timeline'\)\s*return 'admin'/)
  })
})
