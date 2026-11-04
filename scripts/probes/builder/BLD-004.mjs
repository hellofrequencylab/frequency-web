// BLD-004: the copy canon (ADR-1939). The calendar is "What's Happening" wherever a person reads its name, from one
// constant; the old name is gone from those surfaces. The voice lint exempts owner and theme names and softens an
// owner's findings into suggestions. The primary-action rule and Vera's authority are recorded.
import fs from 'node:fs'
import { loadDecisions } from '../../lib/ledger.mjs'
const bad = []
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : (bad.push(`missing ${f}`), ''))
if (!/export const CALENDAR_NAME = "What's Happening"/.test(read('lib/calendar/name.ts'))) bad.push('lib/calendar/name.ts must name the calendar "What\'s Happening"')
const surfaces = {
  'lib/spaces/profile-nav.ts': /key: 'feature:calendar', href: `\$\{base\}\/calendar`, label: CALENDAR_NAME/,
  'lib/spaces/functions.ts': /key: 'events',\s*label: CALENDAR_NAME/,
  'app/(main)/spaces/[slug]/(profile)/calendar/page.tsx': /label: CALENDAR_NAME/,
  'lib/circles/tabs.ts': /label: CALENDAR_NAME/,
  'app/(main)/circles/[slug]/(circle)/whats-on/page.tsx': /title: CALENDAR_NAME/,
}
for (const [f, re] of Object.entries(surfaces)) if (!re.test(read(f))) bad.push(`${f} must name the calendar with CALENDAR_NAME`)
// The other name is gone from the surfaces that name the feature.
if (/label: 'Calendar'/.test(read('lib/spaces/profile-nav.ts'))) bad.push('the Space tab still says "Calendar"')
if (/key: 'events',\s*label: 'Calendar'/.test(read('lib/spaces/functions.ts'))) bad.push('the Space function still says "Calendar"')
if (/Calendar & Events/.test(read('app/(main)/spaces/[slug]/(profile)/calendar/page.tsx').replace(/\/\/[^\n]*/g, ''))) bad.push('the Space calendar page title still says "Calendar & Events"')
const lint = read('lib/email-studio/voice-lint.ts')
if (!/exempt\?: readonly string\[\]/.test(lint) || !/author\?: 'frequency' \| 'owner'/.test(lint)) bad.push('lintVoice must take exempt names and the author')
if (!/owner and theme names are exempt \(BLD-004\)/.test(read('lib/email-studio/voice-lint.test.ts'))) bad.push('the owner-name exemption test is missing')
const all = loadDecisions()
const at = all.search(/^#{2,3} ADR-1939\b/m)
const adr = at < 0 ? (bad.push('ADR-1939 is not in the decisions view'), '') : all.slice(at, at + 6000)
for (const [k, re] of [['primary action', /Primary action on Commons/], ['calendar name', /"What's Happening" everywhere/], ['banned-word scope', /Banned words are Frequency's rule/], ['Vera', /Vera coaches with questions only/]]) {
  if (!re.test(adr)) bad.push(`ADR-1939 must record the ${k}`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
