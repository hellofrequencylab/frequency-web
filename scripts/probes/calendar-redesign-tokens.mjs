// LIVE-1158: the calendar chips wear the redesign tokens, and unbuilt pieces share one Coming soon mark.
import { readFileSync, existsSync } from 'node:fs'

const css = readFileSync('app/globals.css', 'utf8')
const registry = readFileSync('lib/calendar/registry.ts', 'utf8')
const problems = []
for (const t of ['cal-event-bg', 'cal-works-bg', 'cal-works-strong', 'cal-todo-bg', 'presence-bg']) {
  if (!css.includes(`--color-${t}:`)) problems.push(`globals.css has no --color-${t}`)
}
if (!registry.includes('bg-cal-event-bg')) problems.push('the event chip does not use bg-cal-event-bg')
if (!registry.includes('bg-cal-works-bg')) problems.push('the planning chip does not use bg-cal-works-bg')
if (!existsSync('components/ui/coming-soon-mark.tsx')) problems.push('components/ui/coming-soon-mark.tsx is missing')
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
