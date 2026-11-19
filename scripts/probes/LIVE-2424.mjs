#!/usr/bin/env node
// LIVE-2424: only a paying account takes money (ADR-1978 item 4). Before this a tip reached any member with a
// payout account, whatever they paid, and a donation needed a Space on Business even when its owner paid for Crew.
// The consequence: a free member is refused a tip, and a free Space takes a donation only when its owner pays for Crew.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const rule = read('lib/pricing/paying-accounts.ts')
assert.ok(/export async function profilePaysForCrew[\s\S]*?select\('membership_tier'\)[\s\S]*?isPaid\(billedTier\(/.test(rule), 'paying for Crew is not read from the billed column')
assert.ok(!/resolveCaller|resolveEffectiveTier|featureGatesLive/.test(rule.replace(/^\s*\/\/.*$/gm, '')), 'the rule reads the caller grant, a granted Crew or the grace window')
assert.ok(/BETA_OPEN_ACCESS && now\.getTime\(\) <= BETA_CREW_PAYS_UNTIL\.getTime\(\)/.test(rule) && rule.includes('`${BETA_ENDS_ON}T23:59:59-08:00`'), 'the beta exception has no end date of its own')
assert.ok(/export async function profileCanTakeTips[\s\S]*?profilePaysForCrew\([\s\S]*?spacePaymentsVerdict\(/.test(rule), 'tips are not held to a paying Crew member or the owner of a paying Space')
assert.ok(/export async function spaceMayTakeDonations[\s\S]*?spacePaymentsVerdict\([\s\S]*?profilePaysForCrew\(/.test(rule), 'donations are not held to a paying plan or a paying Crew owner')
const tips = read('lib/billing/tips.ts')
const refuse = tips.indexOf('await profileCanTakeTips(opts.toProfileId)')
assert.ok(refuse > 0 && refuse < tips.indexOf('stripe.checkout.sessions.create('), 'a tip checkout opens before the paying-account check')
const donate = read('lib/billing/space-donation-checkout.ts')
assert.equal((donate.match(/await spaceMayTakeDonations\(/g) ?? []).length, 2, 'the donation checkout and its button do not both ask the paying-account rule')
assert.ok(read('lib/spotlight/data.ts').includes('profileCanTakeTips(profileId)'), 'the Spotlight tip jar shows for an account that pays nothing')
assert.ok(read('app/(main)/people/[handle]/page.tsx').includes('await profileCanTakeTips(profileId)'), 'the profile tip button shows for an account that pays nothing')
assert.ok(!/receive tips|send you tips/.test(read('lib/pricing/payments-copy.ts')), 'the upgrade copy still promises tips to a free Space')
console.log('LIVE-2424: tips and donations are held to paying accounts')
