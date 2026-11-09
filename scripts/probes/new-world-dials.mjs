#!/usr/bin/env node
// LIVE-2175: New World, the theme every Space starts in, on manifest schema 2 (LIVE-1997). Its editor-schema2.json entry declares
// Type voice, Motion and Images with defaults and the four Looks; the site root (site-page, and the editor canvas through
// site-chrome) writes data-type, data-motion and data-image for it; and New World's dial sheet (new-world-dials-css.ts) is laid
// after its skin wherever the skin is, so each value draws. Fails before LIVE-2175: no entry, no dials on the New World skin, no sheet.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const decl = JSON.parse(read('lib/themes/editor-schema2.json'))['new-world']
for (const k of ['type', 'motion', 'image']) if (!decl?.dials?.[k]?.supported || !decl.dials[k].default) bad.push(`lib/themes/editor-schema2.json: new-world does not declare ${k} with a default`)
const looks = (decl?.looks ?? []).map((l) => l.id).join(',')
if (looks !== 'studio,nightline,paper,trade') bad.push(`lib/themes/editor-schema2.json: new-world Looks are "${looks}", not studio,nightline,paper,trade`)
if (JSON.parse(read('lib/themes/manifests/new-world.manifest.json')).schema !== 2) bad.push('lib/themes/manifests/new-world.manifest.json is not schema 2')
const page = read('components/sites/site-page.tsx')
if (!page.includes("dials: siteRootDials(siteDials(siteStyle, themeEditor('new-world').own))")) bad.push('components/sites/site-page.tsx does not pass the New World dials to the skin')
if (!read('components/sites/editor/canvas.tsx').includes("theme: 'new-world', season: mensworkSeason(new Date()), register, dials }")) bad.push('the editor canvas does not pass the New World dials')
const sheet = 'components/sites/new-world-dials-css.ts'
if (!existsSync(sheet)) bad.push(`${sheet} is missing`)
else {
  const css = read(sheet)
  for (const s of ['[data-type="editorial"]', '[data-motion="calm"]', '[data-motion="off"]', '[data-image="mono"]', '[data-image="grain"]', '[data-image="clean"]', '[data-site-corners="square"]', '[data-site-spacing="compact"]']) if (!css.includes(s)) bad.push(`${sheet} draws nothing for ${s}`)
}
for (const f of ['components/sites/site-chrome.tsx', 'components/sites/site-page.tsx']) if (!read(f).includes('NEW_WORLD_DIALS_CSS')) bad.push(`${f} does not lay the New World dial sheet`)
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('new-world-dials: ok')
