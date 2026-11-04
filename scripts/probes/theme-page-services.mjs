#!/usr/bin/env node
// LIVE-2130: /themes/services runs on Nocturne's layout (the feature template /themes/bold and /themes/wildheart use) with a real
// render of every surface, its own copy, and is indexed now that Services is offered (LIVE-1996). Fails on main (no page: 404).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const page = read('app/(marketing)/themes/services/page.tsx')
if (!page.includes('<FrequencyThemeFeature theme="services"')) bad.push('app/(marketing)/themes/services/page.tsx does not draw FrequencyThemeFeature for services')
if (/robots:\s*\{\s*index:\s*false/.test(page)) bad.push('/themes/services is noindex although Services is offered in the pickers (LIVE-1996)')
const data = read('lib/themes/theme-feature-data.ts')
if (!/services:\s*\{\s*id: 'services'/.test(data)) bad.push('lib/themes/theme-feature-data.ts has no Services copy')
if (!read('app/(marketing)/themes/[theme]/page.tsx').includes("id !== 'services'")) bad.push('/themes/[theme] still generates services')
for (const f of ['site', 'spot', 'spacedesk', 'email']) {
  if (!existsSync(`public/brand/theme-pages/services/${f}.jpg`)) bad.push(`public/brand/theme-pages/services/${f}.jpg is missing`)
}
if (!read('components/frequency/site/pages/themes/frequency-theme-feature.tsx').includes('SERVICES_KIT_INDEX')) bad.push('the Starter kits section does not list the Services trade kits')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-page-services: ok')
