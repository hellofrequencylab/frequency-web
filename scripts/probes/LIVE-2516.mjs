// LIVE-2516: a website section whose block draws nothing on the live page (a sample-only role block with no real rows) leaves no
// empty padded wrapper behind, and the Aiden Tyack kit's stats band never shows a new Space's own tiny counts. Reads the sources.
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!read('components/sites/website-document.tsx').includes('.site-doc-section:has(>.mw-wrap>div:empty:only-child){display:none!important}')) bad.push('an empty section wrapper still pads the live page')
if (!/RoleStats', \{\s*eyebrow: 'In numbers', title: '', lead: '', live: false/.test(read('lib/sites/kits/aiden-tyack-variants.ts'))) bad.push('the Aiden Tyack stats band reads the Space counts')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('empty sections leave no gap; the Aiden Tyack stats band waits for real numbers')
