#!/usr/bin/env node
// LIVE-2445: every fee line a reader sees states the new rules (ADR-1978). Before this the pricing page, the
// grid, the FAQ, the niche doors, the templates, the in-app lines, the answer-engine routes and the help center
// said tips were open on every plan, quoted a network fee ladder by plan with no cap, and promised a free Space
// tips. The consequence: no reader-facing source still says those things, and the shared spine states the
// finder's fee, its cap, and that a free Space sells nothing.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n')
const walk = (p, out = []) => {
  if (!existsSync(p)) return out
  if (statSync(p).isFile()) return /\.(tsx?|md)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [...out, p] : out
  for (const e of readdirSync(p, { withFileTypes: true })) walk(join(p, e.name), out)
  return out
}
const ROOTS = ['app/(marketing)', 'app/(brief)', 'app/llms.txt', 'app/llms-full.txt', 'lib/marketing', 'lib/page-editor/templates', 'lib/pricing/plan-story.ts', 'lib/pricing/pricing-grid.ts', 'lib/pricing/pricing-page.ts', 'lib/pricing/pricing-addons.ts', 'lib/pricing/member-pricing.ts', 'lib/pricing/payments-copy.ts', 'components/frequency/site/pages', 'components/pricing']
const RETIRED = [/tips (are|stay) open on every (plan|tier)/i, /tips work on every plan/i, /tips have no platform fee on any plan, though[^.]*\. Selling options and fees depend/i, /\bnetwork fee\b/i, /introduction fees? (apply|are separate)/i, /take tips from day one/i, /a free Space takes tips/i, /once per customer the network introduces\b(?![^.]*never more than)/i]
const offenders = []
for (const f of ROOTS.flatMap((r) => walk(r))) {
  const text = f.endsWith('.md') ? read(f) : strip(read(f))
  for (const re of RETIRED) if (re.test(text)) offenders.push(`${f}: ${re}`)
}
assert.deepEqual(offenders, [], `retired fee copy is still published:\n${offenders.join('\n')}`)
const spine = read('lib/pricing/plan-story.ts')
assert.ok(spine.includes('A free Space sells nothing') && spine.includes('one finder’s fee, charged once on their first purchase and capped'), 'the plan story does not state the finder’s fee and the free Space rule')
assert.ok(/function findersFeePhrase\(bps: number, capCents: number\)[\s\S]*?never more than \$\{formatCents\(capCents\)\}/.test(read('lib/pricing/pricing-grid.ts')), 'the pricing grid does not state the cap beside the rate')
console.log('LIVE-2445: every reader-facing fee line states the finder’s fee, its cap, and the paying-account rule')
