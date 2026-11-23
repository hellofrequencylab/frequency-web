// LIVE-2519: aidentyack.com is built from the site Daniel designed in Claude Design ("Aiden Tyack Website.html"), not the handoff's
// starter screen. The site kit holds the design's six pages in its words; the hero carries the pinned print and the seal; the shop
// sorts by category and price; contact takes a topic; the header splits its menu round the lockup. Reads the sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const kit = read('lib/sites/kits/aiden-tyack-site.ts')
const roles = read('components/page-editor/blocks/roles.tsx')
for (const words of ['Built to Outlast You', 'Belts & Bracelets', 'Made for the Long Way Home', 'One Pair of Hands', 'Yours, Down to the Last Stud', 'Talk to the Workshop', 'One Bench, One Pair of Hands', 'Made to Your Measure', 'Made to Outlast You', 'Free for Life', 'Get in Touch'])
  if (!kit.includes(words)) bad.push(`the site kit is missing the design's "${words}"`)
if (!/blocks: \[hero, shop, band, made, custom, talk\]/.test(kit)) bad.push('home is not in the design order')
if (!/slug: 'about', label: 'The Maker'/.test(kit) || !/slug: 'care'/.test(kit) || !/slug: 'custom'/.test(kit)) bad.push('the design pages (Custom, The Maker, Care) are missing')
if (!/LOADERS\['aiden-tyack-site'\]/.test(read('lib/sites/kits/registry.ts'))) bad.push('the site kit is not registered')
if (!/data-part="stage"/.test(roles) || !/data-part="seal"/.test(roles) || !/data-part="pin"/.test(roles)) bad.push('the hero cannot hold the pinned print and the seal')
if (!/RoleShopGrid/.test(roles) || !/data-part="tab"/.test(read('components/page-editor/blocks/role-shop.tsx'))) bad.push('the shop cannot sort by category and price')
if (!/topics/.test(read('components/page-editor/blocks/role-forms.tsx'))) bad.push('the contact form has no topic')
if (!/at-nav-right/.test(read('components/sites/site-chrome.tsx'))) bad.push('the header menu does not split round the lockup')
if (/Midnight/.test(kit)) bad.push('the site kit uses a banned word')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log("aidentyack.com: Daniel's designed site, six pages in his words, pinned print and seal, sorting shop, topic box, split header")
