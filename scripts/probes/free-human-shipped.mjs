// The Free Human Theme Kit ships its four emails and six Spotlight layouts, and the Space seed exists (LIVE-1910).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`free-human shipped: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

for (const f of ['lib/theme/free-human-email.ts', 'components/spotlight/free-human-layouts.tsx', 'lib/spotlight/free-human-content.ts', 'lib/sites/free-human-site.ts']) if (!existsSync(f)) fail(`${f} is missing`)
const email = read('lib/theme/free-human-email.ts')
for (const e of ['freeHumanNoteEmail', 'freeHumanWelcomeEmail', 'freeHumanDatesEmail', 'freeHumanReceiptEmail']) if (!email.includes(`export function ${e}`)) fail(`${e} is not exported`)
if (!/'free-human': LAYOUT_BLURBS/.test(read('lib/spotlight/layouts.ts'))) fail('the six Free Human Spotlight layouts are not registered')
if (!/free-human-note/.test(read('lib/email-samples/catalog.ts'))) fail('the Free Human emails are not in the sample catalog')
process.exit(bad ? 1 : 0)
