// What a course page needs beyond the Journey itself: who hosts it, who teaches it, and its next Run.
// Server-only and fail-safe: a slow table costs the page a fact, never the page.
//
// A RUN is the live sessions of a course on the calendar: published, uncancelled events linked to the
// Journey through events.journey_id (an association, ADR-883), from today on. Event timestamps hold the
// host's wall clock (lib/events/end-time.ts), so a session's date is its own date part. No Run on the
// calendar: the course is self-paced, and the page says so instead of inventing dates.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import type { CourseRun } from '@/lib/jsonld'
import { HOUSE_SPACE_SLUG } from './tracks'

export interface RunSession {
  slug: string
  title: string
  startsAt: string
  endsAt: string | null
  timeZone: string | null
}

export interface CourseContext {
  /** The hosting Space, or null for a house course (Frequency is the provider). */
  provider: { name: string; slug: string } | null
  guides: { name: string; handle: string | null }[]
  /** Upcoming sessions of the next Run, in order. Empty for a self-paced course. */
  sessions: RunSession[]
}

const EMPTY: CourseContext = { provider: null, guides: [], sessions: [] }

export async function getCourseContext(plan: { id: string; space_id: string | null }): Promise<CourseContext> {
  try {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const [space, guides, events] = await Promise.all([
      plan.space_id
        ? db.from('spaces').select('slug, name').eq('id', plan.space_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from('journey_plan_guides')
        .select('sort_order, profiles:profile_id (display_name, handle)')
        .eq('plan_id', plan.id)
        .order('sort_order', { ascending: true }),
      db
        .from('events')
        .select('slug, title, starts_at, ends_at, time_zone')
        .eq('journey_id', plan.id)
        .eq('status', 'published')
        .eq('is_cancelled', false)
        .gte('starts_at', today)
        .order('starts_at', { ascending: true })
        .limit(12),
    ])
    const s = space.data as { slug: string; name: string } | null
    const g = ((guides.data ?? []) as unknown as { profiles: { display_name: string | null; handle: string | null } | null }[])
      .flatMap((r) => (r.profiles?.display_name ? [{ name: r.profiles.display_name, handle: r.profiles.handle }] : []))
    const e = ((events.data ?? []) as { slug: string; title: string; starts_at: string; ends_at: string | null; time_zone: string | null }[]).map(
      (r) => ({ slug: r.slug, title: r.title, startsAt: r.starts_at, endsAt: r.ends_at, timeZone: r.time_zone }),
    )
    return {
      provider: s && s.slug !== HOUSE_SPACE_SLUG ? { name: s.name, slug: s.slug } : null,
      guides: g,
      sessions: e,
    }
  } catch (err) {
    log.warn('courses.context_failed', { error: err instanceof Error ? err.message : String(err) })
    return EMPTY
  }
}

/** PURE: the structured-data Run from the sessions on the calendar. Null when there are none. */
export function courseRun(sessions: RunSession[]): CourseRun | null {
  if (sessions.length === 0) return null
  const first = sessions[0]!
  const last = sessions[sessions.length - 1]!
  const minutes = first.endsAt
    ? Math.max(0, Math.round((Date.parse(first.endsAt) - Date.parse(first.startsAt)) / 60000))
    : 0
  const gapDays =
    sessions.length > 1 ? Math.round((Date.parse(sessions[1]!.startsAt) - Date.parse(first.startsAt)) / 86_400_000) : 7
  return {
    startDate: first.startsAt.slice(0, 10),
    endDate: last.startsAt.slice(0, 10),
    sessions: sessions.length,
    sessionMinutes: minutes || 60,
    repeatFrequency: gapDays <= 1 ? 'Daily' : gapDays >= 28 ? 'Monthly' : 'Weekly',
  }
}
