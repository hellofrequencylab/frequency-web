#!/usr/bin/env node
// LIVE-2188: /themes is the Theme Kits page from the owner's design: nine kit sections, the main button goes to the launch
// doorway and "See the kit" to that theme's page. Fails on main (the old gallery has no kit-showcase).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const dir = 'components/frequency/site/pages/themes/kit-showcase/'
for (const f of ['data.ts', 'skins.ts', 'use-kit-showcase.ts', 'kit-showcase-view.tsx', 'kit-showcase.tsx', 'kit-showcase.css']) {
  if (!existsSync(dir + f)) bad.push(`missing ${dir}${f}`)
}
if (!bad.length) {
  const page = readFileSync('components/frequency/site/pages/themes/frequency-themes.tsx', 'utf8')
  if (!page.includes('KitShowcase')) bad.push('/themes does not render the kit showcase')
  if (!page.includes("freeSpotlightHref('themes'")) bad.push('the main button does not use the launch doorway')
  if (!page.includes('themePagePath')) bad.push('"See the kit" does not go to the theme page')
  const data = readFileSync(dir + 'data.ts', 'utf8')
  for (const id of ['new-world', 'network', 'services', 'designer', 'bold', 'temple', 'cyberwitch', 'wildheart', 'nocturne']) {
    if (!data.includes(`'${id}'`) && !data.includes(`"${id}"`) && !new RegExp(`\\b${id}\\b`).test(data)) bad.push(`no kit ${id}`)
  }
  if (!readFileSync('lib/seo/frequency-pages.ts', 'utf8').includes('Nine looks')) bad.push('SEO copy still says Seven looks')
}
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('themes-kit-page: ok')
