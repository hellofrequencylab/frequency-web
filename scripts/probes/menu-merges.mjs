#!/usr/bin/env node
// LIVE-2103 probe: /vision, /the-lab, /system and /networks are merged into their survivors.
// Each old route is gone, each answers with a permanent redirect to its survivor, the sitemap no
// longer lists it, and the Lab's dated plan and short answers live on the About page.
import { existsSync, readFileSync } from 'node:fs'

const bad = []
const config = readFileSync('next.config.ts', 'utf8')
const sitemap = readFileSync('app/sitemap.ts', 'utf8')
const about = readFileSync('lib/page-editor/templates/about.ts', 'utf8')

const MERGES = [
  ['/vision', '/about'],
  ['/the-lab', '/about'],
  ['/networks', '/for/networks'],
  ['/system', '/features'],
]
for (const [from, to] of MERGES) {
  const rule = new RegExp(`source: '${from}', destination: '${to}', permanent: true`)
  if (!rule.test(config)) bad.push(`${from} has no permanent redirect to ${to}`)
  if (sitemap.includes(`\${SITE_URL}${from}\``)) bad.push(`the sitemap still lists ${from}`)
}
for (const dir of ['vision', 'system', 'networks']) {
  if (existsSync(`app/(marketing)/${dir}/page.tsx`)) bad.push(`app/(marketing)/${dir} still renders a page`)
}
if (!about.includes("id: 'ab-lab'")) bad.push('the About page has no Lab timeline block')
for (const q of ['What is The Lab?', 'When will The Lab open?']) {
  if (!about.includes(q)) bad.push(`the About FAQ is missing "${q}"`)
}

if (bad.length) {
  for (const m of bad) console.error(`LIVE-2103: ${m}`)
  process.exit(1)
}
console.log('LIVE-2103: /vision, /the-lab, /system and /networks merged into their survivors')
