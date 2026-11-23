// LIVE-2513: the Aiden Tyack theme, the first private theme loaded from a Claude Design handoff. It is a full site theme (id, skin,
// faces, accents, starter kit), private to aidentyack.com in the one audience catalog, and on no public list. Reads the sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const style = read('lib/theme/site-style.ts')
if (!/id: 'aiden-tyack'/.test(style)) bad.push('lib/theme/site-style.ts does not define the aiden-tyack site theme')
if (!/RETIRED_FROM_PICKERS[^\n]*'aiden-tyack'/.test(style)) bad.push('aiden-tyack is not in the private set')
if (!/'aiden-tyack': \['aidentyack'\]/.test(style)) bad.push('aiden-tyack is not assigned to the aidentyack Space in PRIVATE_THEME_SITES')
const page = read('components/sites/site-page.tsx')
if (!/AIDEN_TYACK_CSS/.test(page) || !/AIDEN_TYACK_FONT_CLASS/.test(page)) bad.push('the site render does not dress an Aiden Tyack site in its skin and faces')
const skin = read('components/sites/aiden-tyack-css.ts')
if (!/var\(--at-frame\) var\(--at-stitch\)/.test(skin)) bad.push('the skin draws no stitch (the theme signature)')
if (!/\[data-house-theme="aiden-tyack"\]/.test(skin)) bad.push('the skin is not scoped to its own theme root')
if (!/LOADERS\['aiden-tyack-general'\]/.test(read('lib/sites/kits/registry.ts'))) bad.push('no aiden-tyack-general starter kit')
// The library, the Spotlight presets and the kit indexes are public lists; private-themes.test.ts walks the rest at test time.
for (const f of ['lib/themes/library.ts', 'lib/spotlight/theme.ts', 'lib/sites/kits/mindless-profile-index.ts', 'lib/sites/kits/new-world-profile-index.ts'])
  if (/aiden-tyack/.test(read(f))) bad.push(`${f} lists the private theme publicly`)
if (!/aiden-tyack/.test(read('lib/theme/private-themes.test.ts'))) bad.push('the private theme leak test does not pin who may wear aiden-tyack')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('aiden-tyack: private site theme, skin, faces and starter kit in place, on no public list')
