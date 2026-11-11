#!/usr/bin/env node
// LIVE-2258: the free beta ends January 31, 2027 everywhere the site says it (Owner, 2026-11-11).
// Fails when the one source of the date, or the help pages that name it, drift back to December 31.
import { readFileSync } from 'node:fs'
const src = readFileSync('lib/core/launch-dates.ts', 'utf8')
const bad = []
if (!/BETA_ENDS_ON\s*=\s*'2027-01-31'/.test(src)) bad.push("lib/core/launch-dates.ts: BETA_ENDS_ON is not '2027-01-31'")
if (!/BETA_ENDS_DAY_LABEL\s*=\s*'January 31'/.test(src)) bad.push("lib/core/launch-dates.ts: BETA_ENDS_DAY_LABEL is not 'January 31'")
for (const f of ['content/help/spaces/beta-pricing.md', 'content/help/spaces/collective.md', 'content/help/spaces/plans-and-pricing.md']) {
  if (/December 31/.test(readFileSync(f, 'utf8'))) bad.push(`${f} still says December 31`)
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('beta ends January 31, 2027 in code and help')
