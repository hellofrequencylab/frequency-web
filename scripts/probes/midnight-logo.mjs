#!/usr/bin/env node
// LIVE-1371: the Midnight header and footer draw the design's logo lockup (a ringed moon seal, the name, the
// tagline) from one component, and its sheet carries no raw color.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
if (!/mn-logo-ring/.test(r('components/sites/midnight-logo.tsx'))) bad.push('the logo lockup lost its ring')
const chrome = r('components/sites/site-chrome.tsx')
if ((chrome.match(/<MidnightLogo /g) ?? []).length < 2) bad.push('the header and the footer do not both draw the Midnight logo')
const css = r('components/sites/midnight-blocks-css.ts')
if (!/\.mn-logo-tag\{/.test(css)) bad.push('the logo tagline has no rule')
if (/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\[data-[^\]]*\]/g, '')) || /rgba?\(/.test(css)) bad.push('midnight-blocks-css.ts carries a raw color')
if (bad.length) {
  console.error('LIVE-1371: ' + bad.join('; '))
  process.exit(1)
}
console.log('midnight-logo: ring lockup in header and footer, tokened')
