// The Network Theme Kit's email and Space page pass: the four emails exist and ship in the stock catalog, the Library
// says Email is ready, the Space page takes the display face only (no body face), and no kit file carries a raw
// Tailwind-shaped shadow literal. Fails on main (none of the four exists, the Space page still takes Outfit).
import { existsSync, readFileSync } from 'node:fs'

let bad = 0
const fail = (m) => {
  console.error(`network-kit email/space: ${m}`)
  bad++
}
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

const email = read('lib/theme/network-kit-email.ts')
for (const fn of ['networkKitNoteEmail', 'networkKitWelcomeEmail', 'networkKitDatesEmail', 'networkKitReceiptEmail']) {
  if (!email.includes(`export function ${fn}`)) fail(`${fn} is missing`)
}
const catalog = read('lib/email-samples/catalog.ts')
for (const id of ['note', 'welcome', 'dates', 'receipt']) {
  if (!catalog.includes(`id: 'network-kit-${id}'`)) fail(`the stock catalog does not carry network-kit-${id}`)
}
if (!/id: 'network-kit',[\s\S]*?surfaces\('soon', 'ready'\)/.test(read('lib/themes/library.ts'))) fail('the Library does not list the kit email as ready')

const css = read('app/themes/frequency/space-page.css')
const line = css.split('\n').find((l) => l.includes('[data-space-fonts="network-kit"] {') && l.includes('--space-font-display'))
if (!line) fail('the Space page has no network-kit display rule')
else if (/--space-font-body:\s*var\(--font-nk-outfit\)/.test(line)) fail('the Space page still takes the kit body face (display face and accent only, ADR-1728)')

const SHADOW = /(?<!drop-)\bshadow-(?:sm|md|lg|xl|2xl)\b/
for (const f of ['components/sites/network-kit-css.ts', 'components/sites/network-kit-blocks-css.ts', 'components/sites/network-kit-more-css.ts', 'components/spotlight/network-kit-layouts-css.ts', 'lib/theme/network-kit.ts']) {
  const n = read(f).split('\n').filter((l) => SHADOW.test(l)).length
  if (n) fail(`${f} carries ${n} shadow-* literal lines the adoption ratchet counts`)
}
process.exit(bad ? 1 : 0)
