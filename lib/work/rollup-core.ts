// THE CONSOLE WORK ROLLUP, pure half (LIVE-2534, owner ruling 2026-11-24: "Frequency Space + Console
// rollup"). Frequency's own project work lives in the Frequency Space like any Space's; the Console
// gets one page that rolls up what needs the viewer across every Space they run. No second task
// store: the rows are the same Plans (space_plans) and to-dos (crm_tasks) the calendar writes.
//
// Pure so the shaping is tested without a database; lib/work/rollup.ts does the reads.

import type { SpacePlan, PlanStage } from '@/lib/calendar/plans'
import type { CrmTask } from '@/lib/crm/tasks-core'
import { isOverdue } from '@/lib/crm/tasks-core'
import { isPastPencil } from '@/lib/calendar/past-pencil'

export interface WorkSpace {
  id: string
  slug: string
  name: string
}

export interface WorkTodo {
  id: string
  title: string
  dueAt: string | null
  overdue: boolean
  space: WorkSpace
  planId: string | null
  planTitle: string | null
  href: string
}

interface WorkPlan {
  id: string
  title: string
  stage: PlanStage
  space: WorkSpace
  openTodos: number
  href: string
}

export interface WorkRollup {
  /** Open to-dos handed to the viewer, overdue first, then by due date, undated last. */
  mine: WorkTodo[]
  /** Open to-dos nobody has picked up yet. */
  unassigned: WorkTodo[]
  /** Live (not archived) Plans, production first, then plan, then pencil; newest touched first. */
  plans: WorkPlan[]
  counts: { mine: number; overdue: number; unassigned: number; plans: number }
  /** Pencils whose dates all passed, left out of `plans` (SCAN-1340). */
  datesPassed: number
}

const STAGE_ORDER: Record<PlanStage, number> = { production: 0, plan: 1, pencil: 2 }

/** The calendar settings deep link that opens a Plan's drawer (the same href the calendar uses). */
export function planHref(slug: string, planId: string | null): string {
  return `/spaces/${slug}/settings/calendar${planId ? `?plan=${planId}` : ''}`
}

function byDue(a: WorkTodo, b: WorkTodo): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
  if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt)
  if (a.dueAt) return -1
  if (b.dueAt) return 1
  return a.title.localeCompare(b.title)
}

/**
 * Shape one rollup from each Space's Plans and to-dos. A to-do counted twice (a shared Plan's to-do
 * read from both Spaces) is kept once. Done and snoozed to-dos, and archived Plans, are left out, and so
 * is a Pencil whose dates have all passed (SCAN-1340): it is counted in `datesPassed`, not listed.
 */
export function buildWorkRollup(
  input: readonly {
    space: WorkSpace
    plans: readonly SpacePlan[]
    tasks: readonly CrmTask[]
    /** Each Pencil Plan's dates as day keys, and the Space's today; absent = nothing folds. */
    pencilDays?: Readonly<Record<string, readonly string[]>>
    todayKey?: string
  }[],
  viewerId: string,
  now: number = Date.now(),
): WorkRollup {
  const mine: WorkTodo[] = []
  const unassigned: WorkTodo[] = []
  const plans: WorkPlan[] = []
  const seenTodo = new Set<string>()
  const seenPlan = new Set<string>()
  let datesPassed = 0

  for (const { space, plans: spacePlans, tasks, pencilDays, todayKey } of input) {
    const planTitle = new Map(spacePlans.map((p) => [p.id, p.title]))
    const openByPlan = new Map<string, number>()
    for (const t of tasks) {
      if (t.status !== 'open' || seenTodo.has(t.id)) continue
      seenTodo.add(t.id)
      if (t.planId) openByPlan.set(t.planId, (openByPlan.get(t.planId) ?? 0) + 1)
      const todo: WorkTodo = {
        id: t.id,
        title: t.title,
        dueAt: t.dueAt,
        overdue: isOverdue(t, now),
        space,
        planId: t.planId,
        planTitle: t.planId ? (planTitle.get(t.planId) ?? null) : null,
        href: planHref(space.slug, t.planId),
      }
      if (t.assigneeProfileId === viewerId) mine.push(todo)
      else if (!t.assigneeProfileId) unassigned.push(todo)
    }
    for (const p of spacePlans) {
      if (p.archivedAt || seenPlan.has(p.id)) continue
      seenPlan.add(p.id)
      if (todayKey && isPastPencil(p.stage, pencilDays?.[p.id] ?? [], todayKey)) {
        datesPassed += 1
        continue
      }
      plans.push({
        id: p.id,
        title: p.title,
        stage: p.stage,
        space,
        openTodos: openByPlan.get(p.id) ?? 0,
        href: planHref(space.slug, p.id),
      })
    }
  }

  mine.sort(byDue)
  unassigned.sort(byDue)
  plans.sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || b.openTodos - a.openTodos || a.title.localeCompare(b.title))

  return {
    mine,
    unassigned,
    plans,
    counts: {
      mine: mine.length,
      overdue: mine.filter((t) => t.overdue).length,
      unassigned: unassigned.length,
      plans: plans.length,
    },
    datesPassed,
  }
}
