#!/usr/bin/env node
// HYG-220: the Stripe API version is a billing decision (ADR-1936). The pin in lib/billing/stripe.ts
// moves to 2026-10-28.endive together with stripe 23.1.0, and must keep matching the installed SDK.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const src = readFileSync('lib/billing/stripe.ts', 'utf8')
const m = /STRIPE_API_VERSION = '([^']+)'/.exec(src)
if (!m) {
  console.error('cannot find STRIPE_API_VERSION in lib/billing/stripe.ts')
  process.exit(1)
}
const sdk = createRequire(import.meta.url)('stripe').API_VERSION
if (m[1] !== '2026-10-28.endive' || sdk !== m[1]) {
  console.error(`pin ${m[1]} / installed SDK ${sdk}: want both at 2026-10-28.endive`)
  process.exit(1)
}
console.log(`Stripe API version pinned at ${m[1]}, matching the installed SDK`)
