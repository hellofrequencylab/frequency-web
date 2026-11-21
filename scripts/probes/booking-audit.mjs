#!/usr/bin/env node
// Space booking audit 2026-11-21 (Calendly benchmark). One check per BOOK-* row: each passes only while
// the consequence named in that row's title holds. Usage: node scripts/probes/booking-audit.mjs BOOK-001
import fs from 'node:fs'

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}

const CHECKS = {
  // A Space whose saved zone is typed text still offers its open times, and the setting is a menu.
  'BOOK-001': () => {
    // The consequence first: the zones owners actually typed are not zones the runtime can read.
    for (const typed of ['Pacific', 'Los Angeles', 'Los Angelas']) {
      let throws = false
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: typed })
      } catch {
        throws = true
      }
      if (!throws) fail(`premise changed: "${typed}" now resolves; re-test BOOK-001`)
    }
    const b = read('lib/spaces/booking.ts')
    if (!/export function resolveBookingZone\(/.test(b)) fail('resolveBookingZone is gone')
    if ((b.match(/return repairWindowZones\(spaceId, mapMany\(/g) ?? []).length < 2)
      fail('readWindows no longer repairs an unreadable zone on both reads')
    if (!/isValidTimeZone\(r\.timezone\.trim\(\)\)/.test(b)) fail('readSchedule trusts an unreadable zone again')
    if ((b.match(/Pick your time zone from the list/g) ?? []).length < 2)
      fail('a save path accepts an unreadable zone again')
    const form = read('components/spaces/booking-availability-form.tsx')
    if (/<Input\s+id="booking-timezone"/.test(form) || !/<Select\s+id="booking-timezone"/.test(form))
      fail('the booking timezone is a free-text box again')
    const section = read('app/(main)/spaces/[slug]/settings/availability/section.tsx')
    if (/\?\? 'UTC'/.test(section)) fail('the availability editor seeds UTC again')
    const notify = read('lib/spaces/booking-notify.ts')
    if (!/usableZone\(tz\.trim\(\)\)/.test(notify)) fail('booking emails print an unreadable zone again')
  },
}

const id = process.argv[2]
const check = CHECKS[id]
if (!check) fail(`unknown row ${id}`)
check()
process.exit(0)
