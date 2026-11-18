#!/usr/bin/env node
// SCAN-1268: two SEO leaks from the 2026-11-18 SEO/GEO scan.
//   1. The retired /sites/<slug>[/<page>] URLs forward to /spaces/<slug> with a PERMANENT redirect
//      (308), so an indexed /sites URL hands its signals to the Space page instead of lingering.
//   2. A podcast Show page whose Space exists but whose show does not returns noindex metadata,
//      like the missing-Space branch beside it.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const fails = []
for (const p of ['app/sites/[slug]/page.tsx', 'app/sites/[slug]/[page]/page.tsx']) {
  const src = read(p)
  if (!/permanentRedirect\(`\/spaces\//.test(src)) fails.push(`${p} does not permanentRedirect to /spaces`)
  if (/(^|[^A-Za-z])redirect\(`/m.test(src)) fails.push(`${p} still uses a temporary redirect`)
}
const show = read('app/(public)/spaces/[slug]/podcasts/[showSlug]/page.tsx')
const notFoundHeads = [...show.matchAll(/return \{ title: 'Show not found'[^}]*\}[^}]*\}/g)].map((m) => m[0])
if (notFoundHeads.length < 2) fails.push(`expected two Show-not-found heads, found ${notFoundHeads.length}`)
for (const h of notFoundHeads) if (!/robots: \{ index: false, follow: false \}/.test(h)) fails.push(`not-found head without noindex: ${h}`)

if (fails.length) {
  console.error(`SCAN-1268 FAIL\n - ${fails.join('\n - ')}`)
  process.exit(1)
}
console.log('SCAN-1268 ok: /sites forwards permanently and a missing Show is noindex')
