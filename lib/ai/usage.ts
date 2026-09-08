// DB-backed governance: the operator kill switch + the usage ledger
// (docs/AI-STRATEGY.md, ADR-041/067). Layered on the env switch in client.ts.
//
// ai_usage IS in database.types (space_id included) — HYG-054, 2026-09-06: the casts and the
// "not yet in the generated types" notes below were stale by weeks, so the reads and writes here
// are now plainly typed. platform_flags is typed too.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/database.types'
import { aiEnabled } from './client'
import { withinBudget, dailyCapFor, spaceDailyCapFor, GLOBAL_DAILY_CAP_USD, promptTokensOf, type TokenUsage } from './budget'

/** Env switch AND the operator switch (platform_flags.ai_enabled). Both must pass.
 *  Defaults to OFF on any read failure — fail closed for spend safety. */
export async function aiAvailable(): Promise<boolean> {
  if (!aiEnabled()) return false
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('platform_flags')
      .select('value')
      .eq('key', 'ai_enabled')
      .maybeSingle()
    return data?.value ?? false
  } catch {
    return false
  }
}

/** Record one AI call in the ledger. Best-effort: never throws into the caller.
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
    await admin.from('ai_usage').insert(row)
  } catch {
    /* the ledger is best-effort; a failed write must not break the feature */
  }
}

/** Has a feature spent past its daily cap today? Fails open=false on error.
 *  When `spaceId` is given, checks the PER-SPACE cap (spend filtered to that Space) so one
 *  Space can't run up the whole feature's bill. Omit `spaceId` to check the global feature cap
 *  (the back-compat path every existing caller takes). */
export async function featureOverBudget(feature: string, spaceId?: string | null): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const sinceIso = since.toISOString()

    // GLOBAL hard ceiling first: total AI spend across EVERY feature today. One safety net so a spike
    // or a runaway can never exceed GLOBAL_DAILY_CAP_USD/day regardless of the per-feature caps.
    const { data: allToday } = await admin.from('ai_usage').select('cost_usd').gte('created_at', sinceIso)
    const totalSpent = ((allToday ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd), 0)
    if (!withinBudget(totalSpent, 0, GLOBAL_DAILY_CAP_USD)) return true

    const query = admin
      .from('ai_usage')
      .select('cost_usd')
      .eq('feature', feature)
      .gte('created_at', sinceIso)
    // Sums only this Space's spend so the per-Space cap can't be run up by one Space. `space_id`
    // (migration 20260712020000) is in the generated column union, so the filter needs no cast.
    const scoped = spaceId ? query.eq('space_id', spaceId) : query
    const { data } = await scoped
    const spent = ((data ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd), 0)
    const cap = spaceId ? spaceDailyCapFor(feature) : dailyCapFor(feature)
    return !withinBudget(spent, 0, cap)
  } catch {
    return false
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
