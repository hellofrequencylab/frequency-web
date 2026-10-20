#!/usr/bin/env node
// LIVE-1022 (ADR-1840): every empty Feed section says so with a notice that points somewhere, and the
// Feed ends in a "Circles to explore" band instead of a bare stop.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const base = 'components/frequency/members/feed/'
if (!/export function SystemNotice/.test(r('components/frequency/members/shared/system-notice.tsx'))) bad.push('no shared SystemNotice')
for (const f of ['islands.tsx', 'planner.tsx', 'posts.tsx']) {
  if (!r(base + f).includes('<SystemNotice')) bad.push(`${f} does not draw a SystemNotice for its empty state`)
}
if (/All clear\. Nobody’s waiting on you\.<\/div>/.test(r(base + 'islands.tsx'))) bad.push('Needs you is back to a bare italic line')
if (!/Your people’s plans/.test(r(base + 'planner.tsx')) || !/None of your people have plans/.test(r(base + 'planner.tsx'))) bad.push('Your people’s plans vanishes when empty')
if (!/<ExploreSection/.test(r(base + 'feed-body.tsx'))) bad.push('the Feed draws no Circles to explore band')
if (!/loadCirclesToExplore/.test(r(base + 'explore.tsx'))) bad.push('the explore band reads no real Circles')
if (bad.length) {
  console.error('LIVE-1022: ' + bad.join('; '))
  process.exit(1)
}
