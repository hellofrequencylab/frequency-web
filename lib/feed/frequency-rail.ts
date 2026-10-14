import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOnboardingStatus } from '@/lib/onboarding/status'
import { getPeopleSuggestions, suggestionReason } from '@/lib/people-suggestions'
import { isOptedOut } from '@/app/(main)/crew/leaderboard/opt-out'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { getMemberActivity, type MemberActivity } from '@/lib/practice-activity'
import { buildBoard, buildWeek, type Board, type BoardRow, type WeekDay, type WeekPlanRow } from './frequency-rail-core'

// THE FREQUENCY RIGHT RAIL'S READS (README §3). Each is request-cached so the open rail and its
// micro face, which render apart, share one read. Each is FAIL-SAFE: a refused read logs a tagged
// line and its panel draws nothing (AGENTS.md: a fail-safe needs a line that notices it fired).

function note(section: string, error: unknown): void {
  if (!error) return
  const detail = typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error)
  console.error(`[frequency-rail] ${section} read failed; that panel degraded to empty:`, detail)
}

interface RailStep {
  key: string
  label: string
  blurb: string
  cta: string
  href: string
  done: boolean
}

/** The activation checklist (lib/onboarding/status.ts), or null once it is complete. */
export const loadRailOnboarding = cache(async (profileId: string): Promise<RailStep[] | null> => {
  try {
    const s = await getOnboardingStatus(profileId)
    if (s.complete) return null
    return s.steps.map((x) => ({ key: x.key, label: x.label, blurb: x.blurb, cta: x.cta, href: x.href, done: x.done }))
  } catch (e) {
    note('onboarding', e)
    return null
  }
})

/** The member's own plans for the seven days from their today: Events they said Going to (or are
 *  waitlisted for), published and not cancelled. */
export const loadYourWeek = cache(async (profileId: string, today: string | null): Promise<WeekDay[]> => {
  const from = today ?? dayInZone(new Date(), HOME_TZ)
  const until = new Date(Date.parse(`${from}T00:00:00Z`) + 7 * 86_400_000).toISOString()
  const { data, error } = await createAdminClient()
    .from('event_rsvps')
    .select('event_id, events!inner ( id, slug, title, starts_at, status, is_cancelled )')
    .eq('profile_id', profileId)
    .in('status', ['going', 'waitlist'])
    .gte('events.starts_at', `${from}T00:00:00.000Z`)
    .lt('events.starts_at', until)
    .limit(40)
  note('your week', error)
  const rows = ((data ?? []) as unknown as {
    events: { id: string; slug: string; title: string; starts_at: string; status: string | null; is_cancelled: boolean | null } | null
  }[])
    .map((r) => r.events)
    .filter((e): e is NonNullable<typeof e> => !!e && e.status === 'published' && !e.is_cancelled)
    .map((e): WeekPlanRow => ({ eventId: e.id, slug: e.slug, title: e.title, startsAt: e.starts_at }))
  return buildWeek(from, rows)
})

/** The cooperative local board: season Zaps among the member's active Circle-mates (the Quest
 *  leaderboard's default "your Circle" scope, app/(main)/crew/leaderboard/page.tsx), honouring each
 *  member's "hide me from the board". Null without Circles or with nobody else in them. */
export const loadLocalBoard = cache(async (profileId: string): Promise<Board | null> => {
  const admin = createAdminClient()
  const { data: mine, error: e1 } = await admin.from('memberships').select('circle_id').eq('profile_id', profileId).eq('status', 'active')
  note('board circles', e1)
  const circleIds = (mine ?? []).map((m) => m.circle_id as string)
  if (circleIds.length === 0) return null
  const { data: mates, error: e2 } = await admin.from('memberships').select('profile_id').in('circle_id', circleIds).eq('status', 'active').limit(2000)
  note('board members', e2)
  const ids = [...new Set((mates ?? []).map((m) => m.profile_id as string))]
  if (ids.length < 2) return null
  const { data: profiles, error: e3 } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url, current_season_zaps, meta')
    .in('id', ids.slice(0, 500))
    .eq('is_active', true)
    .eq('is_system', false)
  note('board profiles', e3)
  const rows: BoardRow[] = ((profiles ?? []) as {
    id: string
    display_name: string | null
    avatar_url: string | null
    current_season_zaps: number | null
    meta: Record<string, unknown> | null
  }[]).map((p) => ({
    id: p.id,
    name: p.display_name ?? 'Member',
    avatarUrl: p.avatar_url,
    zaps: p.current_season_zaps ?? 0,
    optedOut: isOptedOut(p.meta),
  }))
  return buildBoard(rows, profileId)
})

interface RailPerson {
  id: string
  handle: string
  name: string
  avatarUrl: string | null
  why: string
}

/** People to know: lib/people-suggestions.ts (shared Circles and mutual connections only). */
export const loadPeopleToKnow = cache(async (profileId: string): Promise<RailPerson[]> => {
  try {
    const list = await getPeopleSuggestions(profileId, 3)
    return list.map((s) => ({ id: s.id, handle: s.handle, name: s.displayName, avatarUrl: s.avatarUrl, why: suggestionReason(s) }))
  } catch (e) {
    note('people to know', e)
    return []
  }
})

/** The member's practice activity (lib/practice-activity.ts, the read behind DAWN's "Your activity"
 *  chart) for the Stats and streaks box's sparkline. It replaces the Frequency rail's full activity
 *  chart rather than adding to it, so the rail makes this read once, not twice. Null on a refused
 *  read or when the member has no practices and no logs. */
export const loadRailActivity = cache(async (profileId: string): Promise<MemberActivity | null> => {
  try {
    const a = await getMemberActivity(profileId)
    return a.hasAny ? a : null
  } catch (e) {
    note('activity', e)
    return null
  }
})
