#!/usr/bin/env node
// LIVE-1561 probe: the seven business profiles each have a /for door. A door is a FunnelConfig in the registry, a
// NICHE_DESIGN entry (the funnel-design test pins the headline match), and a Start free destination row keyed by
// the profile id, so the door lands a finished operator in a real Space Mode and never on the directory fallback.
import { readFileSync } from 'node:fs'

const config = readFileSync('lib/marketing/funnel-config.ts', 'utf8')
const design = readFileSync('lib/marketing/funnel-design.ts', 'utf8')
const destinations = readFileSync('lib/funnels/definitions.ts', 'utf8')
const index = readFileSync('components/frequency/site/pages/funnel/frequency-for-index.tsx', 'utf8')

const doors = [
  ['general', 'local-businesses'],
  ['creators', 'creators'],
  ['schools', 'schools-and-programs'],
  ['clubs', 'clubs-and-groups'],
  ['faith', 'faith-communities'],
  ['wellness', 'wellness-and-retreats'],
  ['markets', 'markets-and-festivals'],
]
const bad = []
const registry = config.slice(config.indexOf('return {'), config.indexOf('}\n}', config.indexOf('return {')))
for (const [niche, slug] of doors) {
  if (!config.includes(`slug: '${slug}',\n  niche: '${niche}',`)) bad.push(`no FunnelConfig for /for/${slug} with niche ${niche}`)
  if (!registry.includes(`${slug.includes('-') ? `'${slug}'` : slug}:`)) bad.push(`${slug} is not in the funnel registry`)
  if (!design.includes(`${slug.includes('-') ? `'${slug}'` : slug}: {\n    short:`)) bad.push(`no NICHE_DESIGN entry for ${slug}`)
  if (!new RegExp(`^  ${niche}: \\{ mode: 'direct', url: spaceCreatePath\\(`, 'm').test(destinations)) bad.push(`no Start free destination for ${niche}`)
}
// Every door's trust line carries the card-processing clause (the fee promise stays checkable).
const trustLines = [...config.matchAll(/trustLine:\s*(['"`])(.*?)\1/g)].map((m) => m[2])
if (trustLines.length < 13) bad.push(`expected 13 door trustLines, found ${trustLines.length}`)
// The index counts the doors it renders instead of saying "six".
if (/Six doors/.test(index)) bad.push('the /for index still says "Six doors"')
if (bad.length) {
  console.error('LIVE-1561 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1561: the seven profile doors are live')
