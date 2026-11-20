#!/usr/bin/env node
// PERF-015: hero and fold photos on the home, North County and city pages are found early and served small.
//   1. The home fold's six photos offer a 360px WebP (a phone's 180px slot at 2x) through <picture>, and
//      each file exists and is small. Before: the smallest candidate was the 640px JPEG (264 KB for six).
//   2. The North County and city pages draw their hero through DxHero, which preloads the hero still from
//      the HTML (PhotoBgPreload), so the browser no longer waits 1.2 to 1.7 s to find a CSS background.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const fails = []

const home = read('components/frequency/site/pages/home/frequency-home.tsx')
const files = [...home.matchAll(/\['([\w-]+)\.jpg', [\d.]+, \{/g)].map((m) => m[1])
if (files.length !== 6) fails.push(`expected six fold photos, found ${files.length}`)
if (!/<picture>\s*<source\s+type="image\/webp"\s+srcSet=\{`\$\{photo\(`sm\/\$\{file\.replace\(\/\\\.jpg\$\/, '-360\.webp'\)\}`\)\} 360w/.test(home)) {
  fails.push('the home fold offers no 360px WebP through <picture><source>')
}
for (const f of files) {
  const p = path.join(ROOT, `public/brand/frequency/photos/sm/${f}-360.webp`)
  if (!fs.existsSync(p)) fails.push(`missing ${path.relative(ROOT, p)}`)
  else if (fs.statSync(p).size > 30 * 1024) fails.push(`${path.relative(ROOT, p)} is over 30 KB`)
}
if (!/\.pa-home \.fl-ph picture\{display:contents\}/.test(read('app/themes/frequency/site-pages-a.css'))) {
  fails.push('site-pages-a.css does not let the fold <picture> pass the slot through (display: contents)')
}

const parts = read('components/frequency/site/pages/discover/parts.tsx')
const hero = parts.slice(parts.indexOf('export function DxHero'), parts.indexOf('export function DxHead'))
if (!/<PhotoBgPreload src=\{photo\} \/>/.test(hero)) fails.push('DxHero does not preload its hero still')
const preload = read('components/frequency/site/pages/shared/photo-bg-preload.tsx')
if (!/rel="preload" as="image"[^>]*fetchPriority="high"/.test(preload)) fails.push('PhotoBgPreload is not a high-priority image preload')
for (const [rel, re] of [
  ['components/frequency/site/pages/north-county/frequency-north-county.tsx', /<DxHero[\s\S]{0,200}photo=\{dxPhoto\(/],
  ['components/frequency/site/pages/discover/frequency-discover-places.tsx', /export function FrequencyTown[\s\S]*?<DxHero[\s\S]{0,200}photo=\{dxPhoto\(/],
]) if (!re.test(read(rel))) fails.push(`${rel} does not draw its hero through DxHero`)

if (fails.length) {
  console.error(`PERF-015 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log('PERF-015 ok: fold photos offer a 360px WebP; North County and city heroes are preloaded from the HTML')
