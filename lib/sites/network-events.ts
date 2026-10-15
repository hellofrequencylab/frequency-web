/** Stored event dates are wall clocks as UTC parts, never the browser's own zone. */
export const networkDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`)

export function networkMonthDays(month: string): string[] {
  const first = networkDate(`${month}-01`)
  const start = first.getTime() - first.getUTCDay() * 864e5
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start + i * 864e5).toISOString().slice(0, 10))
  return cells.slice(35).every((d) => d.slice(0, 7) !== month) ? cells.slice(0, 35) : cells
}

export function networkMonthOffset(month: string, by: number): string {
  const date = networkDate(`${month}-01`)
  date.setUTCMonth(date.getUTCMonth() + by)
  return date.toISOString().slice(0, 7)
}

export function filterNetworkEvents<T extends { day: string; chapter: string | null }>(rows: readonly T[], chapter: string | null, day: string | null): T[] {
  return rows.filter((row) => (!chapter || row.chapter === chapter) && (!day || row.day === day))
}

export function networkDayLabel(day: string, today: string): string {
  const diff = Math.round((networkDate(day).getTime() - networkDate(today).getTime()) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...(diff > 1 && diff < 7 ? { weekday: 'long' as const } : { weekday: 'short' as const, month: 'short' as const, day: 'numeric' as const }) }).format(networkDate(day))
}

/** Prefer the declared host Space; old authored documents can match a single unambiguous label. */
export function networkChapterLabel(event: { title: string; location?: string | null; hostingSpaceId?: string | null }, chapters: { label: string; match: string[]; spaceId?: string }[]): string | null {
  if (event.hostingSpaceId && chapters.some((chapter) => chapter.spaceId)) {
    return chapters.find((chapter) => chapter.spaceId === event.hostingSpaceId)?.label ?? null
  }
  const title = event.title.toLowerCase()
  const titleMatches = chapters.filter((chapter) => chapter.match.some((match) => match && title.includes(match)))
  if (titleMatches.length) return titleMatches.length === 1 ? titleMatches[0].label : null
  const location = (event.location ?? '').toLowerCase()
  const placeMatches = chapters.filter((chapter) => chapter.match.some((match) => match && location.includes(match)))
  return placeMatches.length === 1 ? placeMatches[0].label : null
}

/** Calendar cards stay available all day; the next-event panel only promises a current/future event. */
export function networkEventAvailability(event: { startsAtInstant: number | null; endsAtInstant: number | null }, now: number): 'future' | 'ongoing' | 'ended' {
  const start = event.startsAtInstant
  if (start == null || !Number.isFinite(start)) return 'ended'
  if (start > now) return 'future'
  const end = event.endsAtInstant
  return end != null && Number.isFinite(end) && end > start && end > now ? 'ongoing' : 'ended'
}
