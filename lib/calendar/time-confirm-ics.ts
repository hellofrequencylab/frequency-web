import { buildVevent, foldLine, icsEscape, icsEventInstants, icsStamp, renderCalendar } from '@/lib/events/ics'

// THE INVITE A CONFIRMED FIND A TIME DATE SENDS (EMAIL-093), the pure half. One VEVENT, through the
// shared RFC 5545 blocks in lib/events/ics.ts, so the timezone contract holds: the calendar stores the
// Space's wall clock as UTC parts and icsEventInstants resolves the true instant before stamping. An
// all-day date is written as a DATE value (no time at all), the way every calendar app expects one.

interface TimeInviteInput {
  entryId: string
  title: string
  startsAt: string
  endsAt: string
  timeZone: string
  allDay: boolean
  spaceName: string
  location?: string | null
  url?: string | null
}

const dateValue = (iso: string) => iso.slice(0, 10).replace(/-/g, '')

/** The .ics text for one confirmed date. `now` stamps DTSTAMP (injectable for tests). */
export function buildTimeInviteIcs(input: TimeInviteInput, now: Date = new Date()): string {
  const summary = input.title
  const description = `Picked with Find a time by ${input.spaceName}.`
  if (input.allDay) {
    const lines = [
      'BEGIN:VEVENT',
      `UID:time-${input.entryId}@frequency`,
      `DTSTAMP:${icsStamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(input.startsAt)}`,
      `DTEND;VALUE=DATE:${dateValue(input.endsAt)}`,
      foldLine(`SUMMARY:${icsEscape(summary)}`),
      foldLine(`DESCRIPTION:${icsEscape(description)}`),
      ...(input.location ? [foldLine(`LOCATION:${icsEscape(input.location)}`)] : []),
      ...(input.url ? [foldLine(`URL:${input.url}`)] : []),
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ]
    return renderCalendar({ vevents: [lines], name: input.spaceName, now })
  }
  const { start, end } = icsEventInstants(input.startsAt, input.endsAt, input.timeZone)
  const vevent = buildVevent(
    { uid: `time-${input.entryId}`, start, end, summary, description, location: input.location ?? null, url: input.url ?? null },
    now,
  )
  return renderCalendar({ vevents: [vevent], name: input.spaceName, now })
}
