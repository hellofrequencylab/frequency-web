#!/usr/bin/env node
// JRN-017: Journeys as Creator Lab training. Checks the consequences in source:
//   1. A public Journey page states a Course (not a HowTo), and a course's Journey page names its /courses home canonical.
//   2. Every Creator Lab course has a standard home and a free Week 1 page, both in the sitemap.
//   3. One seat per Run: the member and guest RSVP paths seat every session of the Run.
//   4. The replay pass rides the follow-up cron; the event rail edits the replay link.
//   5. House programs cannot be remixed.
import { existsSync, readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const has = (p) => existsSync(new URL(p, root))
const fails = []

const discover = read('app/discover/journeys/[slug]/page.tsx')
if (!discover.includes('journeyCourseSchema(') || discover.includes('journeySchema(plan, items)')) fails.push('public Journey pages do not emit Course')
if (!discover.includes('courseHref(plan.slug)')) fails.push('a course Journey page does not name its course home canonical')

for (const p of ['app/(marketing)/courses/[slug]/page.tsx', 'app/(marketing)/courses/[slug]/week-1/page.tsx', 'app/(marketing)/courses/[slug]/calendar.ics/route.ts'])
  if (!has(p)) fails.push(`${p} is missing`)
if (!read('app/sitemap.ts').includes('/week-1')) fails.push('Week 1 pages are not in the sitemap')
if (!read('app/(marketing)/courses/page.tsx').includes('courseListSchema(')) fails.push('/courses does not emit the Course list')

if (!read('app/(main)/events/actions.ts').includes('runSiblings(admin, eventId)')) fails.push('members are not seated for the whole Run')
if (!read('app/(main)/events/guest-rsvp-actions.ts').includes('runSiblings(')) fails.push('guests are not seated for the whole Run')

const followups = read('app/api/cron/event-followups/route.ts')
if (!followups.includes('sendReplays(')) fails.push('the follow-up cron does not send replays')
if (!read('components/admin/modules/event-rail-plan.ts').includes("'details.replayUrl'")) fails.push('the event rail does not edit the replay link')

if (!read('lib/journey-plans.ts').includes('isHouseProgram(')) fails.push('house programs can be remixed')

if (fails.length) {
  console.log('JRN-017 FAIL')
  for (const f of fails) console.log(` - ${f}`)
  process.exit(1)
}
console.log('JRN-017 ok: courses have one home with Course markup, a free Week 1, one seat per Run and replays')
