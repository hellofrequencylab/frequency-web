// LIVE-2486: the Spotlight editor's preview is a real phone (drawn at 390 wide, scaled to fit, filled to the
// bottom in the page's own colour), the editor uses the whole console width, and each link shows in the style
// the owner picks: a text link or a button never becomes the big main button, and the New World theme draws
// text links, buttons and cards as picked.
import { readFileSync } from 'node:fs'
const read = (p) => readFileSync(p, 'utf8')
const fail = (m) => { console.error(`LIVE-2486: ${m}`); process.exit(1) }
const frame = read('components/spotlight/spotlight-preview-frame.tsx')
if (!/const DEVICE_W = 390\b/.test(frame) || !/transform: `scale\(\$\{scale\}\)`/.test(frame)) fail('the preview is not a 390 wide phone scaled to fit')
if (!/d\.body\.style\.background = fill/.test(frame)) fail('a short page leaves a pale band at the bottom of the phone')
const page = read('app/(main)/spaces/[slug]/manage/spotlight/page.tsx')
if (!/consoleMeasure="full"/.test(page)) fail('the editor is squeezed into the narrow focus column')
const content = read('lib/spotlight/new-world-kit-content.ts')
if (!/l\.style !== 'text' && l\.style !== 'card'/.test(content)) fail('a text link or card can still become the main button')
const layouts = read('components/spotlight/new-world-kit-layouts.tsx')
if (!/function doorRuns/.test(layouts) || !/nws-textlinks/.test(layouts) || !/nws-btnlinks/.test(layouts)) fail('New World ignores the link styles')
const facts = read('lib/spotlight/space-kit-page.ts')
if (!/asLinkStyle\(bag\('links'\)\?\.linkStyle\)/.test(facts)) fail('the Links block default style never reaches the theme')
console.log('LIVE-2486 ok')
