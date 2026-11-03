#!/usr/bin/env node
// LIVE-2065: /themes/new-world exists on the Nocturne layout: a static route that wins over /themes/[theme] (which skips it), the
// preview stage with the four-surface switcher, a real picture for every surface of every kit and every Spotlight layout, and
// indexable and in the sitemap now that the theme is offered in the pickers (owner, 2026-11-03). Fails on main (no route, no pictures).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const need = (p) => { if (!existsSync(p)) bad.push(`missing ${p}`) }
for (const p of [
  'app/(marketing)/themes/new-world/page.tsx',
  'components/frequency/site/pages/themes/frequency-new-world.tsx',
  'components/frequency/site/pages/themes/new-world-preview.tsx',
  'components/frequency/site/pages/themes/new-world-feature.css',
  'lib/themes/new-world-feature-data.ts',
]) need(p)
for (const kit of ['general', 'coaches', 'studios', 'hosts', 'venues', 'nonprofits', 'networks']) {
  for (const shot of ['site', 'spot', 'spacedesk', 'email']) need(`public/brand/new-world-kit/shots/${kit}-${shot}.jpg`)
}
for (const id of ['stack', 'card-wall', 'story', 'calendar-first', 'shop-front', 'profile']) need(`public/brand/new-world-kit/layouts/${id}.jpg`)
if (!bad.length) {
  const route = readFileSync('app/(marketing)/themes/new-world/page.tsx', 'utf8')
  if (/index:\s*false/.test(route)) bad.push('the page still tells search engines to skip it')
  if (!readFileSync('app/sitemap.ts', 'utf8').includes('/themes/new-world')) bad.push('/themes/new-world is not in the sitemap')
  if (!readFileSync('app/(marketing)/themes/[theme]/page.tsx', 'utf8').includes("id !== 'new-world'")) bad.push('/themes/[theme] does not skip new-world')
  if (!/aria-label="Surface"/.test(readFileSync('components/frequency/site/pages/themes/new-world-preview.tsx', 'utf8'))) bad.push('no surface switcher')
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('new-world-theme-page: ok')
