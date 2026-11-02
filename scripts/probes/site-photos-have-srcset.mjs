#!/usr/bin/env node
// LIVE-1977: every brand photo in a kit-sized slot on the public site goes through photoImg() (shared
// parts.tsx, next/image's getImageProps), so the browser is offered the slot's width, not the 1600px
// original. Measured 2026-11-02 at 1280x900: / shipped 1734KB of images and /features 1645KB with raw
// `<img src>`; 1407KB and 523KB after (each chapter photo 250KB -> 25KB). The footer wordmark gets a
// `sizes` so next/image stops picking the 1920px rendition for a 176px mark. This probe reads the site
// pages for a raw photo `<img src=` that bypasses the helper, and the footer for its sizes.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const bad = []
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(f) && !/\.test\.tsx$/.test(f)) out.push(p)
  }
  return out
}
for (const f of walk('components/frequency/site/pages')) {
  const s = readFileSync(f, 'utf8')
  // A raw `<img ... src={photo(...)}` or a `/brand/frequency/photos|facilities` src with no srcSet: the fold
  // stage on / writes its own srcSet by hand (photos/sm), which is the one allowed shape.
  for (const m of s.matchAll(/<img[^>]*?src=\{(?:photo\(|`\/brand\/frequency\/(?:photos|facilities))[^>]*>/gs)) {
    if (!/srcSet/.test(m[0])) bad.push(`${f}: raw photo img with no srcSet: ${m[0].slice(0, 80).replace(/\s+/g, ' ')}`)
  }
}
const parts = readFileSync('components/frequency/site/pages/shared/parts.tsx', 'utf8')
if (!/export function photoImg\(/.test(parts) || !/getImageProps\(/.test(parts)) bad.push('shared/parts.tsx has no photoImg() built on getImageProps')
if (!/<img[^>]*\{\.\.\.photoImg\(src\)\}/.test(parts)) bad.push('ChapPhoto renders a raw src instead of photoImg(src)')
const footer = readFileSync('components/frequency/site/shell/site-footer.tsx', 'utf8')
if (!/<Image className="w"[^>]*sizes="176px"/.test(footer)) bad.push('site-footer.tsx wordmark Image has no sizes="176px", so next/image serves the 1920px rendition')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('every site photo offers the slot\'s width; the footer wordmark is sized')
