// VERA ON A PLAN (ADR-1386 P6). Drafts and suggests. Never publishes, sends, or books.
// Heuristic on purpose: a proposal the team accepts. All copy is a proposal, not a commit.

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
  return fromPast.length ? fromPast : [...DEFAULT_CHECKLIST]
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
  return gaps.map((g) => `Still needed: ${g}.`)
}

export function recapDraft(opts: {
  title: string
  attendance: number | null
  ranLate: boolean
}): string {
  const people =
    opts.attendance == null ? 'Attendance was not recorded.' : `${opts.attendance} people came.`
  const late = opts.ranLate ? ' It ran late.' : ''
  return `Proposal for ${opts.title}: ${people}${late} Nothing here is published.`
}

export function buildVeraProposal(opts: {
  pastTaskTitles: readonly string[]
  busyDayKeys: readonly string[]
  preferredWeekdays: readonly number[]
  fromDayKey: string
  gaps: readonly string[]
  recap?: { title: string; attendance: number | null; ranLate: boolean } | null
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
