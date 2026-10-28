#!/usr/bin/env node
// LIVE-1743 (rebuilt LIVE-1753): /themes/designer is the hand-built Designer Theme Kit page, in the order and shapes of the
// Theme Feature Page of the Designer design system (the same twelve sections as Nocturne's): its own static route, a
// preview with Website, Space, Spotlight and Email, the four email templates, and real pictures under public/themes/designer
// for every profile and surface. Fails on main (no page, no pictures).
import { existsSync, readFileSync } from 'node:fs'

const r = (f) => readFileSync(f, 'utf8')
const bad = []
const need = (f) => {
  if (!existsSync(f)) {
    bad.push(`missing ${f}`)
    return false
  }
  return true
}

if (need('app/(marketing)/themes/designer/page.tsx')) {
  const route = r('app/(marketing)/themes/designer/page.tsx')
  if (!route.includes('FrequencyDesigner')) bad.push('the route does not draw FrequencyDesigner')
}
if (need('components/frequency/site/pages/themes/frequency-designer.tsx')) {
  const page = r('components/frequency/site/pages/themes/frequency-designer.tsx')
  for (const id of ['why', 'preview', 'inside', 'yours', 'kits', 'carry', 'built', 'questions', 'steps', 'start']) {
    if (!page.includes(`id="${id}"`)) bad.push(`the page has no #${id} section`)
  }
  for (const s of ['/spaces/new?niche=${kit}&theme=designer', 'Theme Kit', 'Same theme everywhere.', 'Your accent. Your face. Your corners.']) if (!page.includes(s)) bad.push(`the page no longer carries ${s}`)
  if (/#[0-9a-fA-F]{6}/.test(page) || /style=\{\{[^}]*(#|rgb)/.test(page)) bad.push('the page carries a raw color')
  if (/—/.test(page)) bad.push('the page carries an em dash')
}
if (need('components/frequency/site/pages/themes/designer-feature.css')) {
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(r('components/frequency/site/pages/themes/designer-feature.css'))) bad.push('the page CSS carries a colour literal')
}
if (need('lib/themes/designer-feature-data.json')) {
  const data = JSON.parse(r('lib/themes/designer-feature-data.json'))
  if (data.kits.length !== 13) bad.push(`expected 13 profiles, found ${data.kits.length}`)
  for (const k of data.kits) for (const shot of ['site', 'spot', 'spacedesk', 'space', 'email', 'email-welcome', 'email-dates', 'email-receipt']) need(`public/themes/designer/shots/${k.id}-${shot}.jpg`)
}
if (!existsSync('lib/seo/frequency-pages.ts') || !r('lib/seo/frequency-pages.ts').includes("path: '/themes/designer'")) bad.push('the page has no SEO entry')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('designer-theme-page: ok')
