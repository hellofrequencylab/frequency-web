// Program/game outcome analytics (ADR-070 Phase C). Completion + stall points per
// challenge, plus circle health — "what's working / what isn't." Reads the
// challenge_outcomes RPC + circles directly. Server-only; pure rate math is
// unit-tested. RPCs/circles cast (repo convention).
//
// Journey-completion retirement (ADR-152 Phase B3 / JOURNEYS.md §13 item 8):
// the legacy `quest_outcomes()` RPC — which read the now-retired
// quest_chains/steps/progress engine — is no longer called. `quests` is kept on
// the report shape (always empty) so existing consumers keep compiling and the
// Journeys section renders its empty state. Per-Journey completion analytics for
// the journey_plans spine (qualifying-weeks ≥ target) are derived from
// practice_logs and will land on this surface in a follow-up.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ChallengeOutcome {
  name: string
  difficulty: string | null
  started: number
  completed: number
  rate: number | null
}
export interface QuestOutcome {
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
export interface OutcomeReport {
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

/** Fill % of a capacity, or null when uncapped. Pure. */
export function fillRate(count: number, cap: number | null): number | null {
  if (!cap || cap <= 0) return null
  return Math.round((count / cap) * 100)
}

export async function getOutcomeReport(): Promise<OutcomeReport> {
  const db = createAdminClient() as unknown as SupabaseClient
  const [chRes, circlesRes] = await Promise.all([
    db.rpc('challenge_outcomes'),
    db.from('circles').select('name, member_count, member_cap, status, is_demo').eq('is_demo', false),
  ])

  const challenges = ((chRes.data ?? []) as Array<{ name: string; difficulty: string | null; started: number; completed: number }>).map((r) => ({
    name: r.name,
    difficulty: r.difficulty,
    started: Number(r.started),
    completed: Number(r.completed),
    rate: completionRate(Number(r.started), Number(r.completed)),
  }))

  // The legacy quest_outcomes() RPC + its quest_chains/steps/progress engine are
  // retired (ADR-152 Phase B3). No quest-chain completion data remains, so the
  // Journeys section is intentionally empty until journey_plans-derived completion
  // analytics land. Shape preserved for consumers.
  const quests: QuestOutcome[] = []

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
