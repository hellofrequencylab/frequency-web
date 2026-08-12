import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

// Zaps genuinely earned THROUGH a circle — never members' personal, platform-wide
// totals. The circle "health" panel used to sum every member's current_season_zaps,
// so a freshly-claimed circle (you as the only member, no Journey/Practices adopted)
// showed YOUR own season total. This is the honest replacement: two circle-scoped
// sources, so a circle with no real activity reads zero.
//
//   1. practice_logs.zaps_awarded for logs tied to this circle (practice_logs.circle_id
//      is stamped when a member logs the circle's practice). Un-logging DELETES the row,
//      so the sum self-corrects.
//   2. zap_transactions stamped with this circle in metadata — the Expression Challenge
//      done in person at a Circle stamps { circleId } (lib/quest/expression.ts); any
//      future circle-stamped award lands here too.
//
// No double count: circle-practice logs write their zap_transactions WITHOUT a circleId
// stamp, so they are counted once (via practice_logs); Expression zaps never write a
// practice_logs row. Founding/joining bonuses (circle_start, circle_join, …) carry no
// circleId and are NOT practice logs, so they are correctly excluded — founding a circle
// is not activity earned through it.
//
// Untyped admin handle (ADR-246 service-role convention): the jsonb `metadata->>circleId`
// filter and the freshly-typed zaps_awarded column both sidestep the generated types.
// Server-only. Fail-safe: any error returns 0, so the circle page never breaks on it.

function db(): SupabaseClient {
  return createAdminClient()
}

/** Total Zaps earned through this circle (circle practice logs + Expression-at-Circle). */
export async function getCircleEarnedZaps(circleId: string): Promise<number> {
  try {
    const [logsRes, txRes] = await Promise.all([
      db().from('practice_logs').select('zaps_awarded').eq('circle_id', circleId),
      db().from('zap_transactions').select('amount').eq('metadata->>circleId', circleId),
    ])

    const fromPractices = ((logsRes.data ?? []) as { zaps_awarded: number | null }[]).reduce(
      (sum, r) => sum + Math.max(0, r.zaps_awarded ?? 0),
      0,
    )
    const fromTransactions = ((txRes.data ?? []) as { amount: number | null }[]).reduce(
      (sum, r) => sum + Math.max(0, r.amount ?? 0),
      0,
    )
    return fromPractices + fromTransactions
  } catch {
    return 0
  }
}

/**
 * The circle HEALTH signals the manager/Insight panel reads, in ONE batch beside the earned total.
 *
 * Honest, circle-scoped numbers only: "zaps earned here" is what was earned THROUGH this circle
 * (see above), never members' personal season totals; streaks + new-this-week are this circle's own
 * member activity. Lifted out of the circle page when the detail route became a shell + tabs
 * (PAGE-FRAMEWORK §3) so the Home tab reads it without reaching for the service-role client itself.
 *
 * Only ever called for a viewer who can SEE the panel — a visitor never triggers these reads.
 * Fail-safe to zeros like its neighbor: a health number is never worth breaking the page over.
 */
export async function getCircleHealth(
  circleId: string,
  memberProfileIds: string[],
  joinedSince: string,
): Promise<{ earnedZaps: number; activeStreaks: number; newThisWeek: number }> {
  try {
    const [earnedZaps, streakRes, recentRes] = await Promise.all([
      getCircleEarnedZaps(circleId),
      memberProfileIds.length > 0
        ? db().from('profiles').select('current_streak').in('id', memberProfileIds)
        : Promise.resolve({ data: [] as { current_streak: number | null }[] }),
      db()
        .from('memberships')
        .select('id')
        .eq('circle_id', circleId)
        .eq('status', 'active')
        .gte('joined_at', joinedSince),
    ])
    const activeStreaks = ((streakRes.data ?? []) as { current_streak: number | null }[]).filter(
      (p) => (p.current_streak ?? 0) > 0,
    ).length
    return { earnedZaps, activeStreaks, newThisWeek: recentRes.data?.length ?? 0 }
  } catch {
    return { earnedZaps: 0, activeStreaks: 0, newThisWeek: 0 }
  }
}
