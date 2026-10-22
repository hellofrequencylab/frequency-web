#!/usr/bin/env node
// LIVE-1139 probe: the door copy states the Crew requirement from the one pricing line, not a hand-typed copy.
import { readFileSync } from 'node:fs'

const s = readFileSync('lib/marketing/funnel-config.ts', 'utf8')
const bad = []
if (!/PLAN_STORY\.crewSpace/.test(s)) bad.push('door copy no longer uses PLAN_STORY.crewSpace')
if (/microcopy: 'No card\. You pay when you start charging\.'/.test(s)) bad.push('a door still says "No card. You pay when you start charging." with no Crew line')
if (bad.length) {
  console.error('LIVE-1139 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1139: doors state that a Space comes with Crew')
