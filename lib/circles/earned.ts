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
