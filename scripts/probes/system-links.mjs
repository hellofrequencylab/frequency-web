#!/usr/bin/env node
// LIVE-1600 probe: Features, Pricing and the door pages each carry an onward link to the whole offer.
// /system merged into /features (LIVE-2103, owner-approved pin 2026-11-03), so the link is to Features or
// Pricing now, and none of the three may still point at the retired /system.
import { readFileSync } from 'node:fs'

const sources = [
  'components/frequency/site/pages/features/frequency-features.tsx',
  'components/frequency/site/pages/pricing/plan-motion.tsx',
  'components/frequency/site/pages/funnel/niche/niche-door.tsx',
]
const missing = sources.filter((f) => {
  const src = readFileSync(f, 'utf8')
  return /\.system\b|'\/system'/.test(src) || !/\.(features|pricing)\b/.test(src)
})
if (missing.length) {
  console.error(`No onward link to Features or Pricing (or a stale /system link) in: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('Features, Pricing and the door pages all link onward to Features or Pricing.')
