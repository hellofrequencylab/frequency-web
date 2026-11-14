// LIVE-2286: the builder previews carry the design pages' small details: Wildheart's stag mark, each theme's own nav links,
// Temple's next-gathering card, and a stand-in picture library for Bold.
import fs from 'node:fs'
const bad = []
const site = fs.readFileSync('lib/create-space/preview-site.ts', 'utf8')
const prev = fs.readFileSync('components/frequency/site/pages/create-space/space-preview.tsx', 'utf8')
const css = fs.readFileSync('components/frequency/site/pages/create-space/create-space-themes.css', 'utf8')
if (!/'temple-kit': \{ next: \{/.test(site)) bad.push('Temple has no next-gathering card in its sample')
if (!/'network-kit': \{ links: \['Come to a meetup'/.test(site)) bad.push('Network does not carry its own nav links')
if (!/designer: \{ links: \['Portfolio'/.test(site)) bad.push('Designer does not carry its own nav links')
if (!/bold: \{\s*hero: NEW_WORLD_PHOTO/.test(site)) bad.push('Bold has no stand-in picture library')
if (!/wildheart-logo\.svg/.test(prev) || !fs.existsSync('public/brand/wildheart/wildheart-logo.svg')) bad.push('Wildheart does not wear the stag mark')
if (!/cs-pv-next/.test(prev) || !/cs-pv-next/.test(css)) bad.push('the next-gathering card is not rendered or styled')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('create-space-preview-details: stag mark, nav links, next-gathering card and Bold stand-ins are in')
