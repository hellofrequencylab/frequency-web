// The /courses library read. Server-only: the public Journey list, the house Space id, each course's
// shape (weeks and minutes) and which of them sell through a product. Every read is fail-safe, so a slow
// table costs a card its counts, never the page.
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { listPublicJourneys, planShapes, type JourneyPlan } from '@/lib/journey-plans'
import { log } from '@/lib/log'
import { HOUSE_SPACE_SLUG, isCourse } from './tracks'

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
}

async function houseSpaceId(): Promise<string | null> {
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

/** Frequency's courses, ready for a card, most-adopted first (the order listPublicJourneys returns). */
export async function listCourses(): Promise<CourseCard[]> {
  const [journeys, hq] = await Promise.all([listPublicJourneys(), houseSpaceId()])
  const courses: JourneyPlan[] = journeys.filter((j) => isCourse({ ...j, category: j.category ?? null }, hq))
  const ids = courses.map((c) => c.id)
  const [shapes, priced] = await Promise.all([planShapes(ids), pricedPlanIds(ids)])
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
    }
  })
}
