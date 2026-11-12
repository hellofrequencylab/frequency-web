#!/usr/bin/env node
// LIVE-2264: the three beta intake phases live on the one launch date contract (Owner, 2026-11-11).
// Early Beta closes intake Nov 30, Hosts Beta Dec 31, Public Beta on the one beta end (Jan 31, 2027).
// Reads the source rather than spawning a test runner (a probe must not, LIVE-034).
import { readFileSync } from 'node:fs'
const src = readFileSync('lib/core/launch-dates.ts', 'utf8')
const bad = []
if (!/export const BETA_PHASES\s*=\s*\[/.test(src)) bad.push('BETA_PHASES is not exported')
for (const [id, endsOn] of [['early', "'2026-11-30'"], ['hosts', "'2026-12-31'"], ['public', 'BETA_ENDS_ON']]) {
  if (!new RegExp(`id: '${id}'[^}]*endsOn: ${endsOn}`).test(src)) bad.push(`phase ${id} does not end on ${endsOn}`)
}
if (!/export function betaPhaseOn\(/.test(src)) bad.push('betaPhaseOn is not exported')
if (!/BETA_ENDS_ON\s*=\s*'2027-01-31'/.test(src)) bad.push("BETA_ENDS_ON is not '2027-01-31'")
if (bad.length) { console.error(bad.join('\n')); process.exit(1) }
console.log('three beta phases on the one launch date contract')
