// LIVE-1178: Day, Week and Timeline are real views on the operator calendar, not a Coming soon line.
import { existsSync, readFileSync } from 'node:fs'

const problems = []
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const lib = read('lib/calendar/time-views.ts')
const view = read('components/spaces/calendar-time-views.tsx')
const toggle = read('components/spaces/calendar-mode-toggle.tsx')
const shell = read('components/spaces/calendar-workspace.tsx')
const page = read('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx')

if (!lib.includes('export function layoutDay')) problems.push('no Day/Week time-grid layout (lib/calendar/time-views.ts)')
if (!lib.includes('export function timelineWindow')) problems.push('no Timeline window (lib/calendar/time-views.ts)')
if (!view.includes('data-calendar-time-grid') || !view.includes('data-calendar-timeline')) problems.push('the Day/Week grid or the Timeline is not rendered')
if (toggle.includes('ComingSoonMark') || toggle.includes('data-calendar-soon-views')) problems.push('the view bar still marks Day, Week and Timeline Coming soon')
if (!toggle.includes('CALENDAR_TIME_VIEW_DEFS')) problems.push('the view bar does not offer Day, Week and Timeline')
if (!shell.includes('<CalendarTimeViews')) problems.push('the calendar workspace never mounts the time views')
if (!page.includes('parseTimeView')) problems.push('the Calendar page does not read ?look= or the remembered time view')
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
