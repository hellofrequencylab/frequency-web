// PURE: how a course's Run reads in words, shared by the course page and the Week 1 email.
// Event timestamps hold the host's wall clock (lib/events/end-time.ts), so every format here reads in UTC.
import type { RunSession } from './course-context'

const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
const shortFmt = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })

/** " PT", " ET": the zone's short generic name, read from the event's own IANA zone. */
function zoneLabel(tz: string | null): string {
  if (!tz) return ''
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortGeneric' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')
    return part ? ` ${part.value}` : ''
  } catch {
    return ''
  }
}

/** "Thursday, January 7". */
export function sessionDay(s: Pick<RunSession, 'startsAt'>): string {
  return dayFmt.format(new Date(s.startsAt))
}

/** "10:00 AM to 11:30 AM PT". */
export function sessionTime(s: Pick<RunSession, 'startsAt' | 'endsAt' | 'timeZone'>): string {
  const start = timeFmt.format(new Date(s.startsAt))
  const end = s.endsAt ? timeFmt.format(new Date(s.endsAt)) : null
  return `${end ? `${start} to ${end}` : start}${zoneLabel(s.timeZone)}`
}

/** "Thursdays, January 7 to 28" for a Run of several sessions, the one date for a single session, null for none. */
export function runLabel(sessions: Pick<RunSession, 'startsAt'>[]): string | null {
  if (sessions.length === 0) return null
  const first = sessions[0]!
  if (sessions.length === 1) return sessionDay(first)
  const last = sessions[sessions.length - 1]!
  const weekday = sessionDay(first).split(',')[0]
  const a = shortFmt.format(new Date(first.startsAt))
  const b = shortFmt.format(new Date(last.startsAt))
  const sameMonth = a.split(' ')[0] === b.split(' ')[0]
  return `${weekday}s, ${a} to ${sameMonth ? b.split(' ')[1] : b}`
}
