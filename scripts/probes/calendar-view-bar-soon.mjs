// LIVE-1159: the calendar view bar speaks the redesign's words and marks the views and sync that are not built.
import { readFileSync } from 'node:fs'

const views = readFileSync('lib/calendar/admin-views.ts', 'utf8')
const toggle = readFileSync('components/spaces/calendar-mode-toggle.tsx', 'utf8')
const sync = readFileSync('app/(main)/spaces/[slug]/settings/calendar/calendar-sync-soon.tsx', 'utf8')
const problems = []
for (const w of ["label: 'Month'", "label: 'Agenda'", "label: 'Board'"]) if (!views.includes(w)) problems.push(`view bar has no ${w}`)
if (!toggle.includes('ComingSoonMark')) problems.push('Day, Week and Timeline are not marked Coming soon')
for (const n of ['Google Calendar', 'Apple Calendar', 'Outlook', 'Notion']) if (!sync.includes(n)) problems.push(`no ${n} sync row`)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
