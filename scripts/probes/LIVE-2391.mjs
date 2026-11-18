#!/usr/bin/env node
// The help center reads in order and every guide opens the product it describes.
// Fails while: two guides in a topic share an `order`, two topics share one, a guide page offers no
// "Open in Frequency" doors, or the reading column still lays lists out as flex (which drops every
// bullet and step number).
import { readFileSync, readdirSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')
const fails = []

const topics = readdirSync(new URL('content/help/', root), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const topicOrders = new Map()
for (const t of topics) {
  const meta = JSON.parse(read(`content/help/${t}/_category.json`))
  if (topicOrders.has(meta.order)) fails.push(`topics ${topicOrders.get(meta.order)} and ${t} share order ${meta.order}`)
  topicOrders.set(meta.order, t)
  const seen = new Map()
  for (const f of readdirSync(new URL(`content/help/${t}/`, root)).filter((n) => n.endsWith('.md'))) {
    const order = read(`content/help/${t}/${f}`).match(/^order:\s*(\d+)/m)?.[1]
    if (!order) fails.push(`${t}/${f} has no order`)
    else if (seen.has(order)) fails.push(`${t}: ${seen.get(order)} and ${f} share order ${order}`)
    else seen.set(order, f)
  }
}

const pages = read('components/frequency/site/pages/help/frequency-help-pages.tsx')
if (!/helpSiteLinks\(featureKeys\)/.test(pages)) fails.push('a guide page does not offer its "Open in Frequency" doors (lib/help/site-links.ts)')
if (!/Hosting and running a Space/.test(pages)) fails.push('the help index does not separate member topics from hosting topics')

const css = read('app/themes/frequency/site-pages-b.css')
if (!/\.hc-body \.hp-prose ul,[^{]*\.hc-body \.hp-prose ol\{display:block/.test(css)) fails.push('lists in the reading column are still flex columns, so bullets and step numbers do not show')

if (fails.length) {
  console.log(`FAIL LIVE-2391\n- ${fails.slice(0, 12).join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2391')
