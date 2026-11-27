#!/usr/bin/env node
// THE PUBLIC CALENDAR TAB, AFTER SCAN-1344 (owner ruling 2026-11-25: "Public only, link to team";
// probe rewrites approved by the owner 2026-11-27, "Yes, rewrite them").
//
// /spaces/<slug>/calendar used to carry a second team calendar for operators: the staff grid, List
// and Workflow panels, a full-screen console, Day / Week / Timeline, Ask Vera and the Plan drawer.
// The rows below were closed against that team mode, and their old probes read it straight out of
// components/spaces/calendar-workspace.tsx. The tab is now the guest calendar for everyone with one
// "Open team calendar" button, and the team's tools live on the team calendar
// (/spaces/<slug>/settings/calendar, components/calendar-suite).
//
// Each check therefore asks two things. What of the row still applies to the public tab still holds
// there (the member's view switch, the sky, the scrolling months, the one control bar, the tap size).
// And the team half of the row has a home on the team calendar, while the tab carries none of it.
//
// Usage: node scripts/probes/public-calendar-tab.mjs <ROW-ID>. Exit 0 pass, 1 fail, 2 unknown id.
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
// Comments stripped, so a marker or a name left in a note never passes for code.
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')

const TAB_PAGE = 'app/(main)/spaces/[slug]/(profile)/calendar/page.tsx'
const WORKSPACE = 'components/spaces/calendar-workspace.tsx'
const WORKSPACE_TEST = 'components/spaces/calendar-workspace.render.test.tsx'
const TEAM_PAGE = 'app/(main)/spaces/[slug]/settings/calendar/page.tsx'
const SUITE = 'components/calendar-suite/calendar-suite.tsx'
const SUITE_DIR = 'components/calendar-suite/'

/** The tab is one guest calendar with a door to the team calendar, and the team calendar is real. */
function oneCalendarForEveryone() {
  const f = []
  const page = code(TAB_PAGE)
  const ws = code(WORKSPACE)
  if (/loadAdminCalendar\(/.test(page)) f.push('the public Calendar tab reads the team records again')
  if (!/showTeamLink=\{adminAllowed\}/.test(page)) f.push('the tab no longer offers the team its link, or offers it to everyone')
  if (/StaffCalendar|CalendarConsole|VeraCalendarBox|PlanDrawer|CalendarListView|CalendarWorkflowView|CalendarTimeViews/.test(ws))
    f.push('the public tab mounts a team tool again, a second team calendar beside the console one')
  if (!/audienceHref\(slug, 'team'\)/.test(ws) || !/data-calendar-team-link/.test(ws) || !/Open team calendar/.test(ws))
    f.push('the tab has no "Open team calendar" button to the team calendar')
  if (!/<CalendarSuite\b/.test(code(TEAM_PAGE))) f.push('the team calendar page no longer renders the calendar suite')
  return f
}

/** A file under the suite that holds `re`, so the team half of a row has a home. */
function suiteHas(re) {
  const files = [
    'calendar-suite.tsx', 'suite-header.tsx', 'suite-command.tsx', 'suite-week.tsx', 'suite-timeline.tsx',
    'suite-month.tsx', 'use-suite-dnd.ts', 'use-suite-moves.tsx', 'suite-details.tsx', 'suite-pencil.tsx',
  ]
  return files.some((f) => re.test(code(SUITE_DIR + f)))
}

/** The tab's own control bar: one bar, the month controls in it, the member's switch on rendered markup. */
function oneBar() {
  const f = []
  const ws = code(WORKSPACE)
  for (const marker of ['data-calendar-page-header', 'data-calendar-page-month', 'data-calendar-page-paging', 'data-calendar-page-view-switch'])
    if (!ws.includes(marker)) f.push(`the tab's control bar lost ${marker}`)
  if (!/hostChrome/.test(ws) || !/hostViewSwitch/.test(ws)) f.push('the grid draws its own month controls again, so the bar and the grid both draw them')
  if ((ws.match(/<EventCalendar\b/g) || []).length !== 1) f.push('the tab mounts more than one month grid')
  return f
}

const CHECKS = {
  // A server action is a callable endpoint. The ones only the tab's retired team mode called must
  // not stay exported once nothing imports them (the LIVE-468 rule).
  'HYG-254': async () => {
    const { execSync } = await import('node:child_process')
    const CAL = 'app/(main)/spaces/[slug]/settings/calendar/'
    const f = []
    for (const [file, names] of [
      [CAL + 'vera-calendar-actions.ts', ['veraCalendarCommand', 'undoVeraChanges', 'listVeraChangeLog']],
      [CAL + 'plan-actions.ts', ['startPlanFromEntry', 'createPenciledPlan', 'joinEntryToPlan']],
    ]) {
      const src = code(file)
      for (const name of names) {
        if (!new RegExp(`export async function ${name}\\b`).test(src)) continue
        const users = execSync(`git grep -lw ${name} -- app components lib || true`, { encoding: 'utf8' })
          .split('\n').filter((p) => p && p !== file && !/\.test\./.test(p))
        if (users.length === 0) f.push(`${file} still exports ${name}, which nothing imports: a callable endpoint with no caller`)
      }
    }
    return f
  },
  // Stage presentation comes from the registry. The List view this row first fixed left with the
  // tab's team mode (SCAN-1344 follow-up); the registry and the Space profile block still carry it.
  'LIVE-445': async () => {
    const f = oneCalendarForEveryone()
    if (existsSync('components/spaces/calendar-list-view.tsx')) f.push('the retired List view is back beside the team calendar')
    if (/isCancelled:\s*false/.test(code('components/widgets/space-profile/events.tsx')))
      f.push('space-profile/events.tsx hardcodes isCancelled: false again, so a cancelled event renders as a live brand chip')
    const reg = await import('../../lib/calendar/registry.ts')
    const chips = reg.ENTRY_STAGES.map((s) => s.chipClass)
    if (chips.length < 4 || chips.some((c) => !c)) f.push('a stage resolves no chip of its own')
    if (chips.some((c) => /primary|warning|signal|\/\d/.test(c))) f.push('a stage chip spends the brand accent, warning, signal or an opacity modifier again (ADR-1503)')
    if (new Set(chips).size !== chips.length) f.push('two stages resolve to the same chip')
    const off = reg.entryStage('cancelled')
    if (!/line-through/.test(off.titleClass) || !/text-muted/.test(off.titleClass)) f.push('a cancelled title is no longer struck through and muted')
    if (/bg-primary/.test(off.chipClass)) f.push('the cancelled chip carries the brand fill again')
    return f
  },
  // The List detail pane and its hero left with the tab's team mode; nothing may bring the retired
  // List back as a second team surface beside the team calendar.
  'LIVE-496': () => {
    const f = oneCalendarForEveryone()
    if (existsSync('components/spaces/calendar-list-view.tsx')) f.push('the retired List view is back beside the team calendar')
    return f
  },
  // A host that takes a control off the grid draws it. The console is gone; the page is the host now.
  'LIVE-478': async () => {
    const f = [...oneCalendarForEveryone(), ...oneBar()]
    const hook = read('scripts/probe-ts.mjs')
    if (!/^registerHooks\(/m.test(hook)) f.push('scripts/probe-ts.mjs never installs its resolver')
    if (/\bload\s*\(/.test(hook)) f.push('scripts/probe-ts.mjs registers a load hook, so a probe no longer measures the shipped file')
    const grd = await import('../../lib/events/calendar-grid.ts')
    const host = grd.calendarChrome(true)
    const page = grd.calendarChrome(false)
    if (host.monthTitle !== false || host.paging !== false) f.push('the grid draws its own month and paging under a host again')
    if (page.monthTitle !== true || page.paging !== true) f.push('a grid under no host draws no month or paging')
    const marks = grd.PAGE_DRAWN_CONTROL_MARKS || {}
    const ws = code(WORKSPACE)
    for (const key of Object.keys(host)) {
      if (host[key] !== false || key === 'viewSwitch') continue
      if (!marks[key] || !ws.includes(marks[key])) f.push(`the tab takes ${key} off its grid and draws nothing in its place`)
    }
    return f
  },
  // The tab shows everyone published events only; the team gets the full calendar one click away.
  'LIVE-380': () => {
    const f = oneCalendarForEveryone()
    if (!/loadPublicSpaceWindow\(/.test(code(TAB_PAGE))) f.push('the tab no longer reads through the one public reader')
    if (!/loadAdminCalendar\(/.test(code(TEAM_PAGE))) f.push('the team calendar no longer loads the full team calendar')
    return f
  },
  'LIVE-415': () => {
    const f = oneCalendarForEveryone()
    if (!/loadAdminCalendar\(/.test(code(TEAM_PAGE))) f.push('the team calendar no longer loads the guest month plus the staff entries')
    return f
  },
  'LIVE-1715': () => {
    const f = oneCalendarForEveryone()
    // The tab stays its own page for admins: only an OLD operator deep link is sent on.
    if (!/asksForTeamView\(query\)/.test(code(TAB_PAGE))) f.push('the tab sends admins away on a plain visit, or no longer forwards an old operator link')
    return f
  },
  // Vera on the calendar lives in the team calendar's command bar.
  'PROG-CAL10': () => {
    const f = oneCalendarForEveryone()
    // The real Vera, not the command bar's plain parser (which only reads one item at a time): the
    // suite mounts VeraCalendarBox in its own sheet, the bar hands it what was typed, and the box
    // still calls the proposal action and gates Accept (owner ruling 2026-11-27, Ask Vera on the team calendar).
    if (!suiteHas(/<VeraCalendarBox\b/)) f.push('the team calendar does not mount Ask Vera (VeraCalendarBox)')
    if (!suiteHas(/row\.type === 'vera'/) || !/type: 'vera'/.test(code('lib/calendar/planner/command-results.ts')))
      f.push('the command bar no longer hands what was typed to Ask Vera')
    const box = code('components/spaces/vera-calendar-box.tsx')
    if (!/veraCalendarCommand\(/.test(box) || !/applyVeraChanges\(/.test(box)) f.push('Ask Vera no longer proposes through veraCalendarCommand and applies through applyVeraChanges')
    if (!/needsConfirmation/.test(box)) f.push('Ask Vera no longer holds Accept until a destructive line is confirmed')
    return f
  },
  // The full-screen edit mode is the team calendar itself now.
  'PROG-CAL12': () => {
    const f = oneCalendarForEveryone()
    if (!suiteHas(/SuiteAgenda|suite-agenda/)) f.push('the team calendar has no agenda beside the grid')
    return f
  },
  'PROG-CAL15': () => {
    const f = oneCalendarForEveryone()
    if (!existsSync(SUITE_DIR + 'use-suite-dnd.ts')) f.push('the team calendar cannot move a date by dragging')
    if (!existsSync(SUITE_DIR + 'use-suite-moves.tsx')) f.push('the team calendar has no keyboard path for a move')
    return f
  },
  'LIVE-1178': () => {
    const f = oneCalendarForEveryone()
    if (!existsSync(SUITE_DIR + 'suite-week.tsx')) f.push('the team calendar has no Week view')
    if (!existsSync(SUITE_DIR + 'suite-timeline.tsx')) f.push('the team calendar has no Timeline')
    return f
  },
  // The Space's zone reaches the team calendar's surfaces from one value.
  'LIVE-471': () => {
    const f = oneCalendarForEveryone()
    if (!/timeZone=\{/.test(code(TEAM_PAGE)) && !/timeZone/.test(code(SUITE))) f.push('the team calendar no longer takes the Space zone')
    return f
  },
  // The console blinks are gone with the console: the tab has no stage to move and no second mount.
  'LIVE-472': () => [...oneCalendarForEveryone(), ...oneBar()],
  'LIVE-474': () => [...oneCalendarForEveryone(), ...oneBar()],
  'LIVE-485': () => {
    const f = [...oneCalendarForEveryone(), ...oneBar()]
    if (!/view=\{gridView\}/.test(code(WORKSPACE)) || !/onViewChange=\{setGridView\}/.test(code(WORKSPACE)))
      f.push('the bar draws the view switch but the grid is not driven by it')
    return f
  },
  'LIVE-527': () => [...oneCalendarForEveryone(), ...oneBar()],
  'LIVE-494': () => [...oneCalendarForEveryone(), ...oneBar()],
  // The calendar is built once across server render and hydration.
  'LIVE-481': () => {
    const f = oneCalendarForEveryone()
    const t = read(WORKSPACE_TEST)
    if (!/hydrateRoot\(/.test(t) || !/grid\.mounts\)\.toBe\(1\)/.test(t)) f.push('nothing measures that the grid is built once across hydration')
    if (/createPortal/.test(code(WORKSPACE))) f.push('the tab portals its grid again, which is a second React position to rebuild it in')
    return f
  },
  // A member's view switch is on rendered markup and offers the member's surfaces only.
  'LIVE-490': () => {
    const f = [...oneCalendarForEveryone(), ...oneBar()]
    if (!/surfaces=\{MEMBER_SURFACES\}/.test(code(WORKSPACE))) f.push("the tab's switch is not narrowed to the member's surfaces")
    if (!/toEqual\(\['Month', 'Agenda'\]\)/.test(read(WORKSPACE_TEST))) f.push('nothing pins the two surfaces a visitor is offered')
    return f
  },
  'HYG-105': () => {
    const f = oneCalendarForEveryone()
    if (!/SegmentedControl/.test(code('components/spaces/calendar-mode-toggle.tsx'))) f.push('the tab switch hand-rolls its buttons again')
    if (!/SegmentedControl/.test(code(SUITE_DIR + 'suite-header.tsx'))) f.push('the team calendar switch hand-rolls its buttons again')
    if (/<button\b(?:[^>=]|=>|=(?!>))*?\bbg-primary/.test(code(WORKSPACE))) f.push('the tab paints a raw bg-primary button again')
    return f
  },
  'LIVE-469': () => {
    const f = oneCalendarForEveryone()
    const css = read('app/globals.css')
    if (!/pointer:\s*coarse[^}]*--tap-min:\s*44px/s.test(css)) f.push('--tap-min is never raised to 44px under pointer:coarse')
    const ec = read('components/events/event-calendar.tsx')
    if (!/(role="status"|aria-live)[\s\S]{0,300}'Loading'/.test(ec)) f.push('the month Loading state is not announced')
    return f
  },
  // The sky reaches the one grid the public sees.
  'LIVE-526': () => {
    const f = oneCalendarForEveryone()
    if (!/skyMarkers=\{skyMarkers\}/.test(code(WORKSPACE))) f.push('the sky never reaches the public grid')
    if (!/skyMarkers=\{skyMarkers\}/.test(code(TAB_PAGE))) f.push('the tab computes no sky for the grid')
    return f
  },
  'LIVE-530': () => {
    const f = oneCalendarForEveryone()
    if (!/monthFlow="scroll"/.test(code(WORKSPACE))) f.push('the public grid flips pages again instead of scrolling')
    return f
  },
}

const id = process.argv[2]
const check = CHECKS[id]
if (!check) {
  console.error(`unknown row ${id}; known: ${Object.keys(CHECKS).join(', ')}`)
  process.exit(2)
}
const failures = await check()
if (failures.length) {
  for (const m of failures) console.error(`${id}: ${m}`)
  process.exit(1)
}
console.log(`PASS ${id}`)
