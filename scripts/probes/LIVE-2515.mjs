// LIVE-2515: the private Aiden Tyack theme's Spotlight layouts and kit emails. It wears the shared house kit (six layouts, four
// letters) in its own tokens and faces, its Space's Spotlight offers the six looks, and no member Spotlight may store one. Reads the
// sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const content = read('lib/spotlight/house-kit-content.ts')
if (!/'aiden-tyack': 'aiden-tyack-kit'/.test(content)) bad.push('no aiden-tyack-kit prefix in the house kit')
if (!/'aiden-tyack': \{[\s\S]*?photos\/riders-on-coast-road\.webp/.test(content)) bad.push('the house kit has no Aiden Tyack words and photos')
const layouts = read('lib/spotlight/layouts.ts')
if (!/'aiden-tyack': LAYOUT_BLURBS/.test(layouts)) bad.push('the six layouts are not registered for aiden-tyack')
if (!/'aiden-tyack': 'aiden-tyack',/.test(layouts)) bad.push('the aidentyack Space Spotlight is not keyed to its layouts')
if (!/PRIVATE_LAYOUT_PREFIXES = \['aiden-tyack-kit:'\]/.test(layouts)) bad.push('a member Spotlight could store a private layout')
if (!/\[data-kit-theme="aiden-tyack"\][^\n]*--font-at-display/.test(read('components/spotlight/house-kit-layouts-css.ts'))) bad.push('the Spotlight sheet has no Aiden Tyack presentation')
if (!/AIDEN_TYACK_FONT_CLASS/.test(read('components/spotlight/themed-space-spotlight.tsx'))) bad.push('the Space Spotlight does not load the Aiden Tyack faces')
if (!/'aiden-tyack': \{\s*sheet: '[^']*Grenze\+Gotisch/.test(read('lib/theme/house-kit-email.ts'))) bad.push('the kit emails have no Aiden Tyack look')
if (!/houseKitSamples\('aiden-tyack'\)/.test(read('lib/email-samples/catalog.ts'))) bad.push('the four Aiden Tyack letters are not in the sample catalog')
if (/aiden-tyack/.test(read('lib/spotlight/theme.ts'))) bad.push('lib/spotlight/theme.ts lists the private theme as a public preset')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('aiden-tyack: six Spotlight layouts and four kit emails, private to its Space')
