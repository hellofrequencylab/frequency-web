#!/usr/bin/env node
// LIVE-1800: the Network Theme Kit inner pages, pass A (About, Services, Meetups, Programs). Four NetworkKitInner blocks
// (story, organizers, service rows, filtered index) with a role line each, the shared Stats block's photo layout and the
// shared closing call's compact card, one scoped sheet in the kit skin with no raw colour, and four page builders that
// open on the shared page header and add no second block for a shared role.
//
// Fails when a block, a layout or a page is missing, when the sheet is not in the skin or carries a raw colour, or when
// the pages use a Proof, FAQ, CTA, Letter or Stats block of their own. Run on main it fails: none of it exists.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
const blocks = r('components/page-editor/blocks/network-kit-inner.tsx')
for (const t of ['Story', 'Team', 'Services', 'Index']) if (!new RegExp(`NetworkKitInner${t}:\\s*block\\(`).test(blocks)) bad.push(`NetworkKitInner${t} is not a registered block`)
if (!/NETWORK_KIT_INNER_ROLES/.test(blocks)) bad.push('the role sidecar is missing')
if (/NetworkKitInner(Proof|FAQ|CTA|Letter|Stats)/.test(blocks)) bad.push('a shared role has a second block')
if (!/'photo'/.test(r('components/page-editor/blocks/network-kit-more.tsx'))) bad.push('NetworkKitStats has no photo layout')
if (!/'card'/.test(r('components/page-editor/blocks/network-kit.tsx'))) bad.push('NetworkKitCTA has no card layout')
const sheet = r('components/sites/network-kit-inner/inner-css.ts')
if (!sheet.includes('.nki-service')) bad.push('the inner sheet has no .nki-service')
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(sheet.replace(/\[data-[^\]]*\]/g, ''))) bad.push('inner-css.ts carries a raw colour')
if (!r('components/sites/network-kit-css.ts').includes('NETWORK_KIT_INNER_CSS')) bad.push('the inner sheet is not in the kit skin')
const pages = r('components/sites/network-kit-inner/pages.ts')
for (const s of ['about', 'services', 'workshops', 'journeys']) if (!pages.includes(`page('${s}'`)) bad.push(`no ${s} page`)
if (/type: 'NetworkKit(Proof|Letter)'/.test(pages)) bad.push('a page carries its own Proof or Letter block')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('network-kit-inner-a: ok')
