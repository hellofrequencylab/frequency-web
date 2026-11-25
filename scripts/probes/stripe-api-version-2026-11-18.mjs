#!/usr/bin/env node
// HYG-253: stripe 23.2.0 ships API version 2026-11-18.endive. The bump was split out of Dependabot
// #5464 so the Founding Year checkout (LIVE-2541) launches on the version it was tested on. Passes
// once the pin in lib/billing/stripe.ts and the installed SDK both sit at 2026-11-18.endive.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const want = '2026-11-18.endive'
const src = readFileSync('lib/billing/stripe.ts', 'utf8')
const m = /STRIPE_API_VERSION = '([^']+)'/.exec(src)
if (!m) {
  console.error('cannot find STRIPE_API_VERSION in lib/billing/stripe.ts')
  process.exit(1)
}
let sdk = 'not installed'
try {
  sdk = createRequire(import.meta.url)('stripe').API_VERSION
} catch {}
if (m[1] !== want || sdk !== want) {
  console.error(`pin ${m[1]} / installed SDK ${sdk}: want both at ${want}`)
  process.exit(1)
}
console.log(`Stripe API version pinned at ${want}, matching the installed SDK`)
