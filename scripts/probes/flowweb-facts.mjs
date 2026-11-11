#!/usr/bin/env node
// LIVE-2259: FlowWeb's draft gate reads the beta end, launch day, plan prices and launcher minutes from
// Frequency, so an email can never quote a date or price the site does not show.
//
// Fails when the sheet's beta end or launch day differ from lib/core/launch-dates.ts, when a plan price is not
// the catalog's dollars, when launcher_minutes is not the clock budget, or when the route is missing, is not a
// signed GET, or does not refuse before reading prices.
// Run: node --experimental-strip-types --no-warnings --import ./scripts/probe-ts.mjs scripts/probes/flowweb-facts.mjs
import { existsSync, readFileSync } from 'node:fs'

const { buildFacts } = await import('../../lib/flowweb/facts.ts')
const { PRICING_DEFAULTS } = await import('../../lib/pricing/defaults.ts')
const { FOUNDING_MEMBER_COPY, LAUNCH_ON } = await import('../../lib/core/launch-dates.ts')
const { CLOCK_BUDGET_MS } = await import('../../lib/launch/clock.ts')

const bad = []
const now = new Date('2026-11-11T12:00:00Z')
const f = buildFacts(PRICING_DEFAULTS, now)
if (f.beta_ends !== FOUNDING_MEMBER_COPY.endsOn) bad.push(`beta_ends ${f.beta_ends} is not ${FOUNDING_MEMBER_COPY.endsOn}`)
if (f.beta_ends !== '2027-01-31') bad.push(`beta_ends ${f.beta_ends} is not 2027-01-31`)
if (f.launch_on !== LAUNCH_ON) bad.push(`launch_on ${f.launch_on} is not ${LAUNCH_ON}`)
if (f.launcher_minutes !== CLOCK_BUDGET_MS / 60000) bad.push(`launcher_minutes ${f.launcher_minutes} is not the clock budget`)
if (f.as_of !== now.toISOString()) bad.push('as_of is not the request time')
const biz = PRICING_DEFAULTS.plan.business
if (f.prices.business_monthly !== biz.monthly_cents / 100) bad.push(`business_monthly ${f.prices.business_monthly} is not ${biz.monthly_cents / 100}`)
if (biz.list_cents && f.prices.business_list !== biz.list_cents / 100) bad.push('business_list is not the catalog anchor')
if (f.prices.crew_monthly !== PRICING_DEFAULTS.tier.crew.monthly_cents / 100) bad.push('crew_monthly is not the Crew price')
for (const [k, v] of Object.entries(f.prices)) if (typeof v !== 'number' || !Number.isFinite(v)) bad.push(`price ${k} is not a number`)
const operator = structuredClone(PRICING_DEFAULTS)
operator.plan.business.monthly_cents = 2400
if (buildFacts(operator, now).prices.business_monthly !== 24) bad.push('an /admin/pricing override does not reach the sheet')
if (JSON.stringify(f).match(/bps|take_rate|secret/)) bad.push('the sheet carries more than prices and dates')

const route = 'app/api/webhooks/flowweb-facts/route.ts'
if (!existsSync(route)) bad.push(`${route} is missing`)
else {
  const s = readFileSync(route, 'utf8')
  if (!/export async function GET/.test(s)) bad.push('the facts route is not a GET')
  if (!/verifySignature\(secret, ts, '', sig\)/.test(s)) bad.push('the facts route does not check the signature over an empty body')
  if (s.indexOf('verifySignature(') > s.indexOf('getPricingValues()')) bad.push('the route reads prices before it checks the signature')
  if (!/status: 500/.test(s)) bad.push('a failed read does not answer 500')
}

if (bad.length) { console.error('flowweb-facts:\n  ' + bad.join('\n  ')); process.exit(1) }
console.log(`flowweb-facts: beta ${f.beta_ends}, launch ${f.launch_on}, ${Object.keys(f.prices).length} prices, ${f.launcher_minutes} min`)
