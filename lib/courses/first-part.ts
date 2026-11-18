// PURE: the first part of a course (its first top-level phase) with every step in reading order, for the free
// Week 1 page. Containers (phase, module) are walked, not shown; practice steps fall back to their title.
import type { JourneyPlanItem } from '@/lib/journey-plans'

interface CoursePartStep {
  id: string
  title: string
  kind: string
  minutes: number | null
  body: string
}

export interface CoursePart {
  title: string
  /** The phase's own intro line(s). */
  intro: string | null
  steps: CoursePartStep[]
}

// block_type is typed narrower than the stored values (phase and module are stored, lib/journeys/block-order.ts).
const kind = (i: JourneyPlanItem): string => (i.block_type as string | null | undefined) ?? 'practice'
const isContainer = (t: string) => t === 'phase' || t === 'module'
const bySort = (a: JourneyPlanItem, b: JourneyPlanItem) => (a.sort_order ?? 0) - (b.sort_order ?? 0)

export function firstPart(items: JourneyPlanItem[]): CoursePart | null {
  const top = items.filter((i) => !i.parent_id && kind(i) === 'phase').sort(bySort)[0]
  if (!top) return null
  const children = new Map<string, JourneyPlanItem[]>()
  for (const i of items) {
    if (!i.parent_id) continue
    const list = children.get(i.parent_id) ?? []
    list.push(i)
    children.set(i.parent_id, list)
  }
  const steps: CoursePartStep[] = []
  const walk = (id: string) => {
    for (const c of (children.get(id) ?? []).sort(bySort)) {
      if (isContainer(kind(c))) walk(c.id)
      else
        steps.push({
          id: c.id,
          title: c.title ?? c.practice?.title ?? 'Step',
          kind: kind(c),
          minutes: c.est_minutes ?? null,
          body: (c.body ?? c.note ?? c.practice?.description ?? '').trim(),
        })
    }
  }
  walk(top.id)
  if (steps.length === 0) return null
  return { title: top.title ?? 'Week 1', intro: top.body?.trim() || null, steps }
}
