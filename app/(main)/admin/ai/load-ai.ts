import { accountingRpc } from '@/lib/ai/accounting-rpc'
import { log } from '@/lib/log'
import { aiEnabledFlag, listFlagEvents } from '@/lib/platform-flags'
import { aiEnabled as envAiReady } from '@/lib/ai/client'
import { FEATURE_DAILY_CAP_USD, dailyCapFor } from '@/lib/ai/budget'
import { createAdminClient } from '@/lib/supabase/admin'

export type AiFeatureRow = { feature: string; spent: number; reserved: number; uncertain: number; pendingIds: string[]; cap: number }
export type AiSwitchEvent = { id: string; value: boolean; source: string; createdAt: string | null; who: string }

// "AI controls" data for the /admin/ai page and the in-place Platform·AI module
// (ADR-149). Returns plain, serializable shapes (no Maps): the master-switch state,
// per-feature spend-vs-cap rows, the help-index chunk count, and the resolved switch
// audit log.
export async function getAiControlsData() {
  const [enabled, events] = await Promise.all([aiEnabledFlag(), listFlagEvents('ai_enabled', 15)])
  const envReady = envAiReady()

  const admin = createAdminClient()
  let accountingAvailable = true
  const costs = new Map<string, { spent: number; reserved: number; uncertain: number; pendingIds: string[] }>()
  try {
    const { data, error } = await accountingRpc(admin, 'ai_budget_status_today', undefined)
    if (error || !Array.isArray(data)) throw new Error('AI accounting read unavailable')
    for (const row of data) {
      if ([row.spent, row.reserved, row.uncertain].some((value) => value === null || value === undefined)) throw new Error('Missing AI accounting totals')
      const spent = Number(row.spent), reserved = Number(row.reserved), uncertain = Number(row.uncertain)
      if ([spent, reserved, uncertain].some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Invalid AI accounting totals')
      costs.set(row.feature, { spent, reserved, uncertain, pendingIds: row.pending_ids ?? [] })
    }
  } catch {
    accountingAvailable = false
    costs.clear()
    log.error('ai.accounting.operator_read_failed')
  }
  const features = Array.from(new Set([...Object.keys(FEATURE_DAILY_CAP_USD), ...costs.keys()])).sort()
  const rows: AiFeatureRow[] = accountingAvailable ? features.map((feature) => ({
    feature, ...(costs.get(feature) ?? { spent: 0, reserved: 0, uncertain: 0, pendingIds: [] }), cap: dailyCapFor(feature),
  })) : []
  const totalSpend = accountingAvailable ? rows.reduce((sum, row) => sum + row.spent, 0) : null

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

  return { enabled, envReady, rows, totalSpend, accountingAvailable, helpChunks: helpChunks ?? 0, events: switchEvents }
}
