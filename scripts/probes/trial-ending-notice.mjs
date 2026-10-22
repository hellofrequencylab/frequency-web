#!/usr/bin/env node
// LIVE-1132 probe: the Stripe webhook handles trial_will_end by emailing the Space owner, createSpace records the
// first-party space_created funnel row, and the Network door carries no product Offer.
import { readFileSync, existsSync } from 'node:fs'

const r = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const bad = []
if (!/case 'customer\.subscription\.trial_will_end'[\s\S]{0,400}notifyTrialEnding\(/.test(r('app/api/webhooks/stripe/route.ts'))) bad.push('the Stripe webhook no longer emails the owner on trial_will_end')
if (!/dedupeKey: `trial_will_end:/.test(r('lib/billing/trial-ending-notify.ts'))) bad.push('the trial notice is no longer deduped per subscription')
if (!/eventType: 'space_created'/.test(r('lib/spaces/provision.ts'))) bad.push('createSpace no longer records the space_created funnel row')
if (!/config\.slug === 'networks'/.test(r('app/for/[niche]/page.tsx'))) bad.push('the Network door can carry a Business price in its structured data')
if (bad.length) {
  console.error('LIVE-1132 probe failed:\n- ' + bad.join('\n- '))
  process.exit(1)
}
console.log('LIVE-1132: trial-ending notice, space_created funnel row, no Offer on the Network door')
