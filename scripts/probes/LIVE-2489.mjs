#!/usr/bin/env node
// LIVE-2489: the Circle header reads cleanly on a phone and shows the Space logo whole. The status badge and the
// "Part of <Space>" pill sit in their own row (never absolutely over the title); the art is its own band above the
// name, facts and buttons; the owning Space's logo sits over the picture uncropped (object-fit: contain); a Circle
// whose image is its Space logo gets the Space header behind it. Fails when any of those slips back.
import { readFileSync } from 'node:fs'

const shell = readFileSync('components/frequency/members/circle/circle-shell.tsx', 'utf8')
const layout = readFileSync('app/(main)/circles/[slug]/(circle)/layout.tsx', 'utf8')
const css = readFileSync('app/themes/frequency/members-circle.css', 'utf8')
const rules = (sel) => {
  const out = []
  for (let at = css.indexOf(`] ${sel}{`); at >= 0; at = css.indexOf(`] ${sel}{`, at + 1)) out.push(css.slice(at, css.indexOf('}', at)))
  return out
}
const last = (sel) => rules(sel).at(-1) ?? ''
const bad = []
if (!/className="fqc-cover-top"/.test(shell)) bad.push('the badge row is gone from the cover')
if (!/className="fqc-cover-art"/.test(shell)) bad.push('the cover art is not its own band')
if (!/className="fqc-cover-logo"/.test(shell)) bad.push('the Space logo is not drawn over the cover')
if (!/circleCoverArt\(\s*circle\.image_url,/.test(layout) || !/coverLogo=\{coverArt\.logo/.test(layout)) bad.push('the Circle layout does not pass the Space logo and its background')
if (rules('.fqc-badge').some((r) => r.includes('position:absolute')) || rules('.fqc-space-pill').some((r) => r.includes('position:absolute'))) bad.push('a badge is absolutely placed over the title again')
if (!/position:relative[^}]*aspect-ratio/.test(last('.fqc-cover-art'))) bad.push('the art no longer sits in its own band')
if (!last('.fqc-cover-logo').includes('object-fit:contain')) bad.push('the logo can be cropped')
if (!last('.fqc-cover .h1').includes('color:var(--fq-text-strong)')) bad.push('the title is not on the panel in the kit ink')
if (!last('.fqc-act-main').includes('order:-1') && !rules('.fqc-act-main').some((r) => r.includes('order:-1'))) bad.push('the primary action does not lead')
if (bad.length) {
  console.error('LIVE-2489: ' + bad.join('; '))
  process.exit(1)
}
console.log('LIVE-2489 circle header: ok')
