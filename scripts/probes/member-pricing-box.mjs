#!/usr/bin/env node
// LIVE-1303 probe: the member area has ONE pricing box. Fails when an old per-allowance or plan-ladder box
// comes back, when /offer, Space billing or /upgrade stop mounting the box, or when a price or an allowance is
// typed into the box instead of read from the catalog.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
const need = (file, re, why) => { if (!re.test(r(file))) bad.push(`${file}: ${why}`) }
const gone = (file) => { if (existsSync(file)) bad.push(`${file}: the old box is back`) }

const billing = 'app/(main)/spaces/[slug]/settings/billing'
for (const f of [
  'components/pricing/feature-meter-range.tsx',
  'components/pricing/feature-tier-range.tsx',
  'components/pricing/feature-meter-upsell.tsx',
  'components/pricing/feature-tier-upsell.tsx',
  `${billing}/plan-ladder.tsx`,
  `${billing}/plan-ladder-rungs.tsx`,
  `${billing}/go-business.tsx`,
  `${billing}/choose-plan.tsx`,
  'app/(main)/upgrade/pwyw-picker.tsx',
]) gone(f)

need(`${billing}/billing-body.tsx`, /<MemberPricingBox/, 'Space billing (and /offer, which renders it) does not mount the pricing box')
need('app/(main)/upgrade/page.tsx', /<MemberPricingBox/, '/upgrade does not mount the pricing box')
need('app/(main)/offer/page.tsx', /<BillingBody/, '/offer no longer renders the billing body that carries the box')
need('components/pricing/member-pricing-box.tsx', /startSpaceLoadoutCheckout/, 'the box lost the Space plan checkout')
need('components/pricing/member-pricing-box.tsx', /startMembershipCheckout/, 'the box lost the Crew checkout')
need('components/pricing/member-pricing-box.tsx', /<CheckoutPanel/, 'the box lost the on-page checkout panel')

// Nothing typed: a dollar figure or a plan limit in the box means it stopped reading the catalog.
const box = r('components/pricing/member-pricing-box.tsx').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
if (/['"`][^'"`\n]*\$\d/.test(box)) bad.push('components/pricing/member-pricing-box.tsx: a dollar price is typed, read it from the catalog')

if (bad.length) {
  console.error('Member pricing box probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('Member pricing box probe ok')
