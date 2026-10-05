import { aiEnabledFlag, listFlagEvents } from '@/lib/platform-flags'
import { aiEnabled as envAiReady } from '@/lib/ai/client'
import { FEATURE_DAILY_CAP_USD, dailyCapFor } from '@/lib/ai/budget'
import { createAdminClient } from '@/lib/supabase/admin'

export type AiFeatureRow = { feature: string; spent: number; cap: number }
export type AiSwitchEvent = { id: string; value: boolean; source: string; createdAt: string | null; who: string }

// "AI controls" data for the /admin/ai page and the in-place Platform·AI module
// (ADR-149). Returns plain, serializable shapes (no Maps): the master-switch state,
// per-feature spend-vs-cap rows, the help-index chunk count, and the resolved switch
// audit log.
export async function getAiControlsData() {
  const [enabled, events] = await Promise.all([aiEnabledFlag(), listFlagEvents('ai_enabled', 15)])
  const envReady = envAiReady()

  const admin = createAdminClient()
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)

  // Summed in the database (ai_spend_by_feature_today, migration 20270346000800, SCAN-737): one
  // unpaged select is capped at 1,000 rows by PostgREST, so the table understated a busy day.
  // While the migration sits unapplied the RPC errors and the rows are paged with .range().
  const spend = new Map<string, number>()
  const { data: byFeature, error: rpcError } = await admin.rpc('ai_spend_by_feature_today')
  if (!rpcError && byFeature) {
    for (const r of byFeature as { feature: string; spent: number | string }[]) spend.set(r.feature, Number(r.spent))
  } else {
    const PAGE = 500
    for (let from = 0; ; from += PAGE) {
      const { data: usageRows } = await admin
        .from('ai_usage')
        .select('feature, cost_usd')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1)
      const rows = (usageRows ?? []) as { feature: string; cost_usd: number }[]
      for (const r of rows) spend.set(r.feature, (spend.get(r.feature) ?? 0) + Number(r.cost_usd))
      if (rows.length < PAGE) break
    }
  }
  const features = Array.from(new Set([...Object.keys(FEATURE_DAILY_CAP_USD), ...spend.keys()])).sort()
  const rows: AiFeatureRow[] = features.map((feature) => ({
    feature,
    spent: spend.get(feature) ?? 0,
    cap: dailyCapFor(feature),
  }))
  const totalSpend = Array.from(spend.values()).reduce((a, b) => a + b, 0)

  // "Ask Vera" retrieves from help_chunks; surface the count so an empty index
  // (the reason Vera deflects) is obvious + one-click fixable.
  const { count: helpChunks } = await admin.from('help_chunks').select('id', { count: 'exact', head: true })

  // Resolve who toggled the flag (for the audit log).
  const ids = [...new Set(events.map((e) => e.changedBy).filter((x): x is string => !!x))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data } = await admin.from('profiles').select('id, display_name').in('id', ids)
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
      names.set(p.id, p.display_name ?? 'Unknown')
    }
  }
  const switchEvents: AiSwitchEvent[] = events.map((e) => ({
    id: e.id,
    value: e.value,
    source: e.source,
    createdAt: e.createdAt,
    who: e.changedBy ? (names.get(e.changedBy) ?? 'Unknown') : 'System',
  }))

  return { enabled, envReady, rows, totalSpend, helpChunks: helpChunks ?? 0, events: switchEvents }
}
