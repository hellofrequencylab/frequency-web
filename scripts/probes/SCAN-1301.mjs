#!/usr/bin/env node
// SCAN-1301: a page's share address (og:url) is its canonical, and no two help pages share a title.
// Production crawl 2026-11-19: /discover/journeys/<slug> named itself as og:url while its canonical
// was /courses/<slug>, and /help/membership/the-vault had the same title as its category page.
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (f) => readFileSync(new URL(f, root), 'utf8')
const fails = []
const journey = read('app/discover/journeys/[slug]/page.tsx')
if (!/openGraph: \{[\s\S]{0,200}url: canonical,/.test(journey)) fails.push('/discover/journeys/<slug> og:url is not its canonical')

const titles = new Map()
const help = new URL('content/help/', root)
for (const cat of readdirSync(help, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const catFile = new URL(`content/help/${cat.name}/_category.json`, root)
  if (existsSync(catFile)) titles.set(JSON.parse(readFileSync(catFile, 'utf8')).title, [`/help/${cat.name}`])
}
for (const cat of readdirSync(help, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const f of readdirSync(new URL(`content/help/${cat.name}/`, root)).filter((n) => n.endsWith('.md'))) {
    const m = /^title:\s*(.+)$/m.exec(read(`content/help/${cat.name}/${f}`))
    if (!m) continue
    const t = m[1].trim().replace(/^['"]|['"]$/g, '')
    const at = `/help/${cat.name}/${f.replace(/\.md$/, '')}`
    titles.set(t, [...(titles.get(t) ?? []), at])
  }
}
for (const [t, pages] of titles) if (pages.length > 1) fails.push(`help title "${t}" is shared by ${pages.join(', ')}`)
if (fails.length) {
  console.error(`SCAN-1301 FAIL:\n  ${fails.join('\n  ')}`)
  process.exit(1)
}
console.log(`SCAN-1301 ok: journey og:url is its canonical; ${titles.size} help titles are all distinct`)
