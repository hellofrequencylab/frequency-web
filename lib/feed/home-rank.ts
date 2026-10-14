// THE HOME RANKER (Frequency Member Feed: Up next + Near you). Pure, no I/O, so the signals are
// unit-tested rather than trusted. The loader (lib/feed/frequency-home.ts) reads the rows; this
// file decides the order and writes the plain-language "why" each card shows.
//
// The design handoff (design_handoff/frequency/templates/members/README.md, "Ranking") names seven
// signals. Five are computed from real rows here; two have no data behind them yet and are NOT
// faked:
//   1. Distance                    events.geog against the member's home point (haversine).
//                                  Travel TIME has no source (no routing), so distance stands in.
//   2. Friends and Circle-mates    'going' RSVPs from the member's orbit (my_orbit), plus events a
//                                  Circle the member belongs to is hosting.
//   3. Past attendance             the member's earlier 'going' RSVPs, by host and by Space.
//   4. Usual days and times        the weekday and hour histogram of those same past RSVPs.
//   5. Current Journey or practice NO DATA: an event carries no link to a Journey or a practice.
//   6. Saves, skips and Can't go   'maybe' lifts, 'not_going' (Can't go) removes. Saves and skips
//                                  have no table, so only the two RSVP states count.
//   7. Freshness                   decays with the hours until start; a live event holds.
//
// TIME. events.starts_at stores the event's WALL CLOCK as UTC parts (see formatWhen in
// app/(main)/events/index-data.ts). Every comparison here is in that same frame: `nowWallMs` is
// the community's current wall clock expressed as UTC parts, never Date.now().

export type HomeIntent = 'move' | 'sit' | 'social' | 'learn' | 'give'
export type HomeSlot = 'now' | 'tonight' | 'tomorrow' | 'week'

export interface HomeEventInput {
  id: string
  slug: string
  title: string
  location: string | null
  startsAt: string
  endsAt: string | null
  category: string | null
  energyTag: string | null
  coverUrl: string | null
  hostId: string | null
  hostSpaceId: string | null
  hostName: string | null
  /** The hosting Circle's id when the event is scoped to a Circle the member belongs to. */
  myCircleName: string | null
  /** Miles from the member's home, or null when either point is unknown. */
  distanceMi: number | null
  goingCount: number
  /** Orbit members who said Going (first names in the line, faces in the stack). */
  friends: { id: string; name: string; avatarUrl: string | null }[]
  myStatus: 'going' | 'maybe' | 'not_going' | null
}

export interface HomeHistory {
  /** Past 'going' RSVPs: how many times per host / Space, and the weekday + hour of each. */
  hostCounts: Record<string, number>
  spaceCounts: Record<string, number>
  hostNames: Record<string, string>
  weekdays: number[]
  hours: number[]
}

export interface RankedHomeEvent extends HomeEventInput {
  slot: HomeSlot
  intent: HomeIntent | null
  live: boolean
  score: number
  why: string
  badge: string | null
  /** "Tonight 8pm" / "Tue 6am" / "until 7pm". */
  when: string
  /** The short day index from today (0 = today) for Your week style grouping. */
  dayOffset: number
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The member's intent chips, read from the event's own taxonomy (lib/events/options.ts). */
export function intentFor(category: string | null, energyTag: string | null): HomeIntent | null {
  switch (category) {
    case 'movement':
      return 'move'
    case 'ceremony':
    case 'circle_ritual':
      return 'sit'
    case 'gathering':
    case 'social':
    case 'external_meetup':
      return 'social'
    case 'learning':
      return 'learn'
    case 'service':
      return 'give'
  }
  switch (energyTag) {
    case 'high_activation':
      return 'move'
    case 'grounding':
    case 'ceremonial':
      return 'sit'
    case 'social':
      return 'social'
  }
  return null
}

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** "6am" / "7:30pm" from a stored wall-clock ISO (UTC parts). */
export function clockLabel(iso: string): string {
  const d = new Date(iso)
  const h = d.getUTCHours()
  const m = d.getUTCMinutes()
  const suffix = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

/** The community's current wall clock as UTC parts, so it compares with events.starts_at. */
export function wallNowMs(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
}

function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY
}

/** Which Near you time tab an event belongs to, or null once it has ended or is past the week. */
export function slotFor(startsAt: string, endsAt: string | null, nowWall: number): { slot: HomeSlot; live: boolean; dayOffset: number } | null {
  const start = Date.parse(startsAt)
  const end = endsAt ? Date.parse(endsAt) : start + 2 * HOUR
  if (!Number.isFinite(start) || end <= nowWall) return null
  const dayOffset = Math.round((dayStart(start) - dayStart(nowWall)) / DAY)
  if (dayOffset > 7) return null
  const live = start <= nowWall && nowWall < end
  if (live || (start > nowWall && start - nowWall <= 2 * HOUR)) return { slot: 'now', live, dayOffset: Math.max(0, dayOffset) }
  if (dayOffset <= 0) return { slot: 'tonight', live: false, dayOffset: 0 }
  if (dayOffset === 1) return { slot: 'tomorrow', live: false, dayOffset }
  return { slot: 'week', live: false, dayOffset }
}

function whenLabel(e: HomeEventInput, slot: HomeSlot, live: boolean, dayOffset: number): string {
  if (live) return e.endsAt ? `until ${clockLabel(e.endsAt)}` : 'on now'
  const clock = clockLabel(e.startsAt)
  if (dayOffset === 0) return slot === 'now' ? `Today ${clock}` : `Tonight ${clock}`
  if (dayOffset === 1) return `Tomorrow ${clock}`
  return `${WEEKDAY_SHORT[new Date(e.startsAt).getUTCDay()]} ${clock}`
}

/** "Ana and 11 more going" / "Jonah, Priya and 2 more friends going" / "12 going". */
export function friendsLine(friends: { name: string }[], goingCount: number, live: boolean): string {
  const k = live ? 'here now' : 'going'
  const first = (n: string) => n.trim().split(/\s+/)[0] || n
  const f = friends.map((p) => first(p.name))
  if (f.length === 0) return goingCount > 0 ? `${goingCount} ${k}` : 'Be the first to say you’re going'
  const others = Math.max(0, goingCount - f.length)
  if (f.length === 1) return others > 0 ? `${f[0]} and ${others} more ${k}` : `${f[0]} is ${live ? 'here now' : 'going'}`
  if (f.length === 2) return others > 0 ? `${f[0]}, ${f[1]} and ${others} more ${k}` : `${f[0]} and ${f[1]} ${k}`
  const more = f.length - 2
  return `${f[0]}, ${f[1]} and ${more} more ${more === 1 ? 'friend' : 'friends'} ${k}`
}

/**
 * Score and explain every event. Can't go removes an event; everything else is ordered by score.
 * Each signal returns a weight and the sentence it would contribute; the why line is the top one
 * or two, so the reason a card gives is the reason it ranked.
 */
export function rankHomeEvents(events: HomeEventInput[], history: HomeHistory, nowWall: number): RankedHomeEvent[] {
  const totalPast = history.weekdays.length
  const dayHist = new Array(7).fill(0) as number[]
  for (const d of history.weekdays) dayHist[d] = (dayHist[d] ?? 0) + 1
  const out: RankedHomeEvent[] = []

  for (const e of events) {
    if (e.myStatus === 'not_going') continue
    const slotInfo = slotFor(e.startsAt, e.endsAt, nowWall)
    if (!slotInfo) continue
    const { slot, live, dayOffset } = slotInfo
    const reasons: { w: number; text: string }[] = []

    // 1. Distance.
    if (e.distanceMi != null) {
      const w = Math.max(0, 1 - e.distanceMi / 15) * 2.5
      reasons.push({ w, text: e.distanceMi < 1 ? 'Close to home.' : `${round1(e.distanceMi)} mi from home.` })
    }

    // 2. Friends and Circle-mates.
    if (e.friends.length > 0) {
      const names = e.friends.map((f) => f.name.trim().split(/\s+/)[0])
      const text =
        names.length === 1
          ? `${names[0]} is ${live ? 'there now' : 'going'}.`
          : names.length === 2
            ? `${names[0]} and ${names[1]} are going.`
            : `${names[0]}, ${names[1]} and ${names.length - 2} more of your people are going.`
      reasons.push({ w: Math.min(4, e.friends.length) * 1.4, text })
    }
    if (e.myCircleName) reasons.push({ w: 2.2, text: `Your Circle, ${e.myCircleName}, is hosting.` })

    // 3. Past attendance with the host or Space.
    const hostTimes = (e.hostId ? history.hostCounts[e.hostId] : 0) ?? 0
    const spaceTimes = (e.hostSpaceId ? history.spaceCounts[e.hostSpaceId] : 0) ?? 0
    const been = Math.max(hostTimes, spaceTimes)
    if (been > 0) {
      const who = e.hostName ?? 'this host'
      reasons.push({ w: Math.min(3, been) * 0.8, text: been === 1 ? `You’ve been to ${who}’s before.` : `You’ve been to ${who}’s ${been} times.` })
    }

    // 4. Usual days and times.
    if (totalPast >= 3) {
      const d = new Date(e.startsAt).getUTCDay()
      const share = (dayHist[d] ?? 0) / totalPast
      if (share >= 0.25) reasons.push({ w: share * 2, text: `You usually show up on ${WEEKDAY[d]}s.` })
      const h = new Date(e.startsAt).getUTCHours()
      const nearHour = history.hours.filter((x) => Math.abs(x - h) <= 2).length / totalPast
      if (nearHour >= 0.4) reasons.push({ w: nearHour, text: 'Your usual time of day.' })
    }

    // 6. Maybe lifts (Can't go already removed above).
    if (e.myStatus === 'maybe') reasons.push({ w: 0.6, text: 'You said maybe.' })

    // 7. Freshness, decaying toward the start.
    const hoursOut = Math.max(0, (Date.parse(e.startsAt) - nowWall) / HOUR)
    const fresh = live ? 1.2 : 1.5 * Math.exp(-hoursOut / 48)
    reasons.push({ w: fresh, text: live ? 'On right now.' : '' })

    const score = reasons.reduce((s, r) => s + r.w, 0) + Math.log1p(e.goingCount) * 0.3
    const why = reasons
      .filter((r) => r.text && r.w > 0.2)
      .sort((a, b) => b.w - a.w)
      .slice(0, 2)
      .map((r) => r.text)
      .join(' ')

    const badge = e.myCircleName
      ? 'Your Circle is hosting'
      : e.friends.length >= 2
        ? `${e.friends.length} friends going`
        : e.friends.length === 1
          ? `${e.friends[0]!.name.trim().split(/\s+/)[0]} is going`
          : live
            ? 'On now'
            : null

    out.push({
      ...e,
      slot,
      live,
      dayOffset,
      intent: intentFor(e.category, e.energyTag),
      score,
      why: why || (e.goingCount > 0 ? `${e.goingCount} going so far.` : 'New this week.'),
      badge,
      when: whenLabel(e, slot, live, dayOffset),
    })
  }

  return out.sort((a, b) => b.score - a.score || Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

function round1(n: number): string {
  return n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n))
}

/** The distance text a row shows: "0.4 mi", or null when unknown. */
export function distanceLabel(mi: number | null): string | null {
  return mi == null ? null : `${round1(mi)} mi`
}
