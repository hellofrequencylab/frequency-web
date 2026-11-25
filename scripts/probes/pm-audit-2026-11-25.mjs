#!/usr/bin/env node
// The Plans and calendar clarity audit of 2026-11-25 (project thread "Audit the project and calendar
// system"; doc https://claude.ai/artifact/GUTHmChGkqaEmPSRUdzJHz). One probe per row:
// `node scripts/probes/pm-audit-2026-11-25.mjs <ID>`. Each checks the consequence its row names in the
// code a team member actually runs through. Exit 1 (FAIL) while the gap stands.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const has = (p) => existsSync(new URL(p, root))
const code = (p) =>
  (has(p) ? readFileSync(new URL(p, root), 'utf8') : '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const CAL = 'app/(main)/spaces/[slug]/settings/calendar'
const CAL_PAGE = `${CAL}/page.tsx`
const DRAWER = `${CAL}/plan-drawer.tsx`
const ROLLUP = 'lib/work/rollup-core.ts'
const SUITE_MODEL = 'lib/calendar/planner/suite-model.ts'

const PROBES = {
  // A Pencil whose every date has passed folds out of the live Plans (Work, Kanban, List) on its own.
  'SCAN-1340': () => {
    const f = []
    if (!/archive|archived_at|afterEach|afterAll/.test(code('test/e2e/operator-calendar.spec.ts'))) f.push('the operator calendar browser test leaves every Pencil it makes on the Space')
    if (!/datesPassed|allDatesPast|isPastPencil/.test(code(ROLLUP))) f.push('Work counts a Pencil whose dates all passed as a live Plan')
    if (!/datesPassed|allDatesPast|isPastPencil/.test(code('lib/calendar/planner/board.ts') + code('lib/calendar/planner/adapters.ts')))
      f.push('the calendar Plans views still list Pencils whose dates all passed')
    return f
  },
  // The Space Calendar console is one workspace: the panels stacked under the calendar move into it.
  'SCAN-1341': () => {
    const page = code(CAL_PAGE)
    return ['CalendarPlansPanel', 'SpaceTodosPanel', 'SharedPlansPanel', 'SpaceEventsManager', 'EventShareApprovals']
      .filter((c) => new RegExp(`<${c}\\b`).test(page))
      .map((c) => `the Calendar console still stacks <${c}> under the calendar`)
  },
  // The Plan pop-up is split into tabs, names the owner, and only says Production at Production.
  'SCAN-1342': () => {
    const d = code(DRAWER)
    const f = []
    if (!/role="tablist"|<Tabs\b|SegmentedControl/.test(d)) f.push('the Plan pop-up is one long dialog with no tabs')
    if (/production record/.test(d)) f.push('every Plan is labelled a "production record", even at Pencil')
    if (/'Assigned teammate'/.test(d)) f.push('the owner reads "Assigned teammate" instead of a name')
    return f
  },
  // An overdue to-do nobody holds nudges the Plan's owner instead of nobody.
  'SCAN-1343': () => {
    const h = code('lib/calendar/hold-lapse.ts')
    const f = []
    if (/\.not\(\s*'assignee_profile_id'\s*,\s*'is'\s*,\s*null\s*\)/.test(h)) f.push('the overdue sweep skips every to-do nobody holds')
    if (!/owner_profile_id/.test(h)) f.push('the overdue sweep never falls back to the Plan owner')
    return f
  },
  // The public Calendar tab carries no second team calendar.
  'SCAN-1344': () =>
    /StaffCalendar/.test(code('components/spaces/calendar-workspace.tsx'))
      ? ['the public Calendar tab still renders the older StaffCalendar team mode beside the console calendar']
      : [],
  // One month grid: the old team grid is gone and the public and suite grids share one module.
  'SCAN-1345': () => {
    const f = []
    if (has(`${CAL}/staff-calendar.tsx`)) f.push('staff-calendar.tsx still draws its own month grid')
    for (const p of ['components/events/event-calendar.tsx', 'components/calendar-suite/suite-month.tsx'])
      if (!/@\/components\/calendar\/month-grid/.test(code(p))) f.push(`${p} does not use the shared month grid`)
    return f
  },
  // CRM Tasks folds into Work.
  'SCAN-1346': () => {
    const f = []
    if (!/redirect\(\s*'\/admin\/work'/.test(code('app/(main)/admin/crm/tasks/page.tsx'))) f.push('/admin/crm/tasks still lists the same to-dos as Work')
    if (/id:\s*'crm-tasks'/.test(code('lib/nav/studio.ts'))) f.push('the Console menu still carries a CRM Tasks row beside Work')
    return f
  },
  // Every member sees the to-dos handed to them across Spaces, in the Inbox.
  'SCAN-1347': () =>
    /'todos'/.test(code('lib/notifications/inbox.ts')) ? [] : ['the Inbox has no To-dos view, so a Space owner who is not staff has no list of their to-dos'],
  // One Inbox: /notifications redirects, and the bell and Console alerts open /inbox.
  'SCAN-1348': () => {
    const f = []
    if (!/redirect\(\s*'\/inbox'/.test(code('app/(main)/notifications/page.tsx'))) f.push('/notifications is still its own page beside /inbox')
    for (const p of ['components/frequency/admin/space-console.tsx', 'components/frequency/admin/admin-console.tsx', 'components/frequency/members/shell/members-shell.tsx'])
      if (/['"]\/notifications['"]/.test(code(p))) f.push(`${p} still points at /notifications`)
    return f
  },
  // The calendar shows four views, not seven.
  'SCAN-1349': () => {
    const m = code(SUITE_MODEL).match(/SUITE_VIEWS\s*=\s*\[([^\]]*)\]/)
    const n = m ? m[1].split(',').filter((s) => s.trim()).length : 0
    return n > 0 && n <= 4 ? [] : [`the calendar offers ${n || 'an unknown number of'} views (Day, Week, Month, Agenda, List, Kanban, Timeline)`]
  },
  // The calendar header links to the Space's team room.
  'SCAN-1350': () =>
    /teamRoom|\/messages\/r\//.test(code('components/calendar-suite/suite-header.tsx') + code(DRAWER))
      ? []
      : ['nothing on the calendar or a Plan opens the Space team room'],
  // Plain names: the canon's stage word, the owner's name, one casing for Crew tasks, a menu line that says what Calendar holds.
  'SCAN-1351': () => {
    const f = []
    if (/plan:\s*'Plan'/.test(code('app/(main)/admin/work/page.tsx'))) f.push("Work labels the middle stage 'Plan', the canon says Planning")
    if (/title="Crew Tasks"/.test(code('app/(main)/admin/crew-tasks/page.tsx'))) f.push('"Crew Tasks" and "Crew tasks" both appear')
    const m = code('lib/admin/modules/space-modules.ts').match(/id:\s*'space\.calendar'[^\n]*desc:\s*'([^']*)'/)
    if (!m || !/Plan|to-do/.test(m[1])) f.push('the Calendar menu line never mentions Plans or to-dos')
    return f
  },
}

const id = process.argv[2]
const probe = PROBES[id]
if (!probe) {
  console.error(`usage: node scripts/probes/pm-audit-2026-11-25.mjs <${Object.keys(PROBES).join('|')}>`)
  process.exit(2)
}
const fails = probe()
if (fails.length) {
  console.log(`FAIL ${id}\n- ${fails.join('\n- ')}`)
  process.exit(1)
}
console.log(`PASS ${id}`)
