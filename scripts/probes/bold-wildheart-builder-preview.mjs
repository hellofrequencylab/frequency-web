// LIVE-2173: the signed-out Create a Space preview wears Bold's and Wildheart's revised design systems (Sofia Sans Extra
// Condensed and Barlow; IM Fell English and EB Garamond), the font sheet loads those faces, and Wildheart wears its own
// five photos instead of the gathering photos. Fails on main (Anton and Cormorant Garamond, FREQUENCY_IMAGERY).
import { readFileSync } from 'node:fs'
const tokens = readFileSync('lib/theme/preview-tokens.ts', 'utf8')
const site = readFileSync('lib/create-space/preview-site.ts', 'utf8')
const bad = []
if (!/bold: \{\s*display: "'Sofia Sans Extra Condensed'/.test(tokens)) bad.push('the Bold preview does not wear Sofia Sans Extra Condensed')
if (!/wildheart: \{\s*display: "'IM Fell English'/.test(tokens)) bad.push('the Wildheart preview does not wear IM Fell English')
for (const f of ['Sofia+Sans+Extra+Condensed', 'Barlow', 'IM+Fell+English', 'EB+Garamond']) if (!tokens.includes(`family=${f}`)) bad.push(`the preview font sheet does not load ${f}`)
if (/wildheart: FREQUENCY_IMAGERY/.test(site)) bad.push('the Wildheart preview still wears the gathering photos')
if (!/wildheart: \{[\s\S]{0,200}WILDHEART_PHOTO\('sisters-shore'\)/.test(site)) bad.push('the Wildheart preview hero is not its own photo')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('bold-wildheart-builder-preview: Bold and Wildheart builder previews wear their revised faces; Wildheart its own photos')
