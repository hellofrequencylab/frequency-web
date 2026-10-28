#!/usr/bin/env node
// LIVE-1572: /themes/nocturne is the Theme Feature Page of the Default Template design system, built section by
// section, with every picture present and every button pointing at a real route.
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const page = r('components/frequency/site/pages/themes/frequency-midnight.tsx')
const data = JSON.parse(r('lib/themes/nocturne-feature-data.json'))

if (data.kits.length !== 13) bad.push(`expected 13 kits, found ${data.kits.length}`)
for (const k of data.kits) {
  for (const [shot, ext] of [['site', 'jpg'], ['space', 'png'], ['spot', 'png'], ['email', 'png']]) {
    const f = `public/themes/midnight/shots/${k.id}-${shot}.${ext}`
    if (!existsSync(f)) bad.push(`missing picture ${f}`)
  }
}
for (const id of ['why', 'preview', 'inside', 'yours', 'kits', 'carry', 'built', 'questions', 'steps', 'start']) {
  if (!page.includes(`id="${id}"`)) bad.push(`the feature page has no #${id} section`)
}
for (const s of ['KeepGoing', '/spaces/new?niche=', '/themes/nocturne/demo', "'/pricing'", 'nocturne-accent']) {
  if (!page.includes(s)) bad.push(`the feature page no longer carries ${s}`)
}
if (/style=\{\{[^}]*(#|rgb)/.test(page) || /#[0-9a-fA-F]{6}/.test(page)) bad.push('the feature page carries a raw color')
if (/2\.7|61%|under 5%|<5%/.test(page)) bad.push('the design page research figures are back on the page (voice guide: no figures we cannot stand behind)')
if (!r('components/sites/midnight-demo.tsx').includes('MidnightAccentFrame')) bad.push('the sample site no longer takes the accent from the feature page')

if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('nocturne-feature-page: ok')
