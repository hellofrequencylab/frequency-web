import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { listEventsForSpace } from '@/lib/events/store'
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
  startsAt: string
  endsAt: string | null
  location: string | null
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
  /** The outline: each phase with its steps, in order. */
  phases: { title: string; steps: string[] }[]
}

export interface MwLive {
  events: MwEvent[]
  circles: MwCircle[]
  journeys: MwJourney[]
}

const EVENTS_CAP = 80
const CIRCLES_CAP = 24
const JOURNEYS_CAP = 6

export async function loadMensworkLive(spaceId: string, need: { events: boolean; circles: boolean; journeys: boolean }): Promise<MwLive> {
  const [events, circles, journeys] = await Promise.all([
    need.events ? readEvents(spaceId) : Promise.resolve([]),
    need.circles ? readCircles(spaceId) : Promise.resolve([]),
    need.journeys ? readJourneys(spaceId) : Promise.resolve([]),
  ])
  return { events, circles, journeys }
}

async function readEvents(spaceId: string): Promise<MwEvent[]> {
  try {
    const rows = await listEventsForSpace(spaceId, { limit: EVENTS_CAP, upcomingOnly: true })
    return rows
      .filter((e) => !e.is_cancelled)
      .map((e) => ({
        id: e.id,
        slug: e.slug,
        title: e.title,
        description: e.description ?? null,
        startsAt: e.starts_at,
        endsAt: e.ends_at ?? null,
        location: e.hide_address ? (e.city ?? null) : (e.location?.trim() || e.city || null),
      }))
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
      .select('id, plan_id, parent_id, block_type, title, sort_order')
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
          return { title: s(ph.title) ?? '', steps: steps.filter((t): t is string => !!t) }
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
