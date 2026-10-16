import type { EventRow, EventsIndexData } from '@/app/(main)/events/index-data'
import { formatWhen } from '@/app/(main)/events/index-data'
import type { EventMapPin } from '@/components/events/events-map'
import { CATEGORY_OPTIONS } from '@/lib/events/options'
import { HOME_TZ, dayInZone, eventInstant } from '@/lib/time/zone'
import { chipTime } from './calendar-month'

// THE AROUND YOU ITEM (SCAN-975). One plain, serialisable row per event that the Around you feature, its
// ticker and the map lightbox all read, built from the rows getEventsIndexData already loaded: no second
// query, nothing the card does not already know. Server-safe and pure, so the client islands receive data,
// never a database handle.
//
// TIME. starts_at holds the event's wall-clock as UTC parts (index-data formatWhen). The labels render those
// parts as they are; `startMs` / `endMs` are the TRUE instants (eventInstant, the community zone), which is
// what a live countdown in the browser has to compare against Date.now().

export type AyItem = {
  id: string
  slug: string
  title: string
  /** "Tomorrow at 9am", the card's own when line. */
  when: string
  /** "Today", "Tomorrow" or a short weekday / date for the ticker's day column. */
  day: string
  /** "9am". */
  time: string
  startMs: number | null
  endMs: number | null
  /** Whole days from today in the community zone (0 = today). */
  daysOut: number
  /** Day of the week of the event's own date, 0 = Sunday. */
  dow: number
  category: string | null
  categoryLabel: string | null
  going: boolean
  goingCount: number
  /** Seats left under a cap, or null when there is no cap. */
  spotsLeft: number | null
  /** Miles from the member's home base, only where the read measured it. */
  miles: number | null
  place: string | null
  price: string | null
  cover: string | null
  coverFocus: string | null
  featured: boolean
  online: boolean
}

/** A map row: the item plus its privacy-safe pin (a Circle's city point, or a public event's own spot). */
export type AyMapItem = AyItem & { lat: number; lng: number; moreDates: number }

const DAY_MS = 24 * 60 * 60 * 1000
const CATEGORY_LABEL = new Map(CATEGORY_OPTIONS.map((o) => [o.value, o.label]))

type ItemData = Pick<
  EventsIndexData,
  'nowDate' | 'myRsvps' | 'rsvpCounts' | 'priceLabels' | 'coverUrls' | 'coverFocus' | 'circleNames'
>

export function toAyItem(e: EventRow, data: ItemData): AyItem {
  const today = dayInZone(data.nowDate, HOME_TZ)
  const day0 = e.starts_at.slice(0, 10)
  const daysOut = Math.round((Date.parse(`${day0}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
  const going = data.rsvpCounts[e.id] ?? 0
  const label =
    daysOut === 0
      ? 'Today'
      : daysOut === 1
        ? 'Tomorrow'
        : daysOut > 1 && daysOut < 7
          ? new Date(e.starts_at).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
          : new Date(e.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const circle = e.scope_type === 'circle' ? data.circleNames[e.scope_id] : undefined
  return {
    id: e.id,
    slug: e.slug,
    title: e.title,
    when: formatWhen(e.starts_at, data.nowDate),
    day: label,
    time: chipTime(e.starts_at),
    startMs: eventInstant(e.starts_at, HOME_TZ)?.getTime() ?? null,
    endMs: eventInstant(e.ends_at, HOME_TZ)?.getTime() ?? null,
    daysOut,
    dow: new Date(`${day0}T00:00:00Z`).getUTCDay(),
    category: e.category,
    categoryLabel: e.category ? CATEGORY_LABEL.get(e.category) ?? null : null,
    going: data.myRsvps.has(e.id),
    goingCount: going,
    spotsLeft: e.capacity != null ? Math.max(0, e.capacity - going) : null,
    miles: typeof e.distance_m === 'number' ? Math.round((e.distance_m / 1609.344) * 10) / 10 : null,
    place: circle ?? e.location ?? null,
    price: data.priceLabels[e.id] ?? null,
    cover: data.coverUrls[e.id] ?? null,
    coverFocus: data.coverFocus[e.id] ?? null,
    featured: !!e.featured_at,
    online: e.attendance_mode === 'online' || e.category === 'online',
  }
}

/** The map lightbox's rows: every pin the page may plot, joined to its listed event. */
export function ayMapItems(rows: EventRow[], pins: EventMapPin[], data: ItemData): AyMapItem[] {
  const byId = new Map(rows.map((e) => [e.id, e]))
  const out: AyMapItem[] = []
  for (const p of pins) {
    const e = byId.get(p.id)
    if (!e || e.is_cancelled) continue
    out.push({ ...toAyItem(e, data), lat: p.lat, lng: p.lng, moreDates: p.moreDates ?? 0 })
  }
  return out
}


// ── THE PLAN: what the feature leads with, and the balance under it ──────────────────────────────────────
// The owner's brief (2026-10-16): "feature either the latest upcoming, or what they've RSVPd to ... either
// helping them manage their events, suggesting most relevant and keeping a balance of both." So:
//   · the SPOTLIGHT is the member's own next event when it is inside a week (manage first), else their best
//     pick, else what the operator featured, else simply the next thing coming up;
//   · the THREE cards under it keep the balance: at most one more of their own, then picks, then whatever
//     is filling up, then the soonest, never the same event twice;
//   · the TICKER's tabs are the same four lenses in full (Yours, For you, This week, Nearby), and it opens
//     on Yours when they have anything, so the page helps them run their week before it sells them more.

export type AyReason = 'next' | 'pick' | 'featured' | 'soon'
export type AyTag = 'Going' | 'For you' | 'Filling up' | 'Featured' | 'Coming up'
export type AyTabKey = 'yours' | 'picks' | 'week' | 'near'
export type AyTab = { key: AyTabKey; label: string; items: AyItem[] }

export type AyPlan = {
  spotlight: { item: AyItem; reason: AyReason } | null
  supporting: { item: AyItem; tag: AyTag }[]
  tabs: AyTab[]
  defaultTab: AyTabKey | null
  /** The member's own events in the next seven days, and in all. */
  goingWeek: number
  goingTotal: number
  picks: number
  /** The pulse strip: the next week's events, soonest first. */
  pulse: AyItem[]
}

const TAB_SIZE = 8
const SUPPORT_SIZE = 3

function fillingUp(i: AyItem): boolean {
  return i.spotsLeft != null && i.spotsLeft > 0 && i.spotsLeft <= 5
}

/**
 * Plan the Around you feature. `items` are the listed events in the list's own order (soonest first);
 * `pickIds` the viewer's ranked picks, best first (empty when signed out or when scoring failed).
 */
export function planAroundYou(
  items: AyItem[],
  pickIds: string[],
  { now, hasHome }: { now: number; hasHome: boolean },
): AyPlan {
  const upcoming = items.filter((i) => (i.endMs ?? i.startMs ?? now) >= now && i.daysOut >= 0)
  const byId = new Map(upcoming.map((i) => [i.id, i]))
  const yours = upcoming.filter((i) => i.going)
  const picks = pickIds.map((id) => byId.get(id)).filter((i): i is AyItem => !!i && !i.going)
  const week = upcoming.filter((i) => i.daysOut < 7)

  let spotlight: AyPlan['spotlight'] = null
  if (yours[0] && (yours[0].daysOut < 7 || picks.length === 0)) spotlight = { item: yours[0], reason: 'next' }
  else if (picks[0]) spotlight = { item: picks[0], reason: 'pick' }
  else {
    const feat = upcoming.find((i) => i.featured && i.daysOut < 14)
    if (feat) spotlight = { item: feat, reason: 'featured' }
    else if (upcoming[0]) spotlight = { item: upcoming[0], reason: 'soon' }
  }

  const used = new Set<string>(spotlight ? [spotlight.item.id] : [])
  const supporting: AyPlan['supporting'] = []
  const take = (list: AyItem[], tag: AyTag, max: number) => {
    for (const i of list) {
      if (supporting.length >= SUPPORT_SIZE || max <= 0) return
      if (used.has(i.id)) continue
      used.add(i.id)
      supporting.push({ item: i, tag })
      max -= 1
    }
  }
  take(yours, 'Going', 1)
  take(picks, 'For you', SUPPORT_SIZE)
  take(upcoming.filter(fillingUp), 'Filling up', SUPPORT_SIZE)
  take(upcoming.filter((i) => i.featured), 'Featured', SUPPORT_SIZE)
  take(upcoming, 'Coming up', SUPPORT_SIZE)

  const near = hasHome
    ? upcoming.filter((i) => i.miles != null).sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0))
    : []
  const tabs: AyTab[] = (
    [
      { key: 'yours', label: 'Yours', items: yours.slice(0, TAB_SIZE) },
      { key: 'picks', label: 'For you', items: picks.slice(0, TAB_SIZE) },
      { key: 'week', label: 'This week', items: week.slice(0, TAB_SIZE) },
      { key: 'near', label: 'Nearby', items: near.slice(0, TAB_SIZE) },
    ] satisfies AyTab[]
  ).filter((t) => t.items.length > 0)

  return {
    spotlight,
    supporting,
    tabs,
    defaultTab: tabs[0]?.key ?? null,
    goingWeek: yours.filter((i) => i.daysOut < 7).length,
    goingTotal: yours.length,
    picks: picks.length,
    pulse: week.slice(0, 12),
  }
}
