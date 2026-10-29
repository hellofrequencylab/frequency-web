#!/usr/bin/env node
// LIVE-1801: the Network Theme Kit inner pages, pass B (Book, Shop, Library). One inner block (the booking steps, which reads
// the Space's booking state), a catalog layout on the shared shop and a table layout on the shared library, one scoped sheet
// in the kit skin with no raw colour, and three page builders. No second block for a shared role, and no payment code.
//
// Fails when a block, layout or page is missing, when the sheet is not in the skin or carries a raw colour, or when a page
// builds its own shop, library or offerings block. Run on main it fails: none of it exists.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
const inner = r('components/page-editor/blocks/network-kit-inner.tsx')
if (!/NetworkKitInnerBook:\s*block\(/.test(inner)) bad.push('NetworkKitInnerBook is not a registered block')
if (!/NetworkKitInnerBook:\s*\{\s*role/.test(inner)) bad.push('NetworkKitInnerBook has no role line')
if (!/booking\?\.enabled/.test(inner)) bad.push('the booking block does not read the Space booking state')
if (/NetworkKitInner(Shop|Library|Offerings)/.test(inner)) bad.push('a shared role has a second block')
const shared = r('components/page-editor/blocks/network-kit.tsx')
if (!/'catalog'/.test(shared)) bad.push('NetworkKitShop has no catalog layout')
if (!/'table'/.test(shared)) bad.push('NetworkKitLibrary has no table layout')
const sheet = r('components/sites/network-kit-inner/inner-b-css.ts')
if (!sheet.includes('.nki-stepper')) bad.push('the pass B sheet has no .nki-stepper')
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(sheet.replace(/\[data-[^\]]*\]/g, ''))) bad.push('inner-b-css.ts carries a raw colour')
if (!r('components/sites/network-kit-css.ts').includes('NETWORK_KIT_INNER_B_CSS')) bad.push('the pass B sheet is not in the kit skin')
const pages = r('components/sites/network-kit-inner/pages-b.ts')
for (const s of ['book', 'shop', 'resources']) if (!pages.includes(`page('${s}'`)) bad.push(`no ${s} page`)
if (/type: 'NetworkKitInner(Shop|Library)'/.test(pages)) bad.push('a page carries its own shop or library block')
if (/checkout|billing/i.test(pages + inner)) bad.push('payment code in the inner pages')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('network-kit-inner-b: ok')
