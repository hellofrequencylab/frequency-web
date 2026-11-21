#!/usr/bin/env node
// Space booking audit 2026-11-21 (Calendly benchmark). One check per BOOK-* row: each passes only while
// the consequence named in that row's title holds. Usage: node scripts/probes/booking-audit.mjs BOOK-001
import fs from 'node:fs'

const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '')
const fail = (msg) => {
  console.error(msg)
  process.exit(1)
}


// The text of one top-level function in a file, from its declaration to the next top-level declaration.
const fnBody = (src, name) => {
  const i = src.search(new RegExp(`(?:async )?function ${name}\\(`))
  if (i < 0) return ''
  const rest = src.slice(i + 1)
  const j = rest.search(/\n(?:export )?(?:async )?function |\n\/\*\*\n|\n\/\/ ── /)
  return j < 0 ? src.slice(i) : src.slice(i, i + 1 + j)
}
const migrations = () =>
  fs
    .readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => read(`supabase/migrations/${f}`))
    .join('\n')
const grepTree = (dirs, re) => {
  const hits = []
  const walk = (d) => {
    if (!fs.existsSync(d)) return
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = `${d}/${e.name}`
      if (e.isDirectory()) walk(f)
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) && re.test(read(f))) hits.push(f)
    }
  }
  for (const d of dirs) walk(d)
  return hits
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
  // The Book button opens booking on a Space that has bookable services, whatever its Focus says.
  'BOOK-002': () => {
    const cta = read('components/widgets/entity/entity-cta.tsx') + read('lib/spaces/cta-kind.ts')
    if (!/listBookableServices|readPublicBookingSetup|hasBookableServices/.test(cta))
      fail('the Book button still follows the Focus alone, so a Space with services opens memberships')
  },
  // A signed-out visitor sees a booking Space's real open times and can book, not "No open times yet".
  'BOOK-003': () => {
    const m = read('components/spaces/booking-member.tsx')
    if (!/listPublicOpenSlots|guest=\{|Sign in to book/.test(m))
      fail('a signed-out visitor is still told the Space has posted no availability')
  },
  // The database refuses two live bookings whose times overlap, not only two at the same start.
  'BOOK-004': () => {
    if (!/space_bookings[\s\S]{0,400}exclude using gist/i.test(migrations()))
      fail('no exclusion constraint: two overlapping bookings with different starts can both land')
  },
  // A booking already in progress still blocks the slots its tail and buffer cover.
  'BOOK-005': () => {
    const f = fnBody(read('lib/spaces/booking.ts'), 'readBlockingBookings')
    if (!f) fail('readBlockingBookings is gone')
    if (/\.gte\('starts_at'/.test(f)) fail('blocking bookings are still read from starts_at >= now, so an in-progress booking blocks nothing')
  },
  // A paid booking follows the same slot rules as a free one and sends the same confirmation.
  'BOOK-006': () => {
    const b = read('lib/spaces/booking.ts')
    const hold = fnBody(b, 'holdSlotForBooking')
    if (!/validateAndPlaceBooking|buildSlotContext/.test(hold))
      fail('a paid hold still skips service length, buffers, days off, calendar blocks and the booking window')
    const market = read('app/(main)/(marketplace)/market/service-actions.ts')
    if (/cancelBooking\(hold\.bookingId\)/.test(market))
      fail('the Market door still "cancels" a failed hold with cancelBooking, which leaves a pending hold on the slot')
    if (!/notifyBookingConfirmed/.test(fnBody(b, 'confirmBookingByOrder')))
      fail('a settled paid booking still sends no booking confirmation or reminder')
  },
  // A website guest can cancel or reschedule from their own email.
  'BOOK-007': () => {
    if (!/cancelGuestBooking|guest_manage_token|manageGuestBooking/.test(read('lib/spaces/booking.ts')))
      fail('a guest booker still has no way to cancel or move their booking')
  },
  // Calendar invites update and cancel in the booker's calendar.
  'BOOK-008': () => {
    const n = read('lib/spaces/booking-notify.ts')
    for (const k of ['METHOD:CANCEL', 'SEQUENCE:', 'ORGANIZER', 'LOCATION'])
      if (!n.includes(k)) fail(`the booking .ics has no ${k}, so a cancelled or moved booking stays in the booker's calendar`)
  },
  // Emails state the time in the booker's own zone.
  'BOOK-009': () => {
    if (!/alter table public\.space_bookings[\s\S]{0,300}(booker_time_zone|invitee_time_zone)/i.test(migrations()))
      fail("the booker's zone is not stored, so every email states the Space's zone")
  },
  // A service says where it happens: an address, a phone call or a video link.
  'BOOK-010': () => {
    if (!/alter table public\.space_service_types[\s\S]{0,400}location/i.test(migrations()))
      fail('a service still has no location or meeting link')
  },
  // Bookings show on the Space calendar and reach a connected Google calendar.
  'BOOK-011': () => {
    if (grepTree(['lib/calendar', 'lib/calendar-sync'], /space_bookings/).length === 0)
      fail('the Space calendar and calendar sync never read bookings')
  },
  // The owner's booking list names the service and can mark a no-show.
  'BOOK-012': () => {
    const o = read('components/spaces/booking-owner-list.tsx')
    if (!/serviceName/.test(o)) fail("the owner's booking list does not say which service was booked")
    if (!/noShow|no_show|No-show/.test(o)) fail('the owner cannot mark a no-show')
  },
  // A link can open one service directly, and the picker leads with a calendar.
  'BOOK-013': () => {
    const page = read('app/(main)/spaces/[slug]/(profile)/book/page.tsx')
    if (!/searchParams/.test(page)) fail('no per-service booking link: /book ignores ?service=')
  },
  // Reminders name the service and never duplicate the confirmation.
  'BOOK-014': () => {
    const n = read('lib/spaces/booking-notify.ts')
    if (/serviceName: null/.test(n)) fail('reminders and guest mails still send serviceName: null')
    if (!/fireMs <= Date\.now\(\)|fireMs < Date\.now\(\)/.test(fnBody(n, 'scheduleBookingReminder')))
      fail('a booking inside 24 hours still gets an immediate reminder on top of its confirmation')
  },
  // A Space that runs out of monthly bookings hears about it the first time a booker is turned away.
  'BOOK-015': () => {
    const m = fnBody(read('lib/spaces/counted-meters.ts'), 'checkSpaceBookingMeter')
    if (!/notify|enqueue|routeNotification/.test(m)) fail('a full bookings meter turns bookers away and tells the owner nothing')
  },
  // Owners can set start-time steps and a daily cap.
  'BOOK-016': () => {
    if (!/(start_increment_minutes|max_bookings_per_day)/.test(migrations()))
      fail('no start-time increment or daily cap on a schedule')
  },
  // Moving a booking to an overlapping time is allowed.
  'BOOK-017': () => {
    const v = fnBody(read('lib/spaces/booking.ts'), 'validateAndPlaceBooking')
    if (!/\.id !== rescheduledFrom/.test(v))
      fail('a reschedule still conflicts with the booking it replaces')
  },
  // An owner can cancel a hold that is still waiting.
  'BOOK-018': () => {
    if (/if \(row\.status !== 'confirmed'\) return ok\(\)/.test(read('lib/spaces/booking.ts')))
      fail('cancelBooking reports success on a pending hold and changes nothing')
  },
  // A service can be booked with any of several team members.
  'BOOK-019': () => {
    if (!/(space_service_type_hosts|host_profile_id)/.test(migrations())) fail('a service has exactly one implicit host')
  },
  // A finished session triggers a follow-up: thank you, rebook, review.
  'BOOK-020': () => {
    if (!/booking_follow_up/.test(read('lib/spaces/booking-notify.ts') + read('lib/queue/outbox.ts')))
      fail('nothing happens after a session ends')
  },
  // Vera sets up and tunes a Space's hours from plain words.
  'BOOK-021': () => {
    if (grepTree(['lib/ai'], /setSpaceAvailability|setSpaceSchedule/).length === 0)
      fail('Vera cannot set or tune booking hours')
  },
  // Vera offers real open times inside a conversation and books from it.
  'BOOK-022': () => {
    if (grepTree(['lib/ai', 'lib/messages'], /listOpenSlots|listPublicOpenSlots|readOpenSlots/).length === 0)
      fail('Vera and messages cannot offer or book open times')
  },
}

const id = process.argv[2]
const check = CHECKS[id]
if (!check) fail(`unknown row ${id}`)
check()
process.exit(0)
