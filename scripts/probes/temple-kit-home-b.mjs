#!/usr/bin/env node
// LIVE-1683: the Temple Kit Home, second half. Seven registered blocks (gallery, journeys, proof, membership, its own
// questions block, the letter band, the closing call) in the Temple Kit family, drawn by the block sheet with no raw colour
// and no shadow-size token, the design's copy in the Home seed, and the planner drawing the full thirteen.
//
// Fails when a block leaves the family, when the sheet loses a section or carries a raw colour or a --shadow-* size, when
// the FAQ is not its own block, or when the Home seed stops carrying "Four weeks of breath". Run on main it fails: none of it exists.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '')
const bad = []
const TYPES = ['TempleKitGallery', 'TempleKitJourneys', 'TempleKitProof', 'TempleKitMembership', 'TempleKitFaq', 'TempleKitLetter', 'TempleKitCta']

const blocks = r('components/page-editor/blocks/temple-kit.tsx')
for (const t of TYPES) if (!new RegExp(`\\b${t}:\\s*block\\(`).test(blocks)) bad.push(`${t} is not a registered block`)
if (/SpaceFAQ/.test(blocks)) bad.push('the questions block borrows SpaceFAQ')
const sheet = r('components/sites/temple-kit-blocks-css.ts')
for (const c of ['tk-gallery', 'tk-journey', 'tk-proof', 'tk-tier', 'tk-faq', 'tk-ltr-band', 'tk-cta']) if (!sheet.includes(`.${c}`)) bad.push(`the block sheet has no .${c}`)
if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(sheet.replace(/\[data-[^\]]*\]/g, ''))) bad.push('temple-kit-blocks-css.ts carries a raw color')
if (/--shadow-(sm|md|lg|xl)\b/.test(sheet)) bad.push('temple-kit-blocks-css.ts reads a --shadow-size token, not --tk-depth-*')
if (/5B3FD0/i.test(sheet)) bad.push('the sheet carries the violet')
const home = r('lib/sites/temple-kit-home.ts')
if (!home.includes('Four weeks of breath')) bad.push('the Home seed has no "Four weeks of breath"')
for (const t of TYPES) if (!home.includes(`type: '${t}'`)) bad.push(`the Home seed does not place ${t}`)
if (/—/.test(home)) bad.push('the Home seed has an em dash')

if (bad.length) {
  console.error('LIVE-1683: ' + bad.join('; '))
  process.exit(1)
}
console.log('temple-kit-home-b: seven blocks registered, sheet tokened, Home seeded with the second half')
