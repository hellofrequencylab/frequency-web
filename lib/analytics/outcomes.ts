// Program/game outcome analytics (ADR-070 Phase C). Completion + stall points per
// challenge and per Journey, plus circle health — "what's working / what isn't." Reads the
// challenge_outcomes RPC, the Journey take/finish tables, and circles directly.
// Server-only; the pure rate math is unit-tested. RPCs/circles cast (repo convention).
//
// Per-Journey completion (LIVE-687, ADR-1665). The legacy `quest_outcomes()` RPC read the
// retired action-chain engine (ADR-152 Phase B3) and is never called. The Journeys section
// reads the live spine instead: a member TOOK a Journey when they hold a
// `journey_enrollments` row for it, and FINISHED it when `lib/quest/complete.ts` wrote their
// `journey_completions` row (the canonical record, one per member, Journey and season). The
// old "qualifying weeks at or above target_weeks" derivation from practice_logs is retired
// (lib/journeys/progress.ts), so it is not rebuilt here. The stall step is the lessons an
// unfinished taker has checked off (`journey_lesson_progress`) plus one. The rollup is the
// pure `computeJourneyOutcomes` below.

import { createAdminClient } from '@/lib/supabase/admin'

export interface ChallengeOutcome {
  name: string
  difficulty: string | null
  started: number
  completed: number
  rate: number | null
}
export interface QuestOutcome {
  /** The journey_plans id (names are not unique across Journeys). */
  id: string
  name: string
  started: number
  completed: number
  rate: number | null
  avgStallStep: number | null
}
export interface CircleOutcome {
  name: string
  memberCount: number
  memberCap: number | null
  status: string | null
  fillPct: number | null
}
interface OutcomeReport {
  challenges: ChallengeOutcome[]
  quests: QuestOutcome[]
  circles: CircleOutcome[]
  circleStatus: Array<{ status: string; n: number }>
}

/** Completion % (0–100), or null when nothing started. Pure. */
export function completionRate(started: number, completed: number): number | null {
  if (started <= 0) return null
  return Math.round((completed / started) * 100)
}

/** One member holding a take of a Journey (`journey_enrollments`, solo or in a Run). */
export interface JourneyTakeRow {
  plan_id: string
  profile_id: string
}
/** One canonical finish (`journey_completions`, one per member, Journey and season). */
export interface JourneyFinishRow {
  journey_id: string
  profile_id: string
}
/** One checked-off lesson (`journey_lesson_progress`, unique per member and lesson). */
export interface JourneyLessonCheckRow {
  plan_id: string
  profile_id: string
}

/**
 * Per-Journey completion. Pure. A member counts once per Journey however many times they
 * took it (a solo take plus a Run, or a finish in two seasons). Started is everyone who took
 * or finished it, so a member who finished and then left still counts and the rate never
 * passes 100. The stall step averages (lessons checked off + 1) over the takers who have not
 * finished, to one decimal; null when everyone finished. Most-taken first.
 */
export function computeJourneyOutcomes(
  plans: ReadonlyArray<{ id: string; title: string }>,
  takes: readonly JourneyTakeRow[],
  finishes: readonly JourneyFinishRow[],
  lessonChecks: readonly JourneyLessonCheckRow[] = [],
): QuestOutcome[] {
  const takers = new Map<string, Set<string>>()
  const finishers = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, plan: string, profile: string) => {
    const set = m.get(plan) ?? new Set<string>()
    set.add(profile)
    m.set(plan, set)
  }
  for (const t of takes) add(takers, t.plan_id, t.profile_id)
  for (const f of finishes) {
    add(takers, f.journey_id, f.profile_id)
    add(finishers, f.journey_id, f.profile_id)
  }
  const checks = new Map<string, number>()
  for (const c of lessonChecks) {
    const k = `${c.plan_id}:${c.profile_id}`
    checks.set(k, (checks.get(k) ?? 0) + 1)
  }
  const titles = new Map(plans.map((p) => [p.id, p.title]))

  const out: QuestOutcome[] = []
  for (const [planId, members] of takers) {
    const name = titles.get(planId)
    if (name === undefined) continue
    const done = finishers.get(planId) ?? new Set<string>()
    const stalled = [...members].filter((m) => !done.has(m))
    const avgStallStep =
      stalled.length === 0
        ? null
        : Math.round((stalled.reduce((s, m) => s + (checks.get(`${planId}:${m}`) ?? 0) + 1, 0) / stalled.length) * 10) / 10
    out.push({
      id: planId,
      name,
      started: members.size,
      completed: done.size,
      rate: completionRate(members.size, done.size),
      avgStallStep,
    })
  }
  return out.sort((a, b) => b.started - a.started || a.name.localeCompare(b.name))
}

/** Fill % of a capacity, or null when uncapped. Pure. */
export function fillRate(count: number, cap: number | null): number | null {
  if (!cap || cap <= 0) return null
  return Math.round((count / cap) * 100)
}

type AdminDb = ReturnType<typeof createAdminClient>

const PAGE = 1000

/** Every row of a keyed read, a page at a time: PostgREST caps one response at 1,000 rows,
 *  and a silently truncated read would under-count the busiest Journey. A failed page is
 *  logged and ends the read with what landed. */
async function readAll<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) {
      console.error(`[outcomes] ${label}`, error.message)
      return out
    }
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

/** Per-Journey completion read from the live take and finish tables. */
async function readJourneyOutcomes(db: AdminDb): Promise<QuestOutcome[]> {
  const [takes, finishes] = await Promise.all([
    readAll<JourneyTakeRow>('journey_enrollments', (a, b) =>
      db.from('journey_enrollments').select('plan_id, profile_id').order('id').range(a, b),
    ),
    readAll<JourneyFinishRow>('journey_completions', (a, b) =>
      db.from('journey_completions').select('journey_id, profile_id').order('id').range(a, b),
    ),
  ])
  if (takes.length === 0 && finishes.length === 0) return []
  const [plans, lessonChecks] = await Promise.all([
    readAll<{ id: string; title: string }>('journey_plans', (a, b) =>
      db.from('journey_plans').select('id, title').order('id').range(a, b),
    ),
    readAll<JourneyLessonCheckRow>('journey_lesson_progress', (a, b) =>
      db.from('journey_lesson_progress').select('plan_id, profile_id').order('id').range(a, b),
    ),
  ])
  return computeJourneyOutcomes(plans, takes, finishes, lessonChecks)
}

export async function getOutcomeReport(db: AdminDb = createAdminClient()): Promise<OutcomeReport> {
  const [chRes, circlesRes, quests] = await Promise.all([
    db.rpc('challenge_outcomes'),
    db.from('circles').select('name, member_count, member_cap, status, is_demo').eq('is_demo', false),
    readJourneyOutcomes(db),
  ])

  const challenges = ((chRes.data ?? []) as Array<{ name: string; difficulty: string | null; started: number; completed: number }>).map((r) => ({
    name: r.name,
    difficulty: r.difficulty,
    started: Number(r.started),
    completed: Number(r.completed),
    rate: completionRate(Number(r.started), Number(r.completed)),
  }))

  const circleRows = (circlesRes.data ?? []) as Array<{ name: string; member_count: number | null; member_cap: number | null; status: string | null }>
  const circles = circleRows
    .map((c) => ({
      name: c.name,
      memberCount: c.member_count ?? 0,
      memberCap: c.member_cap,
      status: c.status,
      fillPct: fillRate(c.member_count ?? 0, c.member_cap),
    }))
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, 10)

  const statusMap = new Map<string, number>()
  for (const c of circleRows) {
    const s = c.status ?? 'unknown'
    statusMap.set(s, (statusMap.get(s) ?? 0) + 1)
  }
  const circleStatus = [...statusMap.entries()].map(([status, n]) => ({ status, n })).sort((a, b) => b.n - a.n)

  return { challenges, quests, circles, circleStatus }
}
