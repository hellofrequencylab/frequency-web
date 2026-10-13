import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { listEventsForSpace, listSpaceSeriesRows } from '@/lib/events/store'
import { expandSiteSeries, foldSiteEvent, siteEventZone, siteInstant, type SiteEventRow } from '@/lib/sites/site-events'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { listPublicSpaceCircles } from '@/lib/circles/store'

// THE LIVE ROWS A MENSWORK WEBSITE PAGE DRAWS (lib/sites/menswork-page.ts). Everything a visitor sees of the
// program's dates, circles and journeys is the Space's own: its published events, its listed circles (with
// the meeting line each host wrote on the circle), and its published journeys with their outline. Read with
// no viewer (the website is cached and served to everyone), through the same public readers the Space page
// uses, so nothing private or unpublished can reach a website. FAIL-SAFE: a failed read is an empty list and
// the section that needed it is simply not drawn.

export interface MwEvent {
  id: string
  slug: string
  title: string
  description: string | null
  /** The start as every site formatter reads it: the UTC parts are the wall clock (lib/time/zone.ts). On a
   *  site whose rows are true instants (`instantRows`), the stored instant folded into `timeZone`. */
  startsAt: string
  endsAt: string | null
  location: string | null
  /** The zone the wall clock is in (events.time_zone, else the Space's, else home). */
  timeZone: string | null
}

export interface MwCircle {
  id: string
  slug: string
  name: string
  about: string | null
  memberCount: number
  memberCap: number
  status: string
  imageUrl: string | null
  neighborhood: string | null
  /** The host's meeting line from the circle's profile ("Tuesdays, 6:00 PM"), or null. */
  meets: string | null
  /** The host's display name, or null. */
  host: string | null
  hostAvatar: string | null
  isSpacePrimary: boolean
}

export interface MwJourney {
  id: string
  slug: string
  title: string
  summary: string | null
  coverImage: string | null
  /** The outline: each phase with its steps, in order, and the phase's own line when it has one. */
  phases: { title: string; steps: string[]; body?: string | null }[]
}

export interface MwLive {
  events: MwEvent[]
  circles: MwCircle[]
  journeys: MwJourney[]
}

const EVENTS_CAP = 80
const CIRCLES_CAP = 24
const JOURNEYS_CAP = 6

interface MwLiveNeed {
  events: boolean
  circles: boolean
  journeys: boolean
  /** The Space's rows are TRUE INSTANTS beside their `time_zone` (the Wildheart seed writes them so,
   *  scripts/seed-wildheart.sql), not the product's wall-clock-as-UTC-parts convention: fold each start
   *  into its zone's wall clock so every site formatter prints the local time (LIVE-905). */
  instantRows?: boolean
  /** The Space's own zone (spaces.time_zone), the fallback for a row without one. */
  spaceZone?: string | null
  /** The clock, for the series expansion window and the upcoming floor (tests pass one). */
  now?: Date
}

export async function loadMensworkLive(spaceId: string, need: MwLiveNeed): Promise<MwLive> {
  const [events, circles, journeys] = await Promise.all([
    need.events ? readEvents(spaceId, need) : Promise.resolve([]),
    need.circles ? readCircles(spaceId) : Promise.resolve([]),
    need.journeys ? readJourneys(spaceId) : Promise.resolve([]),
  ])
  return { events, circles, journeys }
}

/** The site's upcoming rows plus its live series, every recurring anchor expanded through the end of next
 *  year (every Circle Night on the wheel, LIVE-905), cancelled rows dropped, soonest first. */
async function readEvents(spaceId: string, need: MwLiveNeed): Promise<MwEvent[]> {
  try {
    const now = need.now ?? new Date()
    const [upcoming, series] = await Promise.all([listEventsForSpace(spaceId, { limit: EVENTS_CAP, upcomingOnly: true }), listSpaceSeriesRows(spaceId)])
    const seen = new Set<string>()
    const rows: SiteEventRow[] = []
    for (const e of [...upcoming, ...series]) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      rows.push({
        id: e.id,
        slug: e.slug,
        title: e.title,
        startsAt: e.starts_at,
        endsAt: e.ends_at ?? null,
        timeZone: e.time_zone ?? null,
        recurrenceType: e.recurrence_type ?? null,
        recurrenceRule: e.recurrence_rule ?? null,
        recurrenceUntil: e.recurrence_until ?? null,
        parentEventId: e.parent_event_id ?? null,
        isCancelled: e.is_cancelled === true,
      })
    }
    const by = new Map(upcoming.concat(series).map((e) => [e.id, e]))
    const through = new Date(Date.UTC(now.getUTCFullYear() + 1, 11, 31, 23, 59, 59))
    // The anchors read has no date floor; the site lists what is still to come (today on, in UTC).
    const floor = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return expandSiteSeries(rows, { through, from: new Date(floor), spaceZone: need.spaceZone })
      .filter((r) => (siteInstant(r.startsAt)?.getTime() ?? floor) >= floor)
      .map((r) => {
        const src = by.get(r.parentEventId ?? r.id) ?? by.get(r.id)
        const folded = need.instantRows ? foldSiteEvent(r, need.spaceZone) : r
        return {
          id: r.id,
          slug: r.slug ?? src?.slug ?? r.id,
          title: r.title,
          description: src?.description ?? null,
          startsAt: folded.startsAt,
          endsAt: folded.endsAt ?? null,
          location: src ? (src.hide_address ? (src.city ?? null) : (src.location?.trim() || src.city || null)) : null,
          timeZone: siteEventZone(r.timeZone, need.spaceZone),
        }
      })
  } catch {
    return []
  }
}

/** The program's growth rule: no circle gets bigger than twelve, so the finder counts seats against twelve even
 *  when the stored cap is higher (a Space Circle carries 300 so paid-member enrolment never fails). */
const MW_CIRCLE_SEATS = 12

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

async function readCircles(spaceId: string): Promise<MwCircle[]> {
  try {
    const list = await listPublicSpaceCircles(spaceId, { viewerProfileId: null, limit: CIRCLES_CAP })
    // In a Menswork program the Space Circle is the primary circle, where hosts train; it leads the finder.
    const local = [...list].sort((a, b) => Number(b.is_space_primary === true) - Number(a.is_space_primary === true))
    if (local.length === 0) return []
    const admin = createAdminClient() as unknown as {
      from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => Promise<{ data: Row[] | null }> } }
    }
    const hostIds = Array.from(new Set(local.map((c) => c.host_id).filter((h): h is string => !!h)))
    const [profiles, hosts] = await Promise.all([
      admin.from('circle_profiles').select('circle_id, meetup').in('circle_id', local.map((c) => c.id)),
      hostIds.length ? admin.from('profiles').select('id, display_name, avatar_url').in('id', hostIds) : Promise.resolve({ data: [] as Row[] }),
    ])
    const meetBy = new Map((profiles.data ?? []).map((r) => [String(r.circle_id), s((r.meetup as Row | null)?.text)]))
    const hostBy = new Map((hosts.data ?? []).map((r) => [String(r.id), r]))
    return local.map((c) => {
      const h = c.host_id ? hostBy.get(c.host_id) : undefined
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        about: c.about ?? null,
        memberCount: c.member_count ?? 0,
        memberCap: Math.min(c.member_cap ?? MW_CIRCLE_SEATS, MW_CIRCLE_SEATS),
        status: c.status,
        imageUrl: c.image_url ?? null,
        neighborhood: c.neighborhood ?? null,
        meets: meetBy.get(c.id) ?? null,
        host: s(h?.display_name),
        hostAvatar: s(h?.avatar_url),
        isSpacePrimary: c.is_space_primary === true,
      }
    })
  } catch {
    return []
  }
}

async function readJourneys(spaceId: string): Promise<MwJourney[]> {
  try {
    const plans = await listJourneyPlansForSpace(spaceId, JOURNEYS_CAP, { publishedOnly: true })
    if (plans.length === 0) return []
    const admin = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => { in: (c: string, v: string[]) => { order: (c: string, o: { ascending: boolean }) => Promise<{ data: Row[] | null }> } }
      }
    }
    const { data } = await admin
      .from('journey_plan_items')
      .select('id, plan_id, parent_id, block_type, title, body, sort_order')
      .in('plan_id', plans.map((p) => p.id))
      .order('sort_order', { ascending: true })
    const items = data ?? []
    // Oldest first: the program's first journey leads.
    return [...plans].reverse().map((p) => {
      const mine = items.filter((r) => r.plan_id === p.id)
      const phases = mine
        .filter((r) => r.block_type === 'phase' && !r.parent_id)
        .map((ph) => {
          // A phase's steps: its direct children and their children (a module's lessons), in order.
          const kids = mine.filter((r) => r.parent_id === ph.id)
          const steps = kids.flatMap((k) =>
            k.block_type === 'module' ? mine.filter((r) => r.parent_id === k.id).map((r) => s(r.title)) : [s(k.title)],
          )
          return { title: s(ph.title) ?? '', steps: steps.filter((t): t is string => !!t), body: s(ph.body) }
        })
        .filter((ph) => ph.title || ph.steps.length)
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        summary: p.summary ?? null,
        coverImage: p.cover_image ?? null,
        phases,
      }
    })
  } catch {
    return []
  }
}
