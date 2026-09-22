// The [fromDay, toDay) window of one calendar month, as the loaders ask for it. Pure.

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Month keys are 'YYYY-MM'. */
export function monthKey(year: number, month1: number): string {
  return `${year}-${pad2(month1)}`
}

/** Parse a client-sent year/month defensively; null when out of range. */
export function safeMonth(year: unknown, month1: unknown): { year: number; month1: number } | null {
  const y = Number(year)
  const m = Number(month1)
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < 2000 || y > 2100 || m < 1 || m > 12) return null
  return { year: y, month1: m }
}

/** Step a month. January minus one is December of the previous year. */
export function adjacentMonth(year: number, month1: number, delta: number): { year: number; month1: number } {
  const idx = year * 12 + (month1 - 1) + delta
  return { year: Math.floor(idx / 12), month1: (idx % 12) + 1 }
}

/** How far back and forward the operator's List and Workflow reach, in whole months. */
export const OPERATOR_HORIZON_BACK_MONTHS = 3
export const OPERATOR_HORIZON_FORWARD_MONTHS = 15

/**
 * The [fromDay, toDay) span the operator Calendar tab loads its entries over.
 *
 * 🔴 WHY IT IS NOT A CALENDAR YEAR. This replaced `yearHorizonWindow(year)`, which spanned
 * January to January of the year the viewer happened to be in. The month GRID pages on its own
 * (`loadStaffCalendarMonth`), but List and Workflow are derived once from this window and never
 * refetch, so anything outside it was invisible on those two views however far the grid scrolled.
 *
 * A season is not a calendar year, and planning runs forward. Royal Temple's seeded schedule runs
 * Fall Equinox 2026 to Fall Equinox 2027: on 2026-09-22 the old window held 30 of its 128 dates
 * and hid the other 98 — the Space's whole year of work, on the two views built to survey it.
 *
 * A window ANCHORED ON TODAY and asymmetric (a short tail, a long horizon) is what the surface is
 * for: the recent past is context, the future is the job.
 */
export function operatorHorizonWindow(now: Date): { fromDay: string; toDay: string } {
  const back = adjacentMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, -OPERATOR_HORIZON_BACK_MONTHS)
  const forward = adjacentMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, OPERATOR_HORIZON_FORWARD_MONTHS)
  return {
    fromDay: `${back.year}-${pad2(back.month1)}-01`,
    toDay: `${forward.year}-${pad2(forward.month1)}-01`,
  }
}

/** The grid of a month spans up to 6 days either side of it, so load that whole visible range. */
export function monthGridWindow(year: number, month1: number): { fromDay: string; toDay: string } {
  const first = new Date(Date.UTC(year, month1 - 1, 1))
  const start = new Date(first)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  const last = new Date(Date.UTC(year, month1, 0))
  const end = new Date(last)
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()) + 1)
  const iso = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
  return { fromDay: iso(start), toDay: iso(end) }
}
