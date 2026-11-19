#!/usr/bin/env node
// The free plan's monthly bookings allowance is one number everywhere (owner ruling 2026-11-18: 15).
// The limit the meter enforces and the note the Manage card shows must agree. Exit 1 while they differ.
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const fails = []
const limit = read('lib/pricing/meter-limits.ts').match(/space_bookings:\s*\{\s*free:\s*(\d+)/)?.[1]
const note = read('lib/admin/modules/space-modules.ts').match(/(\d+) bookings\/mo free/)?.[1]
if (limit !== '15') fails.push(`the meter allows ${limit ?? 'an unknown number of'} free bookings a month, not 15 (lib/pricing/meter-limits.ts)`)
if (note !== '15') fails.push(`the Booking card promises ${note ?? 'no'} free bookings a month, not 15 (lib/admin/modules/space-modules.ts)`)
if (fails.length) {
  console.log(`FAIL LIVE-2390\n- ${fails.join('\n- ')}`)
  process.exit(1)
}
console.log('PASS LIVE-2390')
