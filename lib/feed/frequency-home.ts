import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyOrbit } from '@/lib/connections/resonance'
import { goingCountsByEvent } from '@/lib/events/going-counts'
import { pointFromGeog } from '@/lib/events/geo'
import { listableOnly } from '@/lib/events/market-listing'
import { viewerHidesDemo } from '@/lib/demo-preference'
import { listDueReminders } from '@/lib/connections/store'
import { getCurrentSeason } from '@/lib/seasons'
import { zapAmountForAction } from '@/lib/zaps'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { STREAK_MILESTONES } from '@/lib/streak'
import { listListings } from '@/lib/marketplace'
import {
  milesBetween,
  rankHomeEvents,
  wallNowMs,
  type HomeEventInput,
  type HomeHistory,
  type RankedHomeEvent,
} from '@/lib/feed/home-rank'

// THE FREQUENCY HOME'S READS (Member Feed: Up next, Near you, Your people's plans, Needs you,
// the Zaps breakdown). Every row here is real: events the member may see, RSVPs, their orbit,
// pending friend requests, due reach-outs, the Zap ledger. The ranking is lib/feed/home-rank.ts.
//
// FAIL-SAFE. Each read degrades its own section to empty and logs a tagged line, so a refused
// read never takes the home down and never passes silently (AGENTS.md: every fail-safe needs a
// line that notices it fired).

type Admin = ReturnType<typeof createAdminClient>

function note(section: string, error: unknown): void {
  if (!error) return
  const detail = typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error)
  console.error(`[frequency-home] ${section} read failed; that section degraded to empty:`, detail)
}

const EVENT_COLS = `id, slug, title, location, starts_at, ends_at, category, energy_tag, cover_image_path,
  geog, scope_id, scope_type, host_id, host_space_id, is_demo, theme,
  host:profiles!host_id ( display_name )`

interface EventRow {
  id: string
  slug: string
  title: string
  location: string | null
  starts_at: string
  ends_at: string | null
  category: string | null
  energy_tag: string | null
  cover_image_path: string | null
  geog: unknown
  scope_id: string | null
  scope_type: string | null
  host_id: string | null
  host_space_id: string | null
  is_demo: boolean
  theme?: unknown
  host: { display_name: string } | null
}

export interface HomePlan {
  eventId: string
  eventSlug: string
  who: string
  avatarUrl: string | null
  what: string
}

export interface HomeEvents {
  ranked: RankedHomeEvent[]
  plans: HomePlan[]
  /** Live Zap amount for a door check-in (zap_config `event_attend`). */
  doorZaps: number
}

/**
 * Upcoming events for the next seven days that the member may see: published, not cancelled,
 * public, or scoped to one of their Circles. Ranked by lib/feed/home-rank.ts.
 */
export async function loadHomeEvents(args: {
  profileId: string
  home: { lat: number; lng: number } | null
  circles: { id: string; name: string }[]
}): Promise<HomeEvents> {
  const { profileId, home, circles } = args
  const admin = createAdminClient()
  const now = new Date()
  const nowWall = wallNowMs(now, HOME_TZ)
  const from = `${dayInZone(now, HOME_TZ)}T00:00:00.000Z`
  const until = new Date(Date.parse(from) + 8 * 24 * 3_600_000).toISOString()
  const circleIds = circles.map((c) => c.id)
  const circleName = new Map(circles.map((c) => [c.id, c.name]))
  const hideDemo = await viewerHidesDemo()

  const base = () => {
    let q = admin
      .from('events')
      .select(EVENT_COLS)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .gte('starts_at', from)
      .lte('starts_at', until)
    if (hideDemo) q = q.eq('is_demo', false)
    return q
  }

  const [publicR, circleR, orbit, historyR, doorZaps] = await Promise.all([
    base().eq('visibility', 'public').order('starts_at', { ascending: true }).limit(80),
    circleIds.length > 0
      ? base().in('scope_id', circleIds).in('visibility', ['public', 'circle_only']).order('starts_at', { ascending: true }).limit(60)
      : Promise.resolve({ data: [], error: null }),
    getMyOrbit(200),
    admin
      .from('event_rsvps')
      .select('events!event_id ( host_id, host_space_id, starts_at, host:profiles!host_id ( display_name ) )')
      .eq('profile_id', profileId)
      .eq('status', 'going')
      .limit(300),
    zapAmountForAction('event_attend'),
  ])
  note('public events', publicR.error)
  note('circle events', circleR.error)
  note('attendance history', historyR.error)

  const seen = new Set<string>()
  const rows: EventRow[] = []
  const publicRows = listableOnly((publicR.data ?? []) as unknown as EventRow[])
  for (const e of [...((circleR.data ?? []) as unknown as EventRow[]), ...publicRows]) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    rows.push(e)
  }
  const ids = rows.map((e) => e.id)

  const friendIds = orbit.map((m) => m.profileId)
  const friendById = new Map(orbit.map((m) => [m.profileId, m]))
  const [counts, friendRsvpR, myRsvpR] = await Promise.all([
    goingCountsByEvent(ids),
    ids.length > 0 && friendIds.length > 0
      ? admin.from('event_rsvps').select('event_id, profile_id').in('event_id', ids).in('profile_id', friendIds.slice(0, 200)).eq('status', 'going')
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? admin.from('event_rsvps').select('event_id, status').in('event_id', ids).eq('profile_id', profileId)
      : Promise.resolve({ data: [], error: null }),
  ])
  note('friend RSVPs', friendRsvpR.error)
  note('my RSVPs', myRsvpR.error)

  const friendsByEvent = new Map<string, HomeEventInput['friends']>()
  for (const r of (friendRsvpR.data ?? []) as { event_id: string; profile_id: string }[]) {
    const m = friendById.get(r.profile_id)
    if (!m) continue
    const list = friendsByEvent.get(r.event_id) ?? []
    list.push({ id: m.profileId, name: m.displayName, avatarUrl: m.avatarUrl })
    friendsByEvent.set(r.event_id, list)
  }
  // Closest people first: the orbit is already ordered by resonance.
  const orbitRank = new Map(orbit.map((m, i) => [m.profileId, i]))
  for (const list of friendsByEvent.values()) list.sort((a, b) => (orbitRank.get(a.id) ?? 0) - (orbitRank.get(b.id) ?? 0))

  const myStatus = new Map<string, HomeEventInput['myStatus']>()
  for (const r of (myRsvpR.data ?? []) as { event_id: string; status: string }[]) {
    if (r.status === 'going' || r.status === 'waitlist') myStatus.set(r.event_id, 'going')
    else if (r.status === 'maybe') myStatus.set(r.event_id, 'maybe')
    else if (r.status === 'not_going') myStatus.set(r.event_id, 'not_going')
  }

  const inputs: HomeEventInput[] = rows.map((e) => {
    const pt = pointFromGeog(e.geog)
    const coverUrl = e.cover_image_path ? admin.storage.from('event-media').getPublicUrl(e.cover_image_path).data.publicUrl : null
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      location: e.location,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      category: e.category,
      energyTag: e.energy_tag,
      coverUrl,
      hostId: e.host_id,
      hostSpaceId: e.host_space_id,
      hostName: e.host?.display_name ?? null,
      myCircleName: e.scope_type === 'circle' && e.scope_id ? circleName.get(e.scope_id) ?? null : null,
      distanceMi: home && pt ? milesBetween(home, pt) : null,
      goingCount: counts[e.id] ?? 0,
      friends: friendsByEvent.get(e.id) ?? [],
      myStatus: myStatus.get(e.id) ?? null,
    }
  })

  const history = foldHistory(
    ((historyR.data ?? []) as unknown as { events: { host_id: string | null; host_space_id: string | null; starts_at: string; host: { display_name: string } | null } | null }[])
      .map((r) => r.events)
      .filter((e): e is NonNullable<typeof e> => !!e && Date.parse(e.starts_at) < nowWall),
  )

  const ranked = rankHomeEvents(inputs, history, nowWall)

  // Your people's plans: one card per friend, their soonest plan this week.
  const plans: HomePlan[] = []
  const planned = new Set<string>()
  const bySoonest = [...ranked].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  for (const e of bySoonest) {
    for (const f of e.friends) {
      if (planned.has(f.id)) continue
      planned.add(f.id)
      plans.push({ eventId: e.id, eventSlug: e.slug, who: f.name, avatarUrl: f.avatarUrl, what: `${e.title} · ${e.when}` })
    }
  }

  return { ranked, plans: plans.slice(0, 8), doorZaps }
}

function foldHistory(past: { host_id: string | null; host_space_id: string | null; starts_at: string; host: { display_name: string } | null }[]): HomeHistory {
  const h: HomeHistory = { hostCounts: {}, spaceCounts: {}, hostNames: {}, weekdays: [], hours: [] }
  for (const e of past) {
    if (e.host_id) {
      h.hostCounts[e.host_id] = (h.hostCounts[e.host_id] ?? 0) + 1
      if (e.host?.display_name) h.hostNames[e.host_id] = e.host.display_name
    }
    if (e.host_space_id) h.spaceCounts[e.host_space_id] = (h.spaceCounts[e.host_space_id] ?? 0) + 1
    const d = new Date(e.starts_at)
    h.weekdays.push(d.getUTCDay())
    h.hours.push(d.getUTCHours())
  }
  return h
}

// ── Needs you ────────────────────────────────────────────────────────────────

export type NeedItem =
  | { kind: 'friend'; id: string; requesterId: string; name: string; handle: string | null; avatarUrl: string | null }
  | { kind: 'reach'; id: string; contactId: string; name: string; note: string | null; dueLine: string }
  | { kind: 'lesson'; id: string; title: string; journey: string; href: string }

/** One-tap asks that are genuinely waiting on the member. Three sources, all real. */
export async function loadNeedsYou(args: {
  profileId: string
  nextLesson: { id: string; title: string; href: string; journey: string } | null
}): Promise<NeedItem[]> {
  const { profileId, nextLesson } = args
  const admin = createAdminClient()
  const [reqR, due] = await Promise.all([
    admin
      .from('friendships')
      .select('id, requested_by, user_a_id, user_b_id')
      .eq('status', 'pending')
      .or(`user_a_id.eq.${profileId},user_b_id.eq.${profileId}`)
      .neq('requested_by', profileId)
      .order('requested_at', { ascending: false })
      .limit(5),
    listDueReminders(profileId, 3),
  ])
  note('friend requests', reqR.error)

  const requests = (reqR.data ?? []) as { id: string; requested_by: string }[]
  const requesterIds = requests.map((r) => r.requested_by)
  const people = await readProfiles(admin, requesterIds)

  const items: NeedItem[] = []
  for (const r of requests) {
    const p = people.get(r.requested_by)
    if (!p) continue
    items.push({ kind: 'friend', id: `friend:${r.id}`, requesterId: r.requested_by, name: p.display_name, handle: p.handle, avatarUrl: p.avatar_url })
  }
  for (const d of due.slice(0, 3)) {
    items.push({ kind: 'reach', id: `reach:${d.id}`, contactId: d.contactId, name: d.contactName ?? 'someone', note: d.note ?? null, dueLine: dueLine(d.dueAt) })
  }
  if (nextLesson) items.push({ kind: 'lesson', id: `lesson:${nextLesson.id}`, title: nextLesson.title, journey: nextLesson.journey, href: nextLesson.href })
  return items
}

/** "You meant to reach out yesterday." in the community's calendar, so server and phone agree. */
function dueLine(iso: string): string {
  const today = Date.parse(`${dayInZone(new Date(), HOME_TZ)}T00:00:00Z`)
  const due = Date.parse(`${dayInZone(new Date(iso), HOME_TZ)}T00:00:00Z`)
  const days = Math.round((due - today) / 86_400_000)
  if (days < 0) return days === -1 ? 'You meant to reach out yesterday.' : `You meant to reach out ${-days} days ago.`
  if (days === 0) return 'You meant to reach out today.'
  return days === 1 ? 'Due tomorrow.' : `Due in ${days} days.`
}

async function readProfiles(admin: Admin, ids: string[]) {
  const out = new Map<string, { display_name: string; handle: string | null; avatar_url: string | null }>()
  if (ids.length === 0) return out
  const { data, error } = await admin.from('profiles').select('id, display_name, handle, avatar_url').in('id', ids)
  note('requester profiles', error)
  for (const p of (data ?? []) as { id: string; display_name: string; handle: string | null; avatar_url: string | null }[]) out.set(p.id, p)
  return out
}

// ── Zaps this season, by source ──────────────────────────────────────────────

export interface ZapRow {
  label: string
  zaps: number
}

/** PostgREST's max_rows, and the most pages one season's breakdown reads (20,000 rows). */
const ZAP_PAGE = 1000
const ZAP_MAX_PAGES = 20

/** The member's Zap ledger since the current season opened, folded into three sources. */
export async function loadZapBreakdown(profileId: string): Promise<ZapRow[]> {
  const season = await getCurrentSeason()
  if (!season) return []
  // PAGED: PostgREST caps a response at max_rows (1000), so an active member's season read short
  // without `.range()`. A short page is the end; a refused page logs and keeps what was read.
  const admin = createAdminClient()
  const ledger: { action_type: string | null; amount: number }[] = []
  for (let page = 0; page < ZAP_MAX_PAGES; page += 1) {
    const { data, error } = await admin
      .from('zap_transactions')
      .select('action_type, amount')
      .eq('profile_id', profileId)
      .gte('created_at', season.starts_at)
      .order('id', { ascending: true })
      .range(page * ZAP_PAGE, page * ZAP_PAGE + ZAP_PAGE - 1)
    if (error) {
      note('zap ledger', error)
      break
    }
    const rows = (data ?? []) as { action_type: string | null; amount: number }[]
    ledger.push(...rows)
    if (rows.length < ZAP_PAGE) break
  }
  const sums = { checkins: 0, practices: 0, other: 0 }
  for (const t of ledger) {
    const a = t.action_type ?? ''
    if (a === 'event_attend') sums.checkins += t.amount
    else if (a.startsWith('practice_')) sums.practices += t.amount
    else sums.other += t.amount
  }
  return [
    { label: 'Check-ins', zaps: sums.checkins },
    { label: 'Practices', zaps: sums.practices },
    { label: 'Everything else', zaps: sums.other },
  ].filter((r) => r.zaps > 0)
}

// ── Milestones (stream item) ─────────────────────────────────────────────────

export interface StreakMilestoneItem {
  profileId: string
  name: string
  handle: string
  avatarUrl: string | null
  day: number
}

/** People in the member's orbit sitting exactly on a streak checkpoint (lib/streak.ts, a week or
 *  more) who logged on the home zone's today or yesterday, so the number is fresh rather than a
 *  counter nobody has touched since. Closest people first (the orbit's own order). */
export async function loadStreakMilestones(
  orbit: { profileId: string; displayName: string; handle: string; avatarUrl: string | null }[],
): Promise<StreakMilestoneItem[]> {
  const checkpoints = STREAK_MILESTONES.map((m) => m.day).filter((d) => d >= 7)
  const ids = orbit.slice(0, 200).map((m) => m.profileId)
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const today = dayInZone(new Date(), HOME_TZ)
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const [{ data: profiles, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
    admin.from('profiles').select('id, current_streak').in('id', ids).in('current_streak', checkpoints),
    admin.from('practice_logs').select('profile_id').in('profile_id', ids).gte('logged_for', yesterday).limit(500),
  ])
  note('streak milestones', e1)
  note('recent practice logs', e2)
  const fresh = new Set(((logs ?? []) as { profile_id: string }[]).map((l) => l.profile_id))
  const day = new Map(((profiles ?? []) as { id: string; current_streak: number | null }[]).map((p) => [p.id, p.current_streak ?? 0]))
  return orbit
    .filter((m) => fresh.has(m.profileId) && (day.get(m.profileId) ?? 0) > 0)
    .map((m) => ({ profileId: m.profileId, name: m.displayName, handle: m.handle, avatarUrl: m.avatarUrl, day: day.get(m.profileId) ?? 0 }))
}

// ── Classifieds (stream item) ────────────────────────────────────────────────

export interface ClassifiedTile {
  id: string
  title: string
  image: string | null
  line: string
}

const KIND_WORD: Record<string, string> = { free: 'Free', lend: 'To lend', request: 'Wanted' }

/** The three newest active Classifieds listings, for the stream's 3-up row. */
export async function loadClassifiedTiles(hideDemo: boolean): Promise<ClassifiedTile[]> {
  try {
    const rows = await listListings({ hideDemo, limit: 3 })
    return rows.map((l) => ({
      id: l.id,
      title: l.title,
      image: l.images?.[0] ?? null,
      line: [l.price_note ?? KIND_WORD[l.kind] ?? null, l.neighborhood ?? l.city].filter(Boolean).join(' · '),
    }))
  } catch (e) {
    note('classifieds', e)
    return []
  }
}
