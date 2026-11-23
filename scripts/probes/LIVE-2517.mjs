// LIVE-2517: aidentyack.com is drawn as the Aiden Tyack handoff draws it (ui_kits/site home): edge-to-edge sections, the forest hero,
// the handoff header and footer lockup, and the home page in the handoff's order with real forms. Reads the sources (no build).
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const css = read('components/sites/aiden-tyack-css.ts')
const kit = read('lib/sites/kits/aiden-tyack-variants.ts')
if (!css.includes('${A} .mw-wrap.mw-other{max-width:none;padding:0}')) bad.push('sections still sit boxed in the page column')
if (!css.includes('redwood-forest-silhouette.webp) 50% 40%/cover')) bad.push('the forest hero has no redwood silhouette')
if (!css.includes('logo/logo-mark.svg')) bad.push('the hammers mark is missing')
if (!/AidenTyackLogo/.test(read('components/sites/site-chrome.tsx'))) bad.push('the header and footer do not draw the Aiden Tyack lockup')
if (!/blocks: \[hero, shop\('The shop', 'Name Your Collection', true\), quote, steps, band, proof, faq, cta, letter, contact\]/.test(kit)) bad.push('home is not in the handoff order')
if (!/form: true/.test(kit) || !/RoleLetterForm/.test(read('components/page-editor/blocks/roles.tsx'))) bad.push('the letter and contact sections have no form')
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('aidentyack.com: edge-to-edge handoff sections, forest hero, hammers lockup, home in the handoff order with real forms')
