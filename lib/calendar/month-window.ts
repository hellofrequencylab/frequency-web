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

/** The [fromDay, toDay) span of one calendar year, for Admin list and Projects. */
export function yearHorizonWindow(year: number): { fromDay: string; toDay: string } {
  return { fromDay: `${year}-01-01`, toDay: `${year + 1}-01-01` }
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
