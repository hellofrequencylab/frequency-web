#!/usr/bin/env node
// LIVE-1600 probe: /system is linked from Features, Pricing and the door pages, not only the footer.
import { readFileSync } from 'node:fs'

const sources = [
  'components/frequency/site/pages/features/frequency-features.tsx',
  'components/frequency/site/pages/pricing/plan-motion.tsx',
  'components/frequency/site/pages/funnel/niche/niche-door.tsx',
]
const missing = sources.filter((f) => !/\.system\b/.test(readFileSync(f, 'utf8')))
if (missing.length) {
  console.error(`No link to /system in: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('Features, Pricing and the door pages all link to /system.')
