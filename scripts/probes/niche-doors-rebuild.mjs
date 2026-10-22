#!/usr/bin/env node
// LIVE-1133 probe: the six doors render from the kit niche components, /for is a marketing-group page with the
// standard chrome, and the marketing-kit gate is wired.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!/NicheDoor/.test(r('app/for/[niche]/page.tsx'))) bad.push('the door page no longer renders NicheDoor')
if (!existsSync('components/frequency/site/pages/funnel/niche/niche-door.tsx')) bad.push('the niche door component is gone')
if (!/FrequencyForIndex/.test(r('app/(marketing)/for/page.tsx'))) bad.push('/for is no longer the kit index inside the (marketing) group')
if (existsSync('app/for/page.tsx')) bad.push('app/for/page.tsx would put the /for index back in the chrome-free layout')
if (!/marketing-kit/.test(r('.github/workflows/ci.yml'))) bad.push('check:marketing-kit is not in the CI guard list')
if (bad.length) {
  console.error('LIVE-1133 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1133: six rebuilt doors, kit /for index with standard chrome, marketing-kit gate wired')
