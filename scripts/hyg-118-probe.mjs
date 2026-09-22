#!/usr/bin/env node
// HYG-118 probe — "the dead Projects chain is gone, and nothing live went with it".
//
// ── WHAT WAS SWEPT ──────────────────────────────────────────────────────────────────────────────
// Three view components no route ever mounted (Timeline, Projects, the PM console — ADR-1486 said
// "do not mount CalendarPmConsole", ADR-1503 called the timeline view orphaned), two lib helpers
// only they imported, one server action only the Projects view called (moveCalendarProjectStage),
// and the guard only that action called (canAcceptProjectMove). Eleven files with their tests.
//
// ── WHAT THIS MEASURES, AND WHY EACH ARM ────────────────────────────────────────────────────────
//   1. The files are gone. Not "the imports are gone" — a file with no importers still costs build
//      fan-out and still confuses the next reader, which is the whole reason for the sweep.
//   2. The retired names appear in no live source. A re-added caller is the chain coming back.
//   3. 🔴 lib/calendar/pm-console.ts STILL EXISTS AND IS STILL IMPORTED BY lib/calendar/list-index.ts.
//      The first survey in this lane called it an orphan; it is live through the List view. A sweep
//      that "finished the job" by deleting it would break List, and this is the arm that says so.
//   4. The retired URL values still land somewhere real: ?view=projects -> workflow and
//      ?view=timeline -> admin, in the query parser and in the remembered-view cookie parser. An old
//      bookmark or a stale freq-cal-view-* cookie must not 404 or fall to Guest.
//   5. The doc no longer advertises the views that never shipped: docs/EVENTS-CALENDAR.md names four
//      views, has no Timeline or Projects row, and has a Workflow row. Docs follow code (AGENTS.md).
//
// Exit 0 = done, 1 = not done, 79 = could not look.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const fail = (m) => {
  console.error(`HYG-118: ${m}`)
  process.exit(1)
}
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null)

// 1. gone
for (const f of [
  'components/spaces/calendar-projects-view.tsx',
  'components/spaces/calendar-timeline-view.tsx',
  'components/spaces/calendar-pm-console.tsx',
  'lib/calendar/month-timeline.ts',
  'lib/calendar/project-board.ts',
]) {
  if (existsSync(f)) fail(`${f} is back. No route mounts it; it was retired with the Projects chain.`)
}

// 2. no live caller of the retired names
// Dirents, not readdir-then-stat: the entry already knows whether it is a directory, and asking
// the filesystem twice per entry is the double walk HYG-041 retired from twenty-one walkers (and
// its probe, scripts/walker-dirents.mjs, flagged the first draft of this one).
const walk = (d, out) => {
  for (const ent of readdirSync(d, { withFileTypes: true })) {
    const n = ent.name
    if (n === 'node_modules' || n.startsWith('.')) continue
    const f = join(d, n)
    if (ent.isDirectory()) walk(f, out)
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\./.test(n)) out.push(f)
  }
  return out
}
const live = ['app', 'components', 'lib'].flatMap((d) => (existsSync(d) ? walk(d, []) : []))
const retired = /\b(moveCalendarProjectStage|canAcceptProjectMove|CalendarProjectsView|CalendarTimelineView|CalendarPmConsole|monthTimelineDays|monthTimelineBars|projectBoard)\b/
for (const f of live) {
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const m = src.match(retired)
  if (m) fail(`${f} references ${m[1]}, which was retired with the Projects chain (HYG-118). The chain is coming back.`)
}

// 3. the live module the first survey got wrong
const listIndex = read('lib/calendar/list-index.ts')
if (!existsSync('lib/calendar/pm-console.ts')) {
  fail('lib/calendar/pm-console.ts is gone. It is LIVE: lib/calendar/list-index.ts imports it for the List view. Deleting it is the mistake the first survey in this lane nearly made.')
}
if (!listIndex || !/from '\.\/pm-console'|from '@\/lib\/calendar\/pm-console'/.test(listIndex)) {
  fail('lib/calendar/list-index.ts no longer imports lib/calendar/pm-console.ts; either List lost its stage helpers or pm-console really did go dead, and this probe needs re-reading before it is trusted')
}

// 4. the aliases
const views = read('lib/calendar/admin-views.ts') ?? fail('lib/calendar/admin-views.ts is gone')
for (const [value, target, where] of [
  ['projects', 'workflow', 'parseAdminCalendarView'],
  ['timeline', 'admin', 'parseAdminCalendarView'],
]) {
  const fn = views.slice(views.indexOf(`export function ${where}(`))
  if (!new RegExp(`=== '${value}'\\)\\s*return '${target}'`).test(fn)) {
    fail(`?view=${value} no longer resolves to ${target} in ${where}; an old bookmark or a stale cookie now falls through instead of landing on the view that replaced it`)
  }
}
const remembered = views.slice(views.indexOf('export function parseRememberedCalendarView('))
if (!/'projects'/.test(remembered) || !/'timeline'/.test(remembered)) {
  fail('parseRememberedCalendarView no longer maps the retired cookie values, so a member whose freq-cal-view-* cookie still says projects or timeline loses their remembered view')
}

// 5. docs follow code
const doc = read('docs/EVENTS-CALENDAR.md') ?? fail('docs/EVENTS-CALENDAR.md is gone')
if (/switch five views/.test(doc)) fail('docs/EVENTS-CALENDAR.md still says the operator can switch five views; there are four')
if (/^\| \*\*Timeline\*\* \|/m.test(doc) || /^\| \*\*Projects\*\* \|/m.test(doc)) {
  fail('docs/EVENTS-CALENDAR.md still lists Timeline or Projects as a live view')
}
if (!/^\| \*\*Workflow\*\* \|/m.test(doc)) fail('docs/EVENTS-CALENDAR.md has no Workflow row, the stage board that actually exists')

console.log('✓ HYG-118: the Projects chain is gone, pm-console.ts stays live through List, the retired URL values still resolve, and the doc says four views.')
