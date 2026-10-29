// The Designer Theme Kit's email pass: the four emails exist, ship in the stock catalog, and the Library says Email is
// ready for the kit. Fails on main (none of the four exists and the Library lists the kit email as soon).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`designer kit email: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const email = read('lib/theme/designer-kit-email.ts')
for (const fn of ['designerKitNoteEmail', 'designerKitWelcomeEmail', 'designerKitDatesEmail', 'designerKitReceiptEmail']) {
  if (!email.includes(`export function ${fn}`)) fail(`${fn} is missing`)
}
const catalog = read('lib/email-samples/catalog.ts')
for (const id of ['note', 'welcome', 'dates', 'receipt']) {
  if (!catalog.includes(`id: 'designer-kit-${id}'`)) fail(`the stock catalog does not carry designer-kit-${id}`)
}
if (!/id: 'designer',[\s\S]*?surfaces\('ready', 'ready'\)/.test(read('lib/themes/library.ts'))) fail('the Library does not list the kit email as ready')
process.exit(bad ? 1 : 0)
