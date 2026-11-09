#!/usr/bin/env node
// LIVE-2000: a hero `.bg` on the public site is a CSS background, which a srcset cannot reach, so every
// visitor downloaded the 1600px JPEG (285 to 420KB each). Measured 2026-11-02 at 1280x900: /pricing
// shipped 2043KB of background stills, /for 590KB, / 1409KB; 269KB, 301KB and 742KB after. The fix routes
// each still through the image optimizer: shared photo-bg.ts exports optimizedPhoto() and photoBg(), the
// pages set `--fq-bg` / `--fq-bg-sm` with photoBg(), and the kit CSS paints the 1920px rendition with the
// 1080px one under 860px wide. The home hero preload points at the same rendition so it shares the fetch.
// This probe reads the site pages and kit CSS for a brand still that bypasses the optimizer.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const bad = []
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) out.push(p)
  }
  return out
}
for (const f of walk('components/frequency/site/pages')) {
  const s = readFileSync(f, 'utf8')
  // A `backgroundImage: \`url(...)\`` or `url('/brand/...')` written straight into a style prop.
  for (const m of s.matchAll(/backgroundImage:\s*`url\(['"]?\$?\{?(?:photo\(|\/brand\/)[^`]*`/g)) {
    bad.push(`${f}: background still bypasses the optimizer: ${m[0].slice(0, 90)}`)
  }
  for (const m of s.matchAll(/<link[^>]*rel="preload"[^>]*href="\/brand\/[^"]*\.(?:jpe?g|png|webp|avif)"/g)) {
    bad.push(`${f}: image preload fetches the raw file: ${m[0].slice(0, 90)}`)
  }
}
const helpers = existsSync('components/frequency/site/pages/shared/photo-bg.ts') ? readFileSync('components/frequency/site/pages/shared/photo-bg.ts', 'utf8') : ''
if (!/export function optimizedPhoto\(/.test(helpers) || !/\/_next\/image\?url=/.test(helpers)) bad.push('shared/photo-bg.ts has no optimizedPhoto() built on the image optimizer')
if (!/export function photoBg\(/.test(helpers) || !/'--fq-bg-sm'/.test(helpers)) bad.push('shared/photo-bg.ts has no photoBg() setting --fq-bg and --fq-bg-sm')
if (/^import /m.test(helpers.replace(/^import type [^\n]*\n/m, ''))) bad.push('shared/photo-bg.ts imports a module, so the timer-runtime probe can no longer load it bare')
for (const css of ['app/themes/frequency/kit-site.css', 'app/themes/frequency/site-pages-a.css']) {
  const s = readFileSync(css, 'utf8')
  for (const m of s.matchAll(/url\(['"]?\/brand\/frequency\/(?:photos|broll)\/[^)]*\)/g)) {
    bad.push(`${css}: background still is the raw file: ${m[0]}`)
  }
  if (!/@media \(max-width:860px\)/.test(s)) bad.push(`${css}: no 860px switch to the 1080px rendition`)
}
const kit = readFileSync('app/themes/frequency/kit-site.css', 'utf8')
if (!/\.hero \.bg\{[^}]*var\(--fq-bg/.test(kit) || !/\.phero \.bg\{[^}]*var\(--fq-bg/.test(kit)) bad.push('kit-site.css .hero / .phero .bg do not read --fq-bg')
if (!/--fq-bg-sm/.test(kit)) bad.push('kit-site.css never switches to the --fq-bg-sm rendition')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('every public-site background still is served through the image optimizer at the slot\'s width')
