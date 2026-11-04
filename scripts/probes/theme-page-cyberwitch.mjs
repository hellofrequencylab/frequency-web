#!/usr/bin/env node
// LIVE-2111: /themes/cyberwitch runs on Nocturne's layout (the feature template /themes/bold, /themes/wildheart and /themes/services
// use) with a real render of every surface, its own copy, and stays out of search while CyberWitch is not offered. Fails on main (no page: 404).
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const page = read('app/(marketing)/themes/cyberwitch/page.tsx')
if (!page.includes('<FrequencyThemeFeature theme="cyberwitch"')) bad.push('app/(marketing)/themes/cyberwitch/page.tsx does not draw FrequencyThemeFeature for cyberwitch')
if (!/robots:\s*\{\s*index:\s*false/.test(page)) bad.push('/themes/cyberwitch is indexable while CyberWitch is not offered')
if (!/cyberwitch:\s*\{\s*id: 'cyberwitch'/.test(read('lib/themes/theme-feature-data.ts'))) bad.push('lib/themes/theme-feature-data.ts has no CyberWitch copy')
if (!read('app/(marketing)/themes/[theme]/page.tsx').includes("id !== 'cyberwitch'")) bad.push('/themes/[theme] still generates cyberwitch')
for (const f of ['site', 'spot', 'spacedesk', 'email']) {
  if (!existsSync(`public/brand/theme-pages/cyberwitch/${f}.jpg`)) bad.push(`public/brand/theme-pages/cyberwitch/${f}.jpg is missing`)
}
if (!read('components/frequency/site/pages/themes/frequency-theme-feature.tsx').includes('CYBERWITCH_KIT_INDEX')) bad.push('the Starter kits section does not list the CyberWitch kits')
if (bad.length) {
  console.error(bad.join('\n'))
  process.exit(1)
}
console.log('theme-page-cyberwitch: ok')
