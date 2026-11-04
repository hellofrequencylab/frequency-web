#!/usr/bin/env node
// LIVE-2210: Services is the first theme on manifest schema 2 (LIVE-1997). Its editor-schema2.json entry declares Type voice,
// Motion and Images with defaults, and the site root (site-chrome, the coming-soon page and the editor canvas) writes data-type,
// data-motion and data-image, the switches the Services sheet is keyed on. Fails on main: editor-schema2.json is {} and no root writes them.
import { readFileSync } from 'node:fs'

const bad = []
const read = (p) => readFileSync(p, 'utf8')
const decl = JSON.parse(read('lib/themes/editor-schema2.json')).services
for (const k of ['type', 'motion', 'image']) if (!decl?.dials?.[k]?.supported || !decl.dials[k].default) bad.push(`lib/themes/editor-schema2.json: services does not declare ${k} with a default`)
if (JSON.parse(read('lib/themes/manifests/services.manifest.json')).schema !== 2) bad.push('lib/themes/manifests/services.manifest.json is not schema 2')
const chrome = read('components/sites/site-chrome.tsx')
for (const a of ['data-type={skin?.dials?.type}', 'data-motion={skin?.dials?.motion}', 'data-image={skin?.dials?.image}']) if (!chrome.includes(a)) bad.push(`components/sites/site-chrome.tsx does not write ${a}`)
if (!read('components/sites/site-page.tsx').includes("dials: servicesDials(siteDials(siteStyle, themeEditor('services').own))")) bad.push('components/sites/site-page.tsx does not pass the Services dials to the skin')
if (!read('components/sites/editor/canvas.tsx').includes("theme: 'services', season: mensworkSeason(new Date()), register, dials }")) bad.push('the editor canvas does not pass the Services dials')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('services-dials: ok')
