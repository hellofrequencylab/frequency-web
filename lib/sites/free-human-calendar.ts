// THE FREE HUMAN CALENDAR (design: templates/website/Calendar.dc.html). PURE and client-safe: the kinds of gathering, the
// occurrence shape the live block hands its client view, and the month grid, month strip, agenda and day lists the view draws.
// Every start is a stored wall clock (lib/time/zone.ts, "YYYY-MM-DDTHH:MM"), so day and month come off the string and no zone
// round trip happens here.

interface FreeHumanKindMeta { id: string; label: string; glyph: string; color: string }

/** The kinds of gathering the design draws, each with the mark and the colour token that stand for it. */
export const FREE_HUMAN_KINDS: readonly FreeHumanKindMeta[] = [
  { id: 'circle', label: 'Circle', glyph: 'gathering', color: '--fh-clay-300' },
  { id: 'moon', label: 'Moon gathering', glyph: 'full-moon', color: '--fh-indigo-500' },
  { id: 'turn', label: 'Turn of the year', glyph: 'sun-sign', color: '--fh-saffron-400' },
  { id: 'workshop', label: 'Workshop', glyph: 'bloom', color: '--fh-clay-500' },
  { id: 'retreat', label: 'Retreat', glyph: 'temple', color: '--fh-jade-500' },
  { id: 'program', label: 'Season opens', glyph: 'spiral', color: '--fh-fig-500' },
  { id: 'book', label: 'Book', glyph: 'library', color: '--fh-brass-600' },
]

export const freeHumanKindMeta = (id: string): FreeHumanKindMeta => FREE_HUMAN_KINDS.find((k) => k.id === id) ?? FREE_HUMAN_KINDS[0]

/** One dated gathering, as the client view reads it. Plain strings only, so it crosses the server boundary. */
export interface FreeHumanOcc {
  id: string
  title: string
  kind: string
  /** "YYYY-MM-DDTHH:MM" wall clock. */
  startsAt: string
  endsAt: string | null
  place: string
  price: string
  summary: string
  /** Where "Reserve" and "Details" go: the event's own page, or '' when it has none. */
  href: string
  /** True when the row is one week of a recurring series. */
  recurring: boolean
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const freeHumanMonthName = (m: number) => MONTHS[m]
export const freeHumanDayName = (d: number) => DAY_NAMES[d]
export const FREE_HUMAN_DOW_HEADS = DAYS.map((d) => d.toUpperCase())

/** A "YYYY-MM-DD" key as a UTC date. */
const keyDate = (key: string) => new Date(`${key}T00:00:00Z`)
const dateKey = (d: Date) => d.toISOString().slice(0, 10)
const dayOf = (s: string) => s.slice(0, 10)
const timeOf = (s: string) => s.slice(11, 16)

/** "7pm", "10:30am". */
export function freeHumanTime(s: string): string {
  const [h, m] = timeOf(s).split(':').map(Number)
  if (!Number.isFinite(h)) return ''
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`
}

/** Whether a gathering runs past its first day. */
const multiDay = (o: FreeHumanOcc) => !!o.endsAt && dayOf(o.endsAt) > dayOf(o.startsAt)

/** "Sun, Nov 15 · 10am–1pm", or "Sat, Dec 19 – Mon, Dec 21" for a stay. */
export function freeHumanWhen(o: FreeHumanOcc): string {
  const s = keyDate(dayOf(o.startsAt))
  const head = `${DAYS[s.getUTCDay()]}, ${MONTHS[s.getUTCMonth()].slice(0, 3)} ${s.getUTCDate()}`
  if (multiDay(o)) {
    const e = keyDate(dayOf(o.endsAt as string))
    return `${head} – ${DAYS[e.getUTCDay()]}, ${MONTHS[e.getUTCMonth()].slice(0, 3)} ${e.getUTCDate()}`
  }
  const t = o.endsAt ? `${freeHumanTime(o.startsAt)}–${freeHumanTime(o.endsAt)}` : freeHumanTime(o.startsAt)
  return t ? `${head} · ${t}` : head
}

/** Whether a gathering touches a day. */
export function freeHumanOnDay(o: FreeHumanOcc, key: string): boolean {
  return dayOf(o.startsAt) <= key && key <= (o.endsAt ? dayOf(o.endsAt) : dayOf(o.startsAt))
}

/** The gatherings that pass the kind filter, soonest first. */
export function freeHumanFilter(occs: readonly FreeHumanOcc[], filter: string): FreeHumanOcc[] {
  return occs.filter((o) => filter === 'all' || o.kind === filter).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** A month offset from the month of `today` as { year, month } (month 0 is January). */
export function freeHumanMonthAt(today: string, offset: number): { year: number; month: number } {
  const d = keyDate(today)
  const idx = d.getUTCFullYear() * 12 + d.getUTCMonth() + offset
  return { year: Math.floor(idx / 12), month: idx % 12 }
}

interface FreeHumanCell {
  key: string
  n: number
  inMonth: boolean
  today: boolean
  /** The first three, with the start time ahead of the title when the day is its first. */
  items: { id: string; label: string; glyph: string; color: string }[]
  more: number
  count: number
  aria: string
}

/** The month grid: whole weeks, Sunday first, each day with up to three gatherings. */
export function freeHumanMonthCells(occs: readonly FreeHumanOcc[], year: number, month: number, today: string): FreeHumanCell[] {
  const first = new Date(Date.UTC(year, month, 1))
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lead = first.getUTCDay()
  const cells: FreeHumanCell[] = []
  for (let i = 0; i < Math.ceil((lead + days) / 7) * 7; i++) {
    const d = new Date(Date.UTC(year, month, i - lead + 1))
    const key = dateKey(d)
    const on = occs.filter((o) => freeHumanOnDay(o, key))
    const inMonth = d.getUTCMonth() === month
    cells.push({
      key,
      n: d.getUTCDate(),
      inMonth,
      today: inMonth && key === today,
      items: on.slice(0, 3).map((o) => ({ id: o.id, label: `${dayOf(o.startsAt) === key && !multiDay(o) ? `${freeHumanTime(o.startsAt)} ` : ''}${o.title}`.trim(), glyph: freeHumanKindMeta(o.kind).glyph, color: freeHumanKindMeta(o.kind).color })),
      more: Math.max(0, on.length - 3),
      count: on.length,
      aria: `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${on.length ? `, ${on.length} ${on.length === 1 ? 'gathering' : 'gatherings'}` : ''}`,
    })
  }
  return cells
}

interface FreeHumanStripMonth { offset: number; label: string; year: string; count: number; countLine: string; season: string }

/** The month strip: `length` months from the month of `today`, each with how many gatherings it holds. */
export function freeHumanMonthStrip(occs: readonly FreeHumanOcc[], today: string, length: number, seasonOf: (month: number) => string): FreeHumanStripMonth[] {
  const out: FreeHumanStripMonth[] = []
  for (let k = 0; k < length; k++) {
    const { year, month } = freeHumanMonthAt(today, k)
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const count = occs.filter((o) => dayOf(o.startsAt).startsWith(prefix)).length
    out.push({ offset: k, label: MONTHS[month].slice(0, 3), year: k === 0 || month === 0 ? String(year) : '', count, countLine: count ? `${count} ${count === 1 ? 'date' : 'dates'}` : '—', season: seasonOf(month) })
  }
  return out
}

/** The gatherings that start in a month, for the agenda. */
export function freeHumanAgenda(occs: readonly FreeHumanOcc[], year: number, month: number): FreeHumanOcc[] {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return occs.filter((o) => dayOf(o.startsAt).startsWith(prefix))
}

/** "05" and "THU": the agenda row's numeral. */
export function freeHumanAgendaDay(o: FreeHumanOcc): { day: string; dow: string } {
  const d = keyDate(dayOf(o.startsAt))
  return { day: String(d.getUTCDate()).padStart(2, '0'), dow: DAYS[d.getUTCDay()].toUpperCase() }
}

/** A recurring series shown once: the first of each title that repeats, for the list under "All". */
export function freeHumanCollapse(occs: readonly FreeHumanOcc[]): FreeHumanOcc[] {
  const seen = new Set<string>()
  return occs.filter((o) => {
    if (!o.recurring) return true
    if (seen.has(o.title)) return false
    seen.add(o.title)
    return true
  })
}
