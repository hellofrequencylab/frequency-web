// DB-backed governance: the operator kill switch + the usage ledger
// (docs/AI-STRATEGY.md, ADR-041/067). Layered on the env switch in client.ts.
//
// ai_usage IS in database.types (space_id included) — HYG-054, 2026-09-06: the casts and the
// "not yet in the generated types" notes below were stale by weeks, so the reads and writes here
// are now plainly typed. platform_flags is typed too.

import { log } from '@/lib/log'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { aiEnabled } from './client'
import { dailyCapFor, spaceDailyCapFor, GLOBAL_DAILY_CAP_USD, promptTokensOf, type TokenUsage } from './budget'

/** Env switch AND the operator switch (platform_flags.ai_enabled). Both must pass.
 *  Defaults to OFF on any read failure — fail closed for spend safety. */
export async function aiAvailable(): Promise<boolean> {
  if (!aiEnabled()) return false
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'ai_enabled')
      .maybeSingle()
    if (error) { log.error('ai.accounting.switch_read_failed'); return false }
    return data?.value ?? false
  } catch {
    log.error('ai.accounting.switch_read_failed')
    return false
  }
}

/** Record zero-cost embedding usage. Paid providers use accounting.ts before dispatch.
 *  `spaceId` attributes the call to a Space (space-scoped features only, e.g. the Vera
 *  co-host); omit it for global features and the column stays null. */
export async function recordAiUsage(input: {
  feature: string
  model: string
  usage: TokenUsage
  costUsd: number
  profileId?: string | null
  spaceId?: string | null
}): Promise<void> {
  try {
    if (input.costUsd !== 0) throw new Error('Paid usage requires a reserved provider attempt')
    const admin = createAdminClient()
    // `space_id` (migration 20260712020000) is in the generated Insert type, so this is a plain
    // typed insert; it used to be cast past a stale type that had not been stale for weeks.
    const row: Database['public']['Tables']['ai_usage']['Insert'] = {
      feature: input.feature,
      model: input.model,
      // The whole prompt (uncached + cache reads + cache writes), not the API's `input_tokens`, which
      // is only the uncached remainder once a prefix caches (ADR-1287). `cost_usd` already prices the
      // three parts at their multipliers, so the row's two numbers agree with each other.
      input_tokens: promptTokensOf(input.usage),
      output_tokens: input.usage.outputTokens,
      cost_usd: input.costUsd,
      profile_id: input.profileId ?? null,
      space_id: input.spaceId ?? null,
    }
    const { error } = await admin.from('ai_usage').insert(row)
    if (error) throw error
  } catch (error) {
    log.error('ai.accounting.legacy_write_failed', { feature: input.feature })
    throw error
  }
}

/** PostgREST caps every select at 1,000 rows (supabase/config.toml max_rows), silently, service
 *  role included. The page size the fallback below walks in, kept under that cap. */
const SPEND_PAGE = 500

/** Today's spend in USD, summed IN THE DATABASE through the ai_spend_today RPC (migration
 *  20270346000800, SCAN-737). A single unpaged select-and-reduce covered an arbitrary 1,000-row
 *  subset on a busy day, so the caps undercounted exactly when they mattered. While the migration
 *  sits unapplied the RPC errors and this pages the rows with .range() instead, so the sum is
 *  complete either way. Throws on invalid totals or a failed page read (the caller pauses paid work). */
async function spendToday(
  admin: ReturnType<typeof createAdminClient>,
  sinceIso: string,
  scope: { feature?: string; spaceId?: string | null },
): Promise<number> {
  const { data: viaRpc, error: rpcError } = await admin.rpc('ai_spend_today', {
    p_feature: scope.feature ?? null,
    p_space: scope.spaceId ?? null,
  })
  if (!rpcError && viaRpc != null) {
    const value = Number(viaRpc)
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid AI spend')
    return value
  }

  let total = 0
  for (let from = 0; ; from += SPEND_PAGE) {
    let q = admin
      .from('ai_usage')
      .select('cost_usd')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(from, from + SPEND_PAGE - 1)
    if (scope.feature) q = q.eq('feature', scope.feature)
    if (scope.spaceId) q = q.eq('space_id', scope.spaceId)
    const { data, error } = await q
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('AI spend page unavailable')
    const rows = data as { cost_usd: number }[]
    for (const r of rows) {
      const value = Number(r.cost_usd)
      if (!Number.isFinite(value) || value < 0) throw new Error('Invalid AI spend')
      total += value
    }
    if (rows.length < SPEND_PAGE) break
  }
  return total
}

/** Has a feature reached a daily cap? Read errors pause paid work.
 *  When `spaceId` is given, checks the global total, feature aggregate, and that Space's cap together.
 *  Admission itself is atomic in accounting.ts; this read is a cheap early fallback gate. */
export async function featureOverBudget(feature: string, spaceId?: string | null): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()

    // GLOBAL admission ceiling first: total AI spend across EVERY feature today. One safety net so a spike
    // or a runaway can never exceed GLOBAL_DAILY_CAP_USD/day regardless of the per-feature caps.
    const totalSpent = await spendToday(admin, sinceIso, {})
    if (totalSpent >= GLOBAL_DAILY_CAP_USD) return true

    // Sums only this Space's spend so the per-Space cap can't be run up by one Space. `space_id`
    // (migration 20260712020000) is in the generated column union, so the filter needs no cast.
    const aggregate = await spendToday(admin, sinceIso, { feature })
    if (aggregate >= dailyCapFor(feature)) return true
    const spent = await spendToday(admin, sinceIso, { feature, spaceId: spaceId ?? null })
    const cap = spaceId ? spaceDailyCapFor(feature) : dailyCapFor(feature)
    return spent >= cap
  } catch {
    log.error('ai.accounting.budget_read_failed', { feature })
    return true
  }
}

/** Log an Ask Vera query + its outcome (demand side of the living-docs loop:
 *  recurring deflected questions become the to-write list). Best-effort. */
export async function logHelpQuery(input: {
  question: string
  confidence: number
  answered: boolean
  deflected: boolean
  topCategory?: string | null
  topSlug?: string | null
  profileId?: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('ai_help_queries').insert({
      question: input.question.slice(0, 500),
      confidence: input.confidence,
      answered: input.answered,
      deflected: input.deflected,
      top_category: input.topCategory ?? null,
      top_slug: input.topSlug ?? null,
      profile_id: input.profileId ?? null,
    })
  } catch {
    /* logging is best-effort; never break the answer path */
  }
}
