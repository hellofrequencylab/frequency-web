#!/usr/bin/env node
// LIVE-1285 (ADR-1875): The Temple is a registered, fully tokened site theme.
//
// Fails when 'temple' leaves the site theme registry or the editor theme list, when the contract loses its
// entry, when the skin or token sheet carries a raw color, when the four faces are loaded from the root
// layout, or when the skin stops layering after the house sheets.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []

const style = r('lib/theme/site-style.ts')
if (!style.includes("id: 'temple'") || !style.includes("| 'temple'")) bad.push('temple is not in the site theme registry')
if (!r('lib/sites/editor/state.ts').includes("'Temple'")) bad.push('Temple is not in the editor theme list')
if (!r('lib/sites/editor/theme-contract.json').includes('"Temple"')) bad.push('theme-contract.json has no Temple entry')

const css = r('components/sites/temple-css.ts')
if (/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\[data-[^\]]*\]/g, '')) || /rgba?\(/.test(css)) bad.push('temple-css.ts carries a raw color')
if (!css.includes('TEMPLE_TOKENS_CSS')) bad.push('temple-css.ts no longer includes the token block')

if (/temple-fonts|--font-tp-/.test(r('app/layout.tsx'))) bad.push('the Temple faces are loaded from the root layout')
if (!/temple-fonts/.test(r('components/sites/site-page.tsx'))) bad.push('the site page no longer loads the Temple faces')

const chrome = r('components/sites/site-chrome.tsx')
const iHouse = chrome.indexOf('HOUSE_CSS'), iTemple = chrome.indexOf('TEMPLE_CSS')
if (iTemple < 0 || iHouse < 0) bad.push('site-chrome.tsx does not layer the Temple skin')

if (bad.length) {
  console.error('LIVE-1285: ' + bad.join('; '))
  process.exit(1)
}
console.log('temple-theme: registered, tokened, faces on the site page only')
