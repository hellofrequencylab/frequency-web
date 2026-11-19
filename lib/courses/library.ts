// The /courses library read. Server-only: the public Journey list, the house Space id, each course's
// shape (weeks and minutes) and which of them sell through a product. Every read is fail-safe, so a slow
// table costs a card its counts, never the page.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPublicJourneys, planShapes, type JourneyPlan } from '@/lib/journey-plans'
import { log } from '@/lib/log'
import { HOUSE_SPACE_SLUG, isCourse, offersCertified } from './tracks'

export interface CourseCard {
  slug: string
  title: string
  summary: string | null
  category: string | null
  cover: string | null
  /** Weekly Phases (the course's weeks or parts). 0 when the plan has none mapped. */
  weeks: number
  /** Summed lesson minutes. 0 when no lesson carries a time. */
  minutes: number
  /** True unless an active product sells this Journey. */
  free: boolean
  /** Completion issues a certificate. */
  certificate: boolean
  /** The first session of the next Run on the calendar (wall-clock ISO), or null: self-paced. */
  nextRun: string | null
}

export async function houseSpaceId(): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('spaces').select('id').eq('slug', HOUSE_SPACE_SLUG).maybeSingle()
    return (data as { id: string } | null)?.id ?? null
  } catch (err) {
    log.warn('courses.house_space_failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** The Journey ids an active product sells. A course in this set is priced, so its card does not say Free. */
async function pricedPlanIds(planIds: string[]): Promise<Set<string>> {
  if (planIds.length === 0) return new Set()
  try {
    const { data } = await createAdminClient()
      .from('commerce_products')
      .select('journey_plan_id')
      .in('journey_plan_id', planIds)
      .eq('status', 'active')
    return new Set(((data as { journey_plan_id: string | null }[] | null) ?? []).flatMap((r) => (r.journey_plan_id ? [r.journey_plan_id] : [])))
  } catch (err) {
    log.warn('courses.priced_failed', { error: err instanceof Error ? err.message : String(err) })
    return new Set()
  }
}

/** The first upcoming session per Journey, from events linked by journey_id (a Run on the calendar). */
async function nextRuns(planIds: string[]): Promise<Map<string, string>> {
  if (planIds.length === 0) return new Map()
  try {
    const { data } = await createAdminClient()
      .from('events')
      .select('journey_id, starts_at')
      .in('journey_id', planIds)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .eq('is_cancelled', false)
      .gte('starts_at', new Date().toISOString().slice(0, 10))
      .order('starts_at', { ascending: true })
    const out = new Map<string, string>()
    for (const r of (data as { journey_id: string | null; starts_at: string }[] | null) ?? []) {
      if (r.journey_id && !out.has(r.journey_id)) out.set(r.journey_id, r.starts_at)
    }
    return out
  } catch (err) {
    log.warn('courses.next_runs_failed', { error: err instanceof Error ? err.message : String(err) })
    return new Map()
  }
}

/** Frequency's courses, ready for a card, most-adopted first (the order listPublicJourneys returns). */
export async function listCourses(): Promise<CourseCard[]> {
  const [journeys, hq] = await Promise.all([listPublicJourneys(), houseSpaceId()])
  const courses: JourneyPlan[] = journeys.filter((j) => isCourse({ ...j, category: j.category ?? null }, hq))
  const ids = courses.map((c) => c.id)
  const [shapes, priced, runs] = await Promise.all([planShapes(ids), pricedPlanIds(ids), nextRuns(ids)])
  return courses.map((c) => {
    const shape = shapes.get(c.id)
    return {
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      category: c.category ?? null,
      cover: c.cover_image,
      weeks: shape?.phaseCount ?? 0,
      minutes: shape?.minutes ?? 0,
      free: !priced.has(c.id),
      certificate: Boolean(c.certificate_enabled) || runs.has(c.id) || offersCertified(c.slug),
      nextRun: runs.get(c.id) ?? null,
    }
  })
}

/** Is this public Journey one of Frequency's courses? One read of the house Space id. */
export async function isFrequencyCourse(plan: JourneyPlan): Promise<boolean> {
  return isCourse({ ...plan, category: plan.category ?? null }, await houseSpaceId())
}
