#!/usr/bin/env node
// LIVE-1493: the Designer chrome and Alli Rae's site carry the design system's details (a header that clears over the
// hero and goes solid on scroll, a utility bar, dropdown menu items with a line each, the closing band and footer with
// the letter sign-up, the hero parallax), and the seed writes the saved menu and footer.
//
// Fails when one of those leaves the tree, so a later edit cannot quietly flatten the design back to a plain skin.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
for (const f of ['designer-chrome', 'designer-header-state', 'designer-letter-form', 'designer-parallax']) {
  if (!existsSync(`components/sites/${f}.tsx`)) bad.push(`components/sites/${f}.tsx is missing`)
}
const css = r('components/sites/designer-css.ts')
for (const needle of [':has(#top .dz-hero)', '[data-scrolled]', '.dz-foot-band', '.dz-letter']) {
  if (!css.includes(needle)) bad.push(`designer-css.ts lost ${needle}`)
}
const footer = r('lib/sites/site-footer.ts')
for (const needle of ['readBand', 'readSubscribe', 'readUtility', 'lines']) {
  if (!footer.includes(needle)) bad.push(`site-footer.ts lost ${needle}`)
}
const site = r('lib/sites/alli-rae-site.ts')
for (const needle of ['ALLI_RAE_MENU', 'ALLI_RAE_FOOTER', 'band:', 'subscribe:', 'utility:']) {
  if (!site.includes(needle)) bad.push(`alli-rae-site.ts lost ${needle}`)
}
const seed = r('scripts/seed-alli-rae.mts')
if (!seed.includes('siteMenu: ALLI_RAE_MENU')) bad.push('the seed script no longer writes the saved menu')

if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('Designer chrome and Alli Rae fidelity details are in place.')
