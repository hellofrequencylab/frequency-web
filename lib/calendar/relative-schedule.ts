// RELATIVE SCHEDULING (ADR-1386 P5). A to-do can be due N days before or after the Production date.
// Stored as due_offset_days; resolved to due_at in the event's own time zone.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
  if (Math.abs(offsetDays) > 400) return null
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
