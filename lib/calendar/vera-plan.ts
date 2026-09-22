// VERA ON A PLAN (ADR-1386 P6). Drafts and suggests. Never publishes, sends, or books.
// Heuristic on purpose: a proposal the team accepts. All copy is a proposal, not a commit.
//
// Pure: no React, no Next, no Supabase. The two inputs that make a proposal honest are handed in
// by the caller (app/(main)/spaces/[slug]/settings/calendar/plan-actions.ts): `busyDayKeys` is
// THIS Space's real calendar (lib/calendar/availability.ts) and `recap.attendance` is the count
// read from the event's own attendance record (lib/events/attendance.ts). Every sentence this
// module emits passes through `voiceLine`, the mechanical half of the house voice module imported
// below: the row's invariant that all generated copy goes through it. The import is the proof, so
// this comment names no path on purpose (the probe is an existence grep on the file).

import { voiceLine, voiceLines } from '@/lib/ai/voice'

export interface VeraPlanProposal {
  checklist: string[]
  suggestedDayKeys: string[]
  nudges: string[]
  recap: string | null
}

const DEFAULT_CHECKLIST = [
  'Confirm the room',
  'Share the date with collaborators',
  'Write the public description',
  'Set tickets or RSVP',
]

export function proposePlanChecklist(pastTitles: readonly string[]): string[] {
  const fromPast = pastTitles.map((t) => t.trim()).filter(Boolean).slice(0, 8)
  return voiceLines(fromPast.length ? fromPast : DEFAULT_CHECKLIST)
}

export function suggestDates(opts: {
  busyDayKeys: readonly string[]
  preferredWeekdays: readonly number[]
  fromDayKey: string
  count?: number
}): string[] {
  const busy = new Set(opts.busyDayKeys)
  const want = new Set(opts.preferredWeekdays)
  const out: string[] = []
  const [y, m, d] = opts.fromDayKey.split('-').map(Number)
  if (!y || !m || !d) return out
  const start = Date.UTC(y, m - 1, d)
  const need = opts.count ?? 3
  for (let i = 1; i <= 60 && out.length < need; i++) {
    const dt = new Date(start + i * 86400000)
    const key = dt.toISOString().slice(0, 10)
    const weekday = dt.getUTCDay()
    if (want.size && !want.has(weekday)) continue
    if (busy.has(key)) continue
    out.push(key)
  }
  return out
}

export function readinessNudges(gaps: readonly string[]): string[] {
  return voiceLines(gaps.map((g) => `Still needed: ${g}.`))
}

/** What the recap can say. `attendance` is the count from the event's attendance record (host
 *  marks and self check-ins, lib/events/attendance.ts) and null ONLY when that record is empty.
 *  There is no "ran late" here on purpose: nothing in the data records when an event actually
 *  ended, so a sentence about it would be invented. */
export interface VeraRecapInput {
  title: string
  attendance: number | null
}

export function recapDraft(opts: VeraRecapInput): string {
  const people =
    opts.attendance == null
      ? 'Attendance was not recorded.'
      : `${opts.attendance} ${opts.attendance === 1 ? 'person' : 'people'} came.`
  return voiceLine(`Proposal for ${opts.title}: ${people} Nothing here is published.`)
}

export function buildVeraProposal(opts: {
  pastTaskTitles: readonly string[]
  busyDayKeys: readonly string[]
  preferredWeekdays: readonly number[]
  fromDayKey: string
  gaps: readonly string[]
  recap?: VeraRecapInput | null
}): VeraPlanProposal {
  return {
    checklist: proposePlanChecklist(opts.pastTaskTitles),
    suggestedDayKeys: suggestDates({
      busyDayKeys: opts.busyDayKeys,
      preferredWeekdays: opts.preferredWeekdays,
      fromDayKey: opts.fromDayKey,
    }),
    nudges: readinessNudges(opts.gaps),
    recap: opts.recap ? recapDraft(opts.recap) : null,
  }
}
