#!/usr/bin/env node
// LIVE-2200: each kit on /themes fits the first view and offers one clear way in. A kit section is held to the window
// height under the kit bar, short windows drop the quieter rows before the buttons, the primary button says "Use theme",
// the text link beside it says "See the full kit", and a kit with no builder address shows no button. Fails on main
// (no fold rules, the old "See the kit" wording).
import { readFileSync } from 'node:fs'

const dir = 'components/frequency/site/pages/themes/kit-showcase/'
const css = readFileSync(dir + 'kit-showcase.css', 'utf8')
const view = readFileSync(dir + 'kit-showcase-view.tsx', 'utf8')
const bad = []
if (!/\.ks-kit \{[^}]*min-height: calc\(100svh - 60px\)/.test(css)) bad.push('a kit section is not held to the window height under the kit bar')
if (!/max-height: 860px\)[^{]*\{[^}]*\.ks-ready/.test(css)) bad.push('short windows do not drop the ready list and the closing line')
if (!/#kits nav \{[^}]*flex-wrap: nowrap/.test(css)) bad.push('the kit bar can wrap to a second row')
if (!view.includes('>Use theme<')) bad.push('the primary button does not say Use theme')
if (!view.includes('See the full kit')) bad.push('the link beside it does not say See the full kit')
if (/>See the kit</.test(view)) bad.push('the old See the kit wording is still there')
if (!/\{th\.useHref \? \(/.test(view)) bad.push('a kit with no builder address still shows a Use button')
if (bad.length) {
  console.error(bad.map((b) => `✗ ${b}`).join('\n'))
  process.exit(1)
}
console.log('themes-kit-fold: kits fit the fold, Use theme + See the full kit, no button for a kit the builder lacks')
