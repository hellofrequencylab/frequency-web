#!/usr/bin/env node
// LIVE-1751: /themes/network is the hand-built Network Theme Kit page, set up the way Nocturne's is: its own
// static route, a server page of kit parts, a preview with Website, Spotlight, Space and Email chips, and real
// pictures under public/themes/network-kit for every profile website and Spotlight (Space and Email are on the way). Fails on main (no page, no pictures).
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

if (need('app/(marketing)/themes/network/page.tsx')) {
  const route = r('app/(marketing)/themes/network/page.tsx')
  if (!route.includes('FrequencyNetwork')) bad.push('the route does not draw FrequencyNetwork')
}
if (need('components/frequency/site/pages/themes/frequency-network.tsx')) {
  const page = r('components/frequency/site/pages/themes/frequency-network.tsx')
  for (const id of ['why', 'preview', 'inside', 'yours', 'kits', 'carry', 'craft', 'questions', 'steps', 'start']) {
    if (!page.includes(`id="${id}"`)) bad.push(`the page has no #${id} section`)
  }
  for (const s of ['KeepGoing', '/spaces/new?theme=network', 'Theme Kit']) if (!page.includes(s)) bad.push(`the page no longer carries ${s}`)
  if (/#[0-9a-fA-F]{6}/.test(page) || /style=\{\{[^}]*(#|rgb)/.test(page)) bad.push('the page carries a raw color')
  if (/—/.test(page)) bad.push('the page carries an em dash')
}
if (need('components/frequency/site/pages/themes/network-preview.tsx')) {
  const prev = r('components/frequency/site/pages/themes/network-preview.tsx')
  if (!prev.includes("'use client'")) bad.push('the preview stage is not a client island')
}
if (need('components/frequency/site/pages/themes/network-feature.css')) {
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(r('components/frequency/site/pages/themes/network-feature.css'))) bad.push('the page CSS carries a colour literal')
}
if (need('lib/themes/network-feature-data.json')) {
  const data = JSON.parse(r('lib/themes/network-feature-data.json'))
  if (data.kits.length !== 13) bad.push(`expected 13 profiles, found ${data.kits.length}`)
  for (const k of data.kits) for (const shot of ['site', 'spot']) need(`public/themes/network-kit/shots/${k.id}-${shot}.jpg`)
  for (const l of data.layouts) need(`public/themes/network-kit/layouts/${l.id}.jpg`)
}
if (!existsSync('lib/seo/frequency-pages.ts') || !r('lib/seo/frequency-pages.ts').includes("path: '/themes/network'")) bad.push('the page has no SEO entry')

if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('network-theme-page: ok')
