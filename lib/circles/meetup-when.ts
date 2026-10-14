import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// The short meetup time the member kit prints ("Fri 6:15am", templates/members/Circles.html and
// Circle.html). events.starts_at stores the host's wall clock as UTC parts, so the parts are read in
// UTC; "today" is the community's HOME zone (America/Los_Angeles). Deterministic for a given `now`,
// so a server render and a test agree.
//
//   today             Today 6:15am
//   tomorrow          Tomorrow 6:15am
//   within the week   Fri 6:15am
//   further out       Oct 24 · 6:15am  (a bare weekday would read as this week)

const DAY_MS = 24 * 60 * 60 * 1000

export function meetupWhen(iso: string, now: Date): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const time = d
    .toLocaleTimeString('en-US', d.getUTCMinutes() === 0 ? { hour: 'numeric', timeZone: 'UTC' } : { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .replace(/\s/g, '')
    .toLowerCase()
  const days = Math.round(
    (Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${dayInZone(now, HOME_TZ)}T00:00:00Z`)) / DAY_MS,
  )
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Tomorrow ${time}`
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })} · ${time}`
}
