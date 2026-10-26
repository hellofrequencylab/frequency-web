#!/usr/bin/env node
// LIVE-1372: the Midnight top bar (moon phase, next gathering, small links) and the design's procedural textures
// (cloud mist, smoke, roots, stardust, glows, vignette) are tokens and classes, with no raw color in the sheets.
import { readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
if (!/<MidnightBar /.test(r('components/sites/site-chrome.tsx'))) bad.push('the site chrome does not draw the Midnight top bar')
if (!/midnightMoon/.test(r('components/sites/midnight-bar.tsx'))) bad.push('the top bar no longer names the moon')
const tokens = r('lib/theme/midnight.ts')
for (const t of ['--mn-tex-cloud', '--mn-tex-smoke', '--mn-tex-roots', '--mn-tex-stardust']) if (!tokens.includes(t)) bad.push(`${t} is missing from the token block`)
const css = r('components/sites/midnight-blocks-css.ts')
for (const c of ['.mn-mist', '.mn-smoke', '.mn-roots', '.mn-stardust', '.mn-moonglow', '.mn-candle', '.mn-vignette', '.mn-bar']) if (!css.includes(c + '{') && !css.includes(c + ',')) bad.push(`${c} has no rule`)
if (/#[0-9a-fA-F]{3,8}\b/.test(css.replace(/\[data-[^\]]*\]/g, '')) || /rgba?\(/.test(css)) bad.push('midnight-blocks-css.ts carries a raw color')
if (!/prefers-reduced-motion:reduce\)\{\$\{N\} \.mn-mist/.test(css)) bad.push('the textures do not stop under reduced motion')
if (bad.length) {
  console.error('LIVE-1372: ' + bad.join('; '))
  process.exit(1)
}
console.log('midnight-bar: top bar and textures present, tokened, motion-safe')
