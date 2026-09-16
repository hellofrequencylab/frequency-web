// DAY NOTES, the pure half (ADR-1386). A quiet label on a day's grid card ("Quiet hours" every Monday,
// "Flex day" on Thursdays, "Retreat & rental" Friday and Saturday, or a note on a date range). It
// describes the day; it never occupies time and is never an event. Pure: no React, no Supabase.

export interface DayNote {
  id: string
  label: string
  /** 0 = Sunday .. 6 = Saturday. Null for a dated note. */
  weekdays: number[] | null
  /** YYYY-MM-DD bounds, inclusive; either open when null (a dated note always has startsOn). */
  startsOn: string | null
  endsOn: string | null
  visibility: 'team' | 'public'
}

export const DAY_NOTE_COLS = 'id, label, weekdays, starts_on, ends_on, visibility, sort'

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The labels that apply to one day, in the notes' order. */
export function notesForDay(notes: readonly DayNote[], dayKey: string): string[] {
  if (!DATE_RE.test(dayKey)) return []
  const out: string[] = []
  for (const n of notes) {
    if (n.weekdays && n.weekdays.length) {
      if (n.startsOn && dayKey < n.startsOn) continue
      if (n.endsOn && dayKey > n.endsOn) continue
      if (!n.weekdays.includes(weekdayOf(dayKey))) continue
    } else {
      if (!n.startsOn) continue
      if (dayKey < n.startsOn || dayKey > (n.endsOn ?? n.startsOn)) continue
    }
    out.push(n.label)
  }
  return out
}

/** A stored row as a DayNote. */
export function dayNoteFromRow(r: {
  id: string
  label: string
  weekdays: number[] | null
  starts_on: string | null
  ends_on: string | null
  visibility: string
}): DayNote {
  return {
    id: r.id,
    label: r.label,
    weekdays: r.weekdays && r.weekdays.length ? [...r.weekdays].sort() : null,
    startsOn: r.starts_on ? r.starts_on.slice(0, 10) : null,
    endsOn: r.ends_on ? r.ends_on.slice(0, 10) : null,
    visibility: r.visibility === 'team' ? 'team' : 'public',
  }
}

export interface DayNoteInput {
  label: string
  /** 'weekly' uses weekdays; 'dates' uses startsOn..endsOn. */
  mode: 'weekly' | 'dates'
  weekdays: number[]
  startsOn: string
  endsOn: string
  isPublic: boolean
}

export type DayNoteWrite = {
  label: string
  weekdays: number[] | null
  starts_on: string | null
  ends_on: string | null
  visibility: 'team' | 'public'
}

/** Validate the settings form. Errors are plain sentences. */
export function parseDayNoteInput(input: DayNoteInput): { data: DayNoteWrite } | { error: string } {
  const label = (input.label ?? '').trim()
  if (!label) return { error: 'Give the note a few words.' }
  if (label.length > 40) return { error: 'Keep the note to 40 characters.' }
  const startsOn = input.startsOn?.trim() || null
  const endsOn = input.endsOn?.trim() || null
  if ((startsOn && !DATE_RE.test(startsOn)) || (endsOn && !DATE_RE.test(endsOn))) return { error: 'Pick a valid date.' }
  if (startsOn && endsOn && endsOn < startsOn) return { error: 'The end date is before the start date.' }
  const visibility = input.isPublic ? 'public' : 'team'
  if (input.mode === 'weekly') {
    const days = [...new Set((input.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    if (!days.length) return { error: 'Pick at least one day of the week.' }
    return { data: { label, weekdays: days, starts_on: startsOn, ends_on: endsOn, visibility } }
  }
  if (!startsOn) return { error: 'Pick the date the note is for.' }
  return { data: { label, weekdays: null, starts_on: startsOn, ends_on: endsOn, visibility } }
}

/** "Mondays", "Friday and Saturday", "Sep 22 to Sep 26": how the settings list describes a note. */
export function describeDayNote(n: DayNote): string {
  if (n.weekdays && n.weekdays.length) {
    const names = n.weekdays.map((d) => WEEKDAY_NAMES[d])
    const days = names.length === 1 ? `${names[0]}s` : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    const bounds = n.startsOn || n.endsOn ? `, ${n.startsOn ?? 'now'} to ${n.endsOn ?? 'ongoing'}` : ''
    return `${days}${bounds}`
  }
  return n.endsOn && n.endsOn !== n.startsOn ? `${n.startsOn} to ${n.endsOn}` : `${n.startsOn}`
}
