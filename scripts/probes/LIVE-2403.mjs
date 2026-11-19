#!/usr/bin/env node
// LIVE-2403: every pricing surface tells one story about Crew and a Space (owner 2026-11-19: "You can start a free
// space with a Crew account"; ADR-1818). The spine every surface reads says a Space comes with Crew, and no public
// copy says Crew is separate from hosting one.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const story = readFileSync('lib/pricing/plan-story.ts', 'utf8')
assert.ok(story.includes("lines: 'People join free. Host free with Crew. You pay when you start charging.'"), 'the three lines say host free with Crew')
assert.ok(story.includes('A Space comes with Crew, funded at whatever amount you choose.'), 'the Space line says it comes with Crew')
for (const f of ['lib/pricing/plan-story.ts', 'content/help/spaces/plans-and-pricing.md', 'app/(marketing)/pricing/pricing-faq.ts', 'app/llms-full.txt/route.ts', 'lib/marketing/funnel-config.ts', 'lib/pricing/pricing-grid.ts']) {
  const src = readFileSync(f, 'utf8')
  assert.ok(!/separate personal membership|A Space is separate from Crew|and a Space is separate/.test(src), `${f} still says Crew is separate from a Space`)
}
assert.ok(readFileSync('app/llms-full.txt/route.ts', 'utf8').includes('`${PLAN_STORY.lines} ${PLAN_STORY.ladder}'), 'llms-full reads the three lines, not a typed copy')
console.log('LIVE-2403: one story about Crew and a Space')
