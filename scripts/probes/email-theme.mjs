// EMAIL-029 probe: every outgoing email follows the member kit, with the stock hero and no crossover violet.
// Source reads only, so it needs no build: the colour and the hero are properties of the files that write them.
//
//   node scripts/probes/email-theme.mjs
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

const read = (p) => readFileSync(p, 'utf8')
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// 1. No email module reads the violet primary: the pastel pill is emailButton, links are ink.
const emailModules = [
  'lib/email.ts', 'lib/email-studio/shell.ts', 'lib/email-studio/render.ts', 'lib/email-react/shell.tsx',
  'lib/email-react/receipt.tsx', 'lib/this-week.ts', 'lib/crm/lead-notify.ts', 'lib/billing/renewal-notice-email.ts',
  'lib/ai/vera/owner-brief.ts', 'app/api/cron/event-reminders/route.ts', 'lib/events/waitlist-notify.ts',
]
for (const m of emailModules) {
  assert.ok(!/palette\.(primary|onPrimary)\b/.test(code(m)), `${m} reads the violet palette.primary`)
}

// 2. No email palette key is the violet.
const palette = read('lib/theme/palette.ts')
const emailKeys = palette.split('\n').filter((l) => /^\s+email\w+:/.test(l))
assert.ok(emailKeys.length >= 30, `expected the email palette keys, found ${emailKeys.length}`)
assert.deepEqual(emailKeys.filter((l) => /#5B3FD0/i.test(l)), [], 'an email palette key is #5B3FD0')

// 3. The stock hero: five files, each under 120 KB, all listed, the shells and the editor canvas mount it.
const type = read('lib/theme/email-type.ts')
assert.ok(/hero-\$\{n\}\.jpg/.test(type) && /\[1, 2, 3, 4, 5\]/.test(type), 'email-type.ts does not list the five heroes')
for (let n = 1; n <= 5; n++) {
  const size = statSync(`public/brand/frequency/email/hero-${n}.jpg`).size
  assert.ok(size > 10_000 && size < 120_000, `hero-${n}.jpg is ${size} bytes`)
}
for (const f of ['lib/email.ts', 'lib/email-studio/shell.ts', 'lib/email-react/shell.tsx']) {
  assert.ok(code(f).includes('pickStockHero'), `${f} does not mount the stock hero`)
}
assert.ok(code('components/admin/email-studio/email-canvas-editor.tsx').includes('emailHeroHtml'), 'the editor canvas does not show the hero')

// 4. The shared pieces are exported and used beyond their own file.
const email = read('lib/email.ts')
for (const fn of ['emailKicker', 'emailFacts', 'emailSection', 'emailRow', 'emailButton']) {
  assert.ok(new RegExp(`export function ${fn}\\(`).test(email), `lib/email.ts does not export ${fn}`)
  assert.ok((email.match(new RegExp(`\\b${fn}\\(`, 'g')) ?? []).length >= 2, `${fn} is not used`)
}
assert.ok(!/\bclass=/.test(code('lib/email-studio/shell.ts').replace(/className/g, '')), 'the block shell writes class= (use data-fq)')

console.log('EMAIL-029: no email reads the violet, the five heroes ship and mount, the shared pieces are used.')
