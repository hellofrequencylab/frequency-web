// Weekly community digest assembler.
//
// For each profile, gathers:
//   • Top 3 dispatches from their reachable audience in the last 7 days
//   • Next 7 days of events they've RSVP'd to
//   • Their highest current streak
//   • Their current season rank + zaps
//
// Returns null if there's nothing worth sending — we don't fill inboxes
// with "nothing happened" emails. The cron just skips those profiles.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RANK_LABELS, type SeasonRank } from '@/lib/season-ranks'

export type DigestDispatch = {
  id:           string
  title:        string
  excerpt:      string | null
  url:          string
  authorName:   string
}

export type DigestEvent = {
  id:        string
  title:     string
  startsAt:  string
  location:  string | null
  url:       string
}

export type DigestPayload = {
  profileId:        string
  displayName:      string
  email:            string
  dispatches:       DigestDispatch[]
  upcomingEvents:   DigestEvent[]
  topStreak:        { type: string; count: number } | null
  rank:             { name: string | null; zaps: number } | null
  /** Practices whose term completed in the last week and were not picked back up — the
   *  fresh-start re-offer (ADR-920 Phase 3): the Sunday digest lands right before Monday,
   *  the strongest re-commitment landmark. One line each, at most two. */
  goAgain:          { title: string; url: string }[]
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

// Build a digest payload for one profile. Returns null if there's nothing
// to surface (no dispatches AND no upcoming events).
export async function assembleDigestForProfile(profileId: string): Promise<DigestPayload | null> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name, auth_user_id, current_season_rank, current_season_zaps')
    .eq('id', profileId)
    .maybeSingle()

  if (!profile || !profile.auth_user_id) return null

  const { data: { user } } = await admin.auth.admin.getUserById(profile.auth_user_id)
  if (!user?.email) return null

  // ── Memberships → reach matrix ─────────────────────────────────────
  const { data: memberships } = await admin
    .from('memberships')
    .select('circle_id, circles!circle_id ( hub_id, hubs!hub_id ( nexus_id ) )')
    .eq('profile_id', profileId)
    .eq('status', 'active')

  type MembershipRow = {
    circle_id: string
    circles: { hub_id: string | null; hubs: { nexus_id: string | null } | null } | null
  }
  const mems = (memberships ?? []) as MembershipRow[]

  const circleIds = mems.map((m) => m.circle_id)
  const hubIds    = mems.map((m) => m.circles?.hub_id).filter((x): x is string => !!x)
  const nexusIds  = mems.map((m) => m.circles?.hubs?.nexus_id).filter((x): x is string => !!x)

  // Space Dispatches (ADR-858) reach a Space's ACTIVE members plus its owner
  // (who holds no space_members row), so both reads feed the id set.
  const spaceIdSet = new Set<string>()
  {
    const [{ data: sm }, { data: owned }] = await Promise.all([
      admin.from('space_members').select('space_id').eq('profile_id', profileId).eq('status', 'active'),
      admin.from('spaces').select('id').eq('owner_profile_id', profileId),
    ])
    for (const r of (sm ?? []) as { space_id: string }[]) spaceIdSet.add(r.space_id)
    for (const s of (owned ?? []) as { id: string }[]) spaceIdSet.add(s.id)
  }
  const spaceIds = [...spaceIdSet]

  // ── Recent dispatches reaching this user ───────────────────────────
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const filters: string[] = []
  if (circleIds.length)  filters.push(`and(audience_scope.eq.circle,audience_id.in.(${circleIds.join(',')}))`)
  if (hubIds.length)     filters.push(`and(audience_scope.eq.hub,audience_id.in.(${hubIds.join(',')}))`)
  if (nexusIds.length)   filters.push(`and(audience_scope.eq.nexus,audience_id.in.(${nexusIds.join(',')}))`)
  if (spaceIds.length)   filters.push(`and(audience_scope.eq.space,audience_id.in.(${spaceIds.join(',')}))`)

  let dispatches: DigestDispatch[] = []
  if (filters.length) {
    const { data: dispRaw } = await admin
      .from('dispatches')
      .select('id, title, excerpt, published_at, author:profiles!author_id ( display_name )')
      .eq('status', 'published')
      .is('hidden_at', null)
      .gte('published_at', weekAgo)
      .or(filters.join(','))
      .order('published_at', { ascending: false })
      .limit(3)

    type DispRow = {
      id: string; title: string; excerpt: string | null; published_at: string
      author: { display_name: string } | null
    }
    dispatches = ((dispRaw ?? []) as DispRow[]).map((d) => ({
      id:         d.id,
      title:      d.title,
      excerpt:    d.excerpt,
      url:        `${APP_URL}/broadcast/${d.id}`,
      authorName: d.author?.display_name ?? 'A host',
    }))
  }

  // ── Upcoming RSVP'd events in next 7 days ──────────────────────────
  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rsvps } = await admin
    .from('event_rsvps')
    .select('events!event_id ( id, title, starts_at, location, slug, is_cancelled )')
    .eq('profile_id', profileId)
    .eq('status', 'going')

  type RsvpRow = {
    events: {
      id: string; title: string; starts_at: string; location: string | null;
      slug: string; is_cancelled: boolean
    } | null
  }
  const upcomingEvents: DigestEvent[] = ((rsvps ?? []) as RsvpRow[])
    .map((r) => r.events)
    .filter((e): e is NonNullable<RsvpRow['events']> => !!e && !e.is_cancelled)
    .filter((e) => e.starts_at >= new Date().toISOString() && e.starts_at <= weekAhead)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .slice(0, 5)
    .map((e) => ({
      id:       e.id,
      title:    e.title,
      startsAt: e.starts_at,
      location: e.location,
      url:      `${APP_URL}/events/${e.slug}`,
    }))

  // ── Top streak ─────────────────────────────────────────────────────
  const { data: streaks } = await admin
    .from('streaks')
    .select('streak_type, current_count')
    .eq('profile_id', profileId)
    .gt('current_count', 0)
    .order('current_count', { ascending: false })
    .limit(1)

  type StreakRow = { streak_type: string; current_count: number }
  const topStreak = ((streaks ?? []) as StreakRow[])[0] ?? null

  // ── "Go again" — completed-term practices not yet picked back up ───
  // The fresh-start re-offer (ADR-920 Phase 3): a commitment that ran its course in the
  // last week and stayed retired gets one quiet line in the Sunday digest (which lands
  // right before Monday, the strongest re-commitment landmark). Never more than two;
  // fail-safe to none. Read through an untyped cast (the term columns are newer than the
  // generated types, ADR-246).
  let goAgain: { title: string; url: string }[] = []
  try {
    const untyped: SupabaseClient = admin
    const { data: doneRows } = await untyped
      .from('member_practices')
      .select('practice_id, retired_at, practice:practices(title, slug)')
      .eq('profile_id', profileId)
      .eq('active', false)
      .eq('retired_reason', 'completed')
      .gte('retired_at', weekAgo)
      .limit(2)
    type DoneRow = { practice_id: string; practice: { title: string; slug: string | null } | null }
    goAgain = ((doneRows ?? []) as unknown as DoneRow[])
      .filter((r) => r.practice?.title)
      .map((r) => ({
        title: r.practice!.title,
        url: `${APP_URL}/practices/${r.practice!.slug || r.practice_id}`,
      }))
  } catch {
    goAgain = []
  }

  // ── Skip if nothing to say ─────────────────────────────────────────
  if (!dispatches.length && !upcomingEvents.length && !goAgain.length) return null

  type ProfileRow = {
    id: string; display_name: string; auth_user_id: string | null
    current_season_rank: string | null; current_season_zaps: number | null
  }
  const p = profile as ProfileRow

  return {
    profileId:      p.id,
    displayName:    p.display_name,
    email:          user.email,
    dispatches,
    upcomingEvents,
    topStreak: topStreak
      ? { type: topStreak.streak_type, count: topStreak.current_count }
      : null,
    rank: p.current_season_rank
      ? {
          name: RANK_LABELS[p.current_season_rank as SeasonRank] ?? p.current_season_rank,
          zaps: p.current_season_zaps ?? 0,
        }
      : null,
    goAgain,
  }
}

// Returns active profile IDs (anyone with at least one active membership).
// Drives the cron loop.
export async function listProfileIdsForDigest(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('memberships')
    .select('profile_id')
    .eq('status', 'active')

  const ids = new Set<string>()
  for (const row of (data ?? []) as { profile_id: string }[]) {
    ids.add(row.profile_id)
  }
  return Array.from(ids)
}
