#!/usr/bin/env node
// SCAN-1269: the Business of Community sales page fits its hero above the fold, and every panel that sits
// on a photo can be read. Checks the consequence in source:
//   1. The hero headline tops out at 72px or less, and the collage is sized off the viewport, not a fixed height.
//   2. Every glass panel on the page has the deep UV backing (the pale Dawn glass lost light text on a photo).
//   3. The return-rate gauge and the Community Book pages sit under their photo, not on top of it.
//   4. The first photo row holds five photos, without the fire photo, in a five-column grid.
import { readFileSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const css = read('app/themes/frequency/site-pages-showcase.css')
const rule = (sel) => {
  const at = css.indexOf(`.pa-boc ${sel}{`)
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

const h1 = rule('.boc-h1')
const cap = Number((h1.match(/font:500 clamp\(\d+px,[\d.]+vw,(\d+)px\)/) || [])[1])
if (!cap || cap > 72) fails.push(`the hero headline tops out at ${cap || '?'}px, so it runs past the fold on a laptop`)
const art = rule('.boc-hero-art')
if (!/height:clamp\(\d+px,\d+vh,\d+px\)/.test(art)) fails.push('the hero collage is not sized off the viewport height')
if (/height:\d+px/.test(rule('.boc-hero-main'))) fails.push('the hero photo has a fixed pixel height again')

const panel = rule('.fq-panel')
if (!/background:linear-gradient\(150deg,color-mix\(in oklab,var\(--fq-uv-900\) (9\d|100)%/.test(panel))
  fails.push('glass panels on the page lack the near-solid deep UV backing')

for (const sel of ['.boc-gauge', '.boc-book']) {
  if (/position:absolute/.test(rule(sel))) fails.push(`${sel} sits on top of its photo again`)
}

const page = read('components/frequency/site/pages/courses/business-of-community.tsx')
const band = (page.match(/const BAND: Shot\[\] = \[([\s\S]*?)\n\]/) || [])[1] || ''
const shots = band.match(/src: p\(/g) || []
if (shots.length !== 5) fails.push(`the first photo row holds ${shots.length} photos, not 5`)
if (band.includes("p('fire-night')")) fails.push('the fire photo is back in the first photo row')
const cols = (rule('.boc-band-in').match(/grid-template-columns:([^;]+)/) || [])[1] || ''
if (cols.trim().split(/\s+/).length !== 5) fails.push('the first photo row is not a five-column grid')

if (fails.length) {
  console.error(`SCAN-1269 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('SCAN-1269 ok: the Business of Community hero fits, panels on photos are readable, and the photo row holds five')
