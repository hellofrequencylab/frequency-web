// RELATIVE SCHEDULING (ADR-1386 P5). A to-do can be due N days before or after the Production date.
// Stored as due_offset_days; resolved to due_at in the event's own time zone.
//
// WHY THIS IS THE WHOLE POINT OF AN ATTACHED CHECKLIST. A to-do list that hangs off a Plan is only
// worth building instead of a notes app because of one mechanic: MOVE THE DATE AND THE PREP MOVES.
// "Confirm the sound engineer, 14 days before" stays 14 days before when the retreat slips a week.
// A fixed due date is left alone — that is the other half of the promise, and the reason the offset
// is stored rather than only the resolved day.
//
// PROG-CAL5 shipped this file's callers. Before that it had exactly one importer, its own test: the
// column `crm_tasks.due_offset_days` was written by `addPlanTodo` and resolved by nothing, so the
// numbers accumulated and no date ever moved. The live callers are now:
//   * `addPlanTodo`            — resolves an offset to a real due_at against the Plan's anchor day
//   * `reanchorPlanTodos`      — moves every anchored to-do when the Plan's date moves
//   * `saveCalendarEntry`      — calls that re-anchor whenever a Plan-linked date actually changes
//   * `plan-drawer.tsx`        — the field that sets the offset, and the words that describe it

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Past this an "offset" is a typo, not a plan: a year and a bit either side of the date. */
export const MAX_OFFSET_DAYS = 400

function shiftDay(dayKey: string, days: number): string | null {
  if (!DATE_RE.test(dayKey)) return null
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  if (Number.isNaN(dt.getTime())) return null
  return dt.toISOString().slice(0, 10)
}

/** Negative offset = before the Production date. Positive = after. Zero = the same day. */
export function resolveDueFromOffset(
  productionDayKey: string,
  offsetDays: number | null | undefined,
): string | null {
  if (offsetDays == null || !Number.isInteger(offsetDays)) return null
  if (Math.abs(offsetDays) > MAX_OFFSET_DAYS) return null
  return shiftDay(productionDayKey, offsetDays)
}

export function moveAnchoredDues(
  tasks: readonly { id: string; dueOffsetDays: number | null; dueAt: string | null }[],
  productionDayKey: string,
): { id: string; dueAt: string }[] {
  const out: { id: string; dueAt: string }[] = []
  for (const t of tasks) {
    const day = resolveDueFromOffset(productionDayKey, t.dueOffsetDays)
    if (!day) continue
    out.push({ id: t.id, dueAt: `${day}T12:00:00.000Z` })
  }
  return out
}

/**
 * Validate a STORED, SIGNED offset: what the server action receives and what the column holds.
 * Anything that is not a whole number of days inside the cap becomes null rather than a guess, so a
 * fat-fingered field never silently anchors a to-do to a date a year away.
 */
export function normalizeOffsetDays(raw: unknown): number | null {
  // An EMPTY field is "this to-do is not anchored", not "zero days": `Number('')` is 0, and letting
  // that through would silently anchor every undated to-do to the day of the event.
  const text = typeof raw === 'string' ? raw.trim() : null
  const n = typeof raw === 'number' ? raw : text ? Number(text) : NaN
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (Math.abs(n) > MAX_OFFSET_DAYS) return null
  return n === 0 ? 0 : n
}

/**
 * Turn the DRAWER'S two fields into one stored offset. The form holds a count of days and a
 * direction, because "14 days before" is how a person says it and "-14" is not.
 */
export function offsetFromForm(
  days: unknown,
  direction: 'before' | 'after' | string | null | undefined,
): number | null {
  const magnitude = normalizeOffsetDays(days)
  if (magnitude === null) return null
  const n = Math.abs(magnitude)
  if (n === 0) return 0
  return direction === 'after' ? n : -n
}

/** The words the drawer shows beside an anchored to-do. Null when the to-do has no anchor. */
export function describeOffset(offsetDays: number | null | undefined): string | null {
  if (offsetDays == null || !Number.isInteger(offsetDays)) return null
  if (Math.abs(offsetDays) > MAX_OFFSET_DAYS) return null
  if (offsetDays === 0) return 'on the day'
  const n = Math.abs(offsetDays)
  return `${n} ${n === 1 ? 'day' : 'days'} ${offsetDays < 0 ? 'before' : 'after'}`
}

/** One date linked to a Plan, as the anchor picker reads it. */
export interface AnchorCandidate {
  starts_at: string
  status?: string | null
  stage?: string | null
}

/**
 * THE PLAN'S DATE, picked from the dates linked to it.
 *
 * A Plan usually holds one date, but a Pencil can hold several candidates at once (ADR-1388), and a
 * cancelled date is not a date any more. So: cancelled rows never anchor anything, and among what is
 * left the EARLIEST day wins. Earliest, not latest, because the prep list counts down to the first
 * time the thing actually happens; anchoring to a later candidate would quietly give an owner more
 * runway than they have.
 */
export function planAnchorDayKey(entries: readonly AnchorCandidate[]): string | null {
  let best: string | null = null
  for (const e of entries ?? []) {
    if (e?.status === 'cancelled') continue
    const day = typeof e?.starts_at === 'string' ? e.starts_at.slice(0, 10) : ''
    if (!DATE_RE.test(day)) continue
    if (best === null || day < best) best = day
  }
  return best
}
