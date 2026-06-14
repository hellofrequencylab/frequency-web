// Journeys v2 — the member-facing progress reader (ADR-253, ADR-252 · docs/JOURNEYS.md §4).
// The single v2 replacement for the retired season qualifying-weeks derivation
// (getActiveJourneyProgress): a member's enrolled Journeys with phase/program completion derived
// from journey_lesson_progress + the block tree (lib/journeys/tree.ts). One read powers the right
// rail "current track", the crew/journey page, member-stage signals, and the next-lesson nudges
// (vera-dispatch / journey-prompt). Server-only (admin client; journey_enrollments isn't in the
// generated types yet — same untyped-handle pattern as lib/journeys/runs.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildJourneyTree, leafTitle, type BlockRow } from './tree'

function db(): SupabaseClient {
  return createAdminClient()
}

/** One enrolled Journey with the viewer's v2 completion. The clean, minimal surface that
 *  replaces the old season JourneyProgress everywhere member-facing. */
export interface MemberJourneyProgress {
  planId: string
  slug: string
  title: string
  emoji: string | null
  accent: string | null
  /** Overall program completion (0-100), derived from the tree. */
  percent: number
  /** Phases finished vs total (the milestone cadence members feel). */
  phasesComplete: number
  phasesTotal: number
  /** Whole program complete (every required leaf done). */
  complete: boolean
  /** The next not-done lesson — the "current step" + its deep link into the player. */
  nextLesson: { id: string; title: string; href: string } | null
  /** Enrolled in a Circle Run (cohort) vs solo (run_id null). */
  inCohort: boolean
}

const BLOCK_COLS = 'id, parent_id, block_type, sort_order, title, required, est_minutes, practice_id'

function toBlock(r: Record<string, unknown>): BlockRow {
  return {
    id: String(r.id),
    parent_id: (r.parent_id as string) ?? null,
    block_type: (r.block_type as string) ?? 'practice',
    sort_order: Number(r.sort_order ?? 0),
    title: (r.title as string) ?? null,
    required: (r.required as boolean) ?? true,
    est_minutes: (r.est_minutes as number) ?? null,
    practice_id: (r.practice_id as string) || null,
  }
}

interface PlanLite {
  id: string
  slug: string
  title: string
  emoji: string | null
  accent: string | null
}

/** Distinct member ids with at least one active (not-yet-completed) Journey enrollment — the
 *  candidate set for the daily next-step prompt cron. Keeps the untyped enrollment read behind
 *  this lib (journey_enrollments isn't in the generated types yet). */
export async function listEnrolledMemberIds(): Promise<string[]> {
  const { data } = await db()
    .from('journey_enrollments')
    .select('profile_id')
    .is('completed_at', null)
  return [...new Set(((data ?? []) as { profile_id: string }[]).map((r) => r.profile_id))]
}

/**
 * A member's enrolled Journeys with v2 progress, newest enrollment first. Empty when the member
 * has no enrollment. `activeOnly` (default true) hides finished Journeys — the live "what you're
 * working on" view the rail/crew page want; pass false to include completed enrollments.
 */
export async function getMemberJourneyProgress(
  profileId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<MemberJourneyProgress[]> {
  const { activeOnly = true } = opts
  const admin = db()

  let enrollQuery = admin
    .from('journey_enrollments')
    .select('plan_id, run_id, completed_at, started_at, plan:journey_plans(id, slug, title, emoji, accent)')
    .eq('profile_id', profileId)
    .order('started_at', { ascending: false })
  if (activeOnly) enrollQuery = enrollQuery.is('completed_at', null)
  const { data: enrollRows } = await enrollQuery

  type Enrollment = { plan_id: string; run_id: string | null; plan: PlanLite | null }
  // De-dupe by plan (a member could hold both a solo + run enrollment for the same plan;
  // keep the first — newest started_at — and prefer a cohort enrollment for the badge).
  const byPlan = new Map<string, Enrollment>()
  for (const r of (enrollRows ?? []) as unknown as Enrollment[]) {
    if (!r.plan) continue
    const existing = byPlan.get(r.plan_id)
    if (!existing) byPlan.set(r.plan_id, r)
    else if (!existing.run_id && r.run_id) byPlan.set(r.plan_id, r) // prefer the cohort enrollment
  }
  const enrollments = [...byPlan.values()]
  if (enrollments.length === 0) return []

  const planIds = enrollments.map((e) => e.plan_id)

  // One read each for the block trees + the member's completed lessons across all enrolled plans.
  const [{ data: itemRows }, { data: progRows }] = await Promise.all([
    admin.from('journey_plan_items').select(BLOCK_COLS).in('plan_id', planIds),
    admin.from('journey_lesson_progress').select('plan_id, item_id').eq('profile_id', profileId).in('plan_id', planIds),
  ])

  const blocksByPlan = new Map<string, BlockRow[]>()
  for (const row of itemRows ?? []) {
    const r = row as Record<string, unknown>
    const planId = String(r.plan_id)
    const list = blocksByPlan.get(planId) ?? []
    list.push(toBlock(r))
    blocksByPlan.set(planId, list)
  }
  const doneByPlan = new Map<string, string[]>()
  for (const row of progRows ?? []) {
    const r = row as { plan_id: string; item_id: string }
    const list = doneByPlan.get(r.plan_id) ?? []
    list.push(r.item_id)
    doneByPlan.set(r.plan_id, list)
  }

  const out: MemberJourneyProgress[] = []
  for (const e of enrollments) {
    const plan = e.plan as PlanLite
    const blocks = blocksByPlan.get(e.plan_id) ?? []
    const tree = buildJourneyTree(blocks, doneByPlan.get(e.plan_id) ?? [])
    const next = tree.currentLessonId
      ? blocks.find((b) => b.id === tree.currentLessonId) ?? null
      : null
    out.push({
      planId: plan.id,
      slug: plan.slug,
      title: plan.title,
      emoji: plan.emoji,
      accent: plan.accent,
      percent: tree.percent,
      phasesComplete: tree.phases.filter((p) => p.complete).length,
      phasesTotal: tree.phases.length,
      complete: tree.complete,
      nextLesson: next
        ? { id: next.id, title: leafTitle(next.title, next.block_type), href: `/journeys/${plan.slug}/learn` }
        : null,
      inCohort: !!e.run_id,
    })
  }
  return out
}
