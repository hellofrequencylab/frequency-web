import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isoDaysAgo } from '@/lib/utils'
import { circleChannelIds } from './channels'
import { circleEventScopeFilter, type CircleUpcomingEvent } from '@/lib/events/circle-upcoming'
import { meetupParts } from './meetup-when'
import { goingCountsByEvent } from '@/lib/events/going-counts'
import { seriesUpcomingFloor } from '@/lib/events/series'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'

// THE FACTS THE CIRCLE PAGE'S REDESIGN READS (the side column, the cover's live badge, the Meetups
// panel). Each loader is `cache()`d and FAIL-SAFE to the empty answer: a refused read hides its
// block, never the page. Admin client by the circle modules' convention; every caller has already
// passed the Circle's own entry gate (`canEnter`) before asking.

export interface CircleChannelChip {
  id: string
  name: string
  slug: string
  primary: boolean
}

interface CircleProfileFacts {
  /** "Tue and Fri mornings": the host's written rhythm, when they wrote one. */
  rhythm: string | null
  /** The host's written agreements ("How we do it"). */
  agreements: string[]
  /** Distinct members who logged this Circle's practice in the last 7 days. */
  hereThisWeek: number
  channels: CircleChannelChip[]
}

const WEEK_DAYS = 7

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export const loadCirclePageFacts = cache(async (circleId: string): Promise<CircleProfileFacts> => {
  const empty: CircleProfileFacts = { rhythm: null, agreements: [], hereThisWeek: 0, channels: [] }
  try {
    const admin = createAdminClient()
    const [profileRes, linksRes, logsRes, primaryRes] = await Promise.all([
      admin.from('circle_profiles').select('meetup, agreements').eq('circle_id', circleId).maybeSingle(),
      admin.from('circle_channels').select('topical_channel_id, position').eq('circle_id', circleId),
      admin
        .from('practice_logs')
        .select('profile_id')
        .eq('circle_id', circleId)
        .gte('created_at', isoDaysAgo(WEEK_DAYS))
        .limit(1000),
      admin.from('circles').select('topical_channel_id').eq('id', circleId).maybeSingle(),
    ])
    const profile = (profileRes.data ?? {}) as { meetup?: unknown; agreements?: unknown }
    const meetup = profile.meetup && typeof profile.meetup === 'object' ? (profile.meetup as Record<string, unknown>) : {}
    const agreements = Array.isArray(profile.agreements)
      ? profile.agreements.filter((a): a is string => typeof a === 'string' && a.trim().length > 0)
      : []
    const ids = circleChannelIds({
      topical_channel_id: (primaryRes.data as { topical_channel_id: string | null } | null)?.topical_channel_id ?? null,
      circle_channels: (linksRes.data ?? []) as { topical_channel_id: string; position: number }[],
    })
    let channels: CircleChannelChip[] = []
    if (ids.length > 0) {
      const { data } = await admin.from('topical_channels').select('id, name, slug').in('id', ids)
      const byId = new Map(((data ?? []) as { id: string; name: string; slug: string }[]).map((c) => [c.id, c]))
      channels = ids.flatMap((id, i) => {
        const c = byId.get(id)
        return c ? [{ id, name: c.name, slug: c.slug, primary: i === 0 }] : []
      })
    }
    const here = new Set(((logsRes.data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))
    return { rhythm: text(meetup.text), agreements, hereThisWeek: here.size, channels }
  } catch (e) {
    console.error('[circle-page-facts] read failed; the side column shows less:', e instanceof Error ? e.message : e)
    return empty
  }
})

interface MeetupFace {
  name: string
  avatarUrl: string | null
}

export interface MeetupPick {
  id: string
  slug: string
  title: string
  startsAt: string
  /** The card's pieces and the detail line, computed on the server so both renders agree. */
  weekday: string
  day: number
  time: string
  when: string
  location: string | null
  /** The event's own first line, trimmed. */
  note: string | null
  going: number
  /** Up to three going people, the viewer excluded. Empty for a visitor: names are for the roster. */
  faces: MeetupFace[]
  /** The viewer's own answer, or null. */
  mine: 'going' | 'not_going' | null
}

/** How many dates the picker offers. */
const MEETUP_PICKS = 6

function firstLine(s: string | null): string | null {
  if (!s) return null
  const line = s.replace(/\s+/g, ' ').trim()
  if (!line) return null
  return line.length > 140 ? `${line.slice(0, 137).trimEnd()}…` : line
}

/** The next dates for the Meetups panel: counts for everyone, faces and the viewer's answer on top. */
export async function loadMeetupPicks(
  events: readonly CircleUpcomingEvent[],
  viewerId: string | null,
  showFaces: boolean,
  limit: number = MEETUP_PICKS,
): Promise<MeetupPick[]> {
  const picked = events.slice(0, limit)
  const now = new Date()
  if (picked.length === 0) return []
  const ids = picked.map((e) => e.id)
  try {
    const admin = createAdminClient()
    const [counts, rsvpRes, descRes] = await Promise.all([
      goingCountsByEvent(ids),
      showFaces || viewerId
        ? admin
            .from('event_rsvps')
            .select('event_id, profile_id, status, approval_status')
            .in('event_id', ids)
            .eq('status', 'going')
            .neq('approval_status', 'pending')
            .not('profile_id', 'is', null)
            .limit(400)
        : Promise.resolve({ data: [] as unknown[] }),
      admin.from('events').select('id, description').in('id', ids),
    ])
    const going = (rsvpRes.data ?? []) as { event_id: string; profile_id: string }[]
    const mineRes = viewerId
      ? await admin.from('event_rsvps').select('event_id, status').in('event_id', ids).eq('profile_id', viewerId)
      : { data: [] as unknown[] }
    const mine = new Map(((mineRes.data ?? []) as { event_id: string; status: string }[]).map((r) => [r.event_id, r.status]))
    const others = going.filter((g) => g.profile_id !== viewerId)
    const faceProfileIds = showFaces ? [...new Set(others.map((g) => g.profile_id))].slice(0, 60) : []
    const profileRes = faceProfileIds.length
      ? await admin.from('profiles').select('id, display_name, avatar_url').in('id', faceProfileIds)
      : { data: [] as unknown[] }
    const profiles = new Map(
      ((profileRes.data ?? []) as { id: string; display_name: string; avatar_url: string | null }[]).map((p) => [p.id, p]),
    )
    const desc = new Map(((descRes.data ?? []) as { id: string; description: string | null }[]).map((d) => [d.id, d.description]))
    return picked.map((e) => {
      const faces: MeetupFace[] = showFaces
        ? others
            .filter((g) => g.event_id === e.id)
            .flatMap((g) => {
              const p = profiles.get(g.profile_id)
              return p ? [{ name: p.display_name, avatarUrl: p.avatar_url }] : []
            })
            .slice(0, 3)
        : []
      const status = mine.get(e.id)
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        startsAt: e.starts_at,
        ...meetupParts(e.starts_at, now),
        location: e.location,
        note: firstLine(desc.get(e.id) ?? null),
        going: counts[e.id] ?? 0,
        faces,
        mine: status === 'going' ? 'going' : status === 'not_going' ? 'not_going' : null,
      }
    })
  } catch (e) {
    console.error('[circle-meetups] read failed; the panel lists dates without answers:', e instanceof Error ? e.message : e)
    return picked.map((e) => ({
      id: e.id, slug: e.slug, title: e.title, startsAt: e.starts_at, ...meetupParts(e.starts_at, now), location: e.location,
      note: null, going: 0, faces: [], mine: null,
    }))
  }
}

/**
 * "You've made 9 of the last 10 mornings": the viewer's own attendance across this Circle's last
 * ten finished gatherings (the host marks the door on `event_rsvps.attended_at`). Null until there
 * are at least three to count and at least one made, so a thin history never reads as a scold.
 */
export async function loadAttendanceLine(circleId: string, viewerId: string): Promise<{ made: number; of: number } | null> {
  try {
    const filter = circleEventScopeFilter(circleId)
    if (!filter) return null
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select('id')
      .or(filter)
      .eq('status', 'published')
      .eq('is_cancelled', false)
      .is('removed_at', null)
      .lt('starts_at', seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ)))
      .order('starts_at', { ascending: false })
      .limit(10)
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
    if (ids.length < 3) return null
    const { data: rsvps } = await admin
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', ids)
      .eq('profile_id', viewerId)
      .not('attended_at', 'is', null)
    const made = (rsvps ?? []).length
    return made > 0 ? { made, of: ids.length } : null
  } catch {
    return null
  }
}
