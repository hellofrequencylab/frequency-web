#!/usr/bin/env node
// LIVE-1190 probe: every tier, rank and status mark on people and Spaces is one TierChip. Fails when a
// Founder, Founding Business, Boosted or plan mark goes back to a hand-rolled pill, when the Menu and
// features index stops saying which plan a feature belongs to, or when the member directory card stops
// drawing the shared cluster.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const need = (file, re, why) => { if (!re.test(r(file))) bad.push(`${file}: ${why}`) }

need('lib/pricing/tier-marks.ts', /export const TIER_MARKS/, 'no one registry of tier marks')
need('components/pricing/tier-chip.tsx', /export function TierChip/, 'no shared TierChip')
need('lib/community-roles.tsx', /<TierChip tier="founder"/, 'Founder is not a TierChip')
need('lib/community-roles.tsx', /<TierChip tier="founding_business"/, 'Founding Business is not a TierChip')
need('components/crew/boosted-badge.tsx', /<TierChip tier="boosted"/, 'Boosted is not a TierChip')
need('components/frequency/members/spaces/spaces-body.tsx', /<BoostedBadge/, 'the Spaces directory draws its own Boosted tag')
need('components/frequency/site/pages/discover/spaces.tsx', /<BoostedBadge/, 'the public directory draws its own Boosted mark')
need('app/(main)/spaces/[slug]/manage/modules/module-manager.tsx', /<TierChip/, 'the Menu and features index shows no plan chip')
need('components/people/contact-card.tsx', /<MemberTierMarks/, 'the member directory card draws its own role tag')
need('app/(main)/people/[handle]/page.tsx', /<TierChip tier="crew"/, 'the profile header draws its own Crew text')
need('app/(main)/spaces/[slug]/settings/billing/plan-ladder-rungs.tsx', /<TierChip/, 'the plan ladder draws plain plan names')

if (bad.length) {
  console.error('TierChip probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('TierChip probe ok')
