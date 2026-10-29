// The Temple Theme Kit's email pass: the four emails exist and ship in the stock catalog, and the Library says Email
// is ready for the kit. Fails on main (no kit email builders, the Library lists Email as soon).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`temple-kit email: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const email = read('lib/theme/temple-kit-email.ts')
for (const fn of ['templeKitNoteEmail', 'templeKitWelcomeEmail', 'templeKitDatesEmail', 'templeKitReceiptEmail']) {
  if (!email.includes(`export function ${fn}`)) fail(`${fn} is missing`)
}
const catalog = read('lib/email-samples/catalog.ts')
for (const id of ['note', 'welcome', 'dates', 'receipt']) {
  if (!catalog.includes(`id: 'temple-kit-${id}'`)) fail(`the stock catalog does not carry temple-kit-${id}`)
}
if (!/id: 'temple-kit',[\s\S]*?surfaces\('(?:soon|ready)', 'ready'\)/.test(read('lib/themes/library.ts'))) fail('the Library does not list the kit email as ready')
process.exit(bad ? 1 : 0)
