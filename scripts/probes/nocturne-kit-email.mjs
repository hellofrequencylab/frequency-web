// The Nocturne Theme Kit's email pass (LIVE-2174): the four emails exist, are built from the design's letter
// palette (inline literals, no CSS variables) and ship in the stock catalog. Fails on main (no Nocturne kit email
// module, the catalog carries no nocturne-kit sample).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`nocturne-kit email: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const email = read('lib/theme/nocturne-kit-email.ts')
if (!email) fail('lib/theme/nocturne-kit-email.ts is missing')
for (const fn of ['nocturneKitNoteEmail', 'nocturneKitWelcomeEmail', 'nocturneKitDatesEmail', 'nocturneKitReceiptEmail']) {
  if (email && !email.includes(`export function ${fn}`)) fail(`${fn} is missing`)
}
// The design's letter colours (EmailPage.html INK, CARD, BONE, MUTED, HAIR), and no CSS variable a mail client drops.
for (const hex of ['#0E0C14', '#17141F', '#F1ECE2', '#B8B1A6', '#2A2633']) {
  if (email && !email.includes(hex)) fail(`the letter palette lacks ${hex}`)
}
if (/var\(--/.test(email)) fail('the module reads a CSS variable, which a mail client cannot resolve')
if (email && !/NOCTURNE_KITS/.test(email)) fail('the accent is not read from the Nocturne kit data')
if (!existsSync('lib/theme/nocturne-kit-email.test.ts')) fail('lib/theme/nocturne-kit-email.test.ts is missing')

const catalog = read('lib/email-samples/catalog.ts')
if (!catalog.includes("from '@/lib/theme/nocturne-kit-email'")) fail('the stock catalog does not import the Nocturne kit emails')
for (const id of ['note', 'welcome', 'dates', 'receipt']) {
  if (!catalog.includes(`id: 'nocturne-kit-${id}'`)) fail(`the stock catalog does not carry nocturne-kit-${id}`)
}
process.exit(bad ? 1 : 0)
