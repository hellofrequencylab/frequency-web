// Temple Theme Kit polish (Daniel's picks, 2026-10-29): a white label on the clay button, each profile kit starts a site in
// its own accent, and the Temple Spotlight wears Temple's faces with the quote in Cormorant italic.
// Fails on main (the label is #FFF6EE, the kits carry no accent, the Spotlight route loads no Temple faces).
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const kit = r('lib/theme/temple-kit.ts')
if (/#FFF6EE/i.test(kit)) bad.push('lib/theme/temple-kit.ts still carries the #FFF6EE label')
if (!/TEMPLE_KIT_SOLID = \{[^}]*on: '#FFFFFF'/.test(kit)) bad.push('the solid clay button does not wear a white label')
if (!/accent: templeKitProfileAccent\(niche\)/.test(r('lib/sites/kits/temple-kit-profile-variants.ts'))) bad.push('the profile kits do not carry their accent')
if (!/kit\.accent/.test(r('lib/sites/kits/apply.ts'))) bad.push('applyKit never writes a kit accent')
if (!/font-style:italic/.test(r('components/spotlight/temple-kit-layouts-css.ts').split('\n').find((l) => l.startsWith('.tks-quote p')) ?? '')) bad.push('the Temple Spotlight quote is not italic')
if (!r('app/spotlight/[handle]/page.tsx').includes('TEMPLE_FONT_CLASS')) bad.push('the Spotlight route does not load the Temple faces')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('temple-kit-polish: ok')
