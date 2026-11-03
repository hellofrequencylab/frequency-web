#!/usr/bin/env node
// LIVE-2083: /themes/bold and /themes/wildheart open and run like Nocturne's page: the theme's name large with the
// buttons left and the preview right, the four surfaces joined by a dotted line, Nocturne's sections in order, and a real render for
// every surface (no "picture on the way" box). Fails on main (the generic six-section page with empty boxes).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const page = 'components/frequency/site/pages/themes/frequency-theme-feature.tsx'
const s = existsSync(page) ? readFileSync(page, 'utf8') : ''
if (!s) bad.push(`${page} is missing`)
for (const need of ['nwf-name', 'nwf-aft', 'nwf-cascade', 'nwf-thread', 'id="why"', 'id="preview"', 'id="inside"', 'id="yours"', 'id="kits"', 'id="carry"', 'id="built"', 'id="questions"', 'id="steps"', 'ThemeFeatureStage']) {
  if (s && !s.includes(need)) bad.push(`${page} has no ${need}`)
}
const route = readFileSync('app/(marketing)/themes/[theme]/page.tsx', 'utf8')
if (!route.includes('FrequencyThemeFeature')) bad.push('the /themes/[theme] route does not draw FrequencyThemeFeature')
for (const t of ['bold', 'wildheart']) {
  for (const f of ['site', 'spot', 'spacedesk', 'email']) {
    if (!existsSync(`public/brand/theme-pages/${t}/${f}.jpg`)) bad.push(`public/brand/theme-pages/${t}/${f}.jpg is missing`)
  }
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-pages-bold-wildheart: ok')
