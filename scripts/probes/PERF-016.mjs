#!/usr/bin/env node
// PERF-016: /themes on a phone (owner, 2026-11-19: "loads super slow on mobile, and we need to minimize that menu on scroll").
// The consequences: a phone fetches the half-width copy of every showcase picture (the top section drops from about 615 KB to
// about 190 KB), the 21-family kit font sheet no longer holds the first paint, and the filter bar folds to its kit row on scroll.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'components/frequency/site/pages/themes/kit-showcase'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

// 1. Every showcase picture has a smaller phone copy beside it.
const missing = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith('.webp') && !p.endsWith('.sm.webp')) {
      const sm = p.replace(/\.webp$/, '.sm.webp')
      if (!existsSync(sm) || statSync(sm).size >= statSync(p).size) missing.push(p)
    }
  }
}
walk('public/themes-index')
assert.equal(missing.length, 0, `pictures with no smaller phone copy: ${missing.slice(0, 5).join(', ')}`)

// 2. The style parser points phone widths at those copies, and the CSS switches them under 900px.
const st = read(`${DIR}/st.ts`)
assert.ok(st.includes("style['--ks-sm'] = `url('${hits[0][1]}.sm.webp')`") && st.includes('var(--ks-u,${m})'), 'showcase pictures are not given a phone copy')
const css = read(`${DIR}/kit-showcase.css`)
assert.ok(/@media \(max-width: 899px\) \{\s*\.ks-stage \[style\*="--ks-sm"\] \{ --ks-u: var\(--ks-sm\) \}/.test(css), 'phones do not switch to the phone copies')

// 3. The kit font sheet is not a render-blocking stylesheet in the page markup.
const shell = read(`${DIR}/kit-showcase.tsx`)
assert.ok(!/<link[^>]*KIT_FONT_SHEET/.test(shell), 'the kit font sheet still blocks the first paint')
assert.ok(shell.includes('link.href = KIT_FONT_SHEET'), 'the kit font sheet is never loaded')

// 4. The filter bar folds on a phone and sits under the site header.
assert.ok(shell.includes('useKitBarFold()') && read(`${DIR}/use-kit-bar.ts`).includes("bar.setAttribute('data-min', '')"), 'the filter bar never folds')
assert.ok(css.includes('#kits[data-min] { transform: translateY(var(--ks-bar-shift, 0px)) }') && css.includes('#kits { top: var(--fq-site-nav-h, 0px) !important'), 'the folded bar has no CSS, or the bar sits behind the site header')

console.log('PERF-016: phone pictures, a non-blocking kit font sheet and a folding filter bar on /themes')
