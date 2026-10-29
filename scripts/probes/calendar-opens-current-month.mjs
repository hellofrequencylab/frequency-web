// Every calendar mount opens on the CURRENT month through one rule (lib/calendar/open-month.ts), and
// the grid corrects an unpinned render in the browser. Fails while any listed page still seeds its
// month from getUTCMonth or the grid keeps the UTC-only precondition.
import { readFileSync } from 'node:fs'

const pages = [
  'app/(main)/spaces/[slug]/(profile)/calendar/page.tsx',
  'app/(main)/events/calendar/page.tsx',
  'app/(main)/spaces/[slug]/network/page.tsx',
  'app/(main)/spaces/[slug]/partners/page.tsx',
  'app/(main)/spaces/[slug]/settings/calendar/page.tsx',
  'app/(main)/spaces/[slug]/settings/collaborators/shared-collaborator-calendar.tsx',
  'components/sites/site-public-calendar.tsx',
  'components/widgets/space-profile/events.tsx',
]
const bad = pages.filter((p) => {
  const s = readFileSync(p, 'utf8')
  return /getUTCMonth\(\)/.test(s) || !s.includes('openingMonth')
})
const grid = readFileSync('components/events/event-calendar.tsx', 'utf8')
if (/initialMonth1 !== now\.getUTCMonth\(\) \+ 1\) return/.test(grid) || !grid.includes('if (monthPinned) return')) bad.push('components/events/event-calendar.tsx')
if (bad.length) {
  console.error('Calendar does not open on the current month through openingMonth:', bad.join(', '))
  process.exit(1)
}
