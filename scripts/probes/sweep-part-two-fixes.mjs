#!/usr/bin/env node
// LIVE-2091: three misses from the signed-in half of the 2026-11-03 visual sweep. (1) /admin/events
// rendered its claim-link DangerModal as a sibling of <tr>, so the closed Dialog's hidden <span> sat
// directly in <tbody>; React refused the nesting and rebuilt the whole table on the client on every
// load (a hydration error in every admin's console). (2) WizardProgress's role="progressbar" carried
// no accessible name (axe aria-progressbar-name on /admin/business-seeder). (3) CalendarSubscribe
// called the authenticated-only ensure_calendar_token RPC for signed-out visitors too, one wasted
// round trip per anonymous /events render that ended as "permission denied" in the Postgres log.
import { readFileSync } from 'node:fs'
const bad = []
const table = readFileSync('app/(main)/admin/events/posted-events-table.tsx', 'utf8')
const modalAt = table.indexOf('<DangerModal')
const lastTd = table.lastIndexOf('</td>', table.indexOf('</tr>', modalAt))
if (modalAt < 0) bad.push('posted-events-table.tsx: the claim-link DangerModal is gone')
else if (lastTd < modalAt) bad.push('posted-events-table.tsx: the DangerModal sits outside a <td> (a hidden <span> in <tbody>)')
const wizard = readFileSync('components/templates/wizard-progress.tsx', 'utf8')
if (!/role="progressbar"\s+aria-label=/.test(wizard)) bad.push('wizard-progress.tsx: the progressbar has no aria-label')
const cal = readFileSync('components/events/calendar-subscribe.tsx', 'utf8')
const guard = cal.indexOf('await getCachedUser()')
const rpc = cal.indexOf("rpc('ensure_calendar_token')")
if (guard < 0 || rpc < 0 || guard > rpc) bad.push('calendar-subscribe.tsx: ensure_calendar_token is called before the signed-in check')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('admin events modal is inside its cell; wizard progressbar is named; calendar token RPC is signed-in only')
