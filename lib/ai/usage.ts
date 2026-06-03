// DB-backed governance: the operator kill switch + the usage ledger
// (docs/AI-STRATEGY.md, ADR-041/067). Layered on the env switch in client.ts.
//
// ai_usage / match_help_chunks aren't in database.types yet; per repo convention
// (see components/feed/feed-list.tsx) we cast to an untyped client for them rather
// than regenerate the whole generated types file. platform_flags IS typed.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { aiEnabled } from './client'
import { withinBudget, dailyCapFor, type TokenUsage } from './budget'

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

/** Record one AI call in the ledger. Best-effort — never throws into the caller. */
export async function recordAiUsage(input: {
  feature: string
  model: string
  usage: TokenUsage
  costUsd: number
  profileId?: string | null
}): Promise<void> {
  try {
    const admin = createAdminClient() as unknown as SupabaseClient
    await admin.from('ai_usage').insert({
      feature: input.feature,
      model: input.model,
      input_tokens: input.usage.inputTokens,
      output_tokens: input.usage.outputTokens,
      cost_usd: input.costUsd,
      profile_id: input.profileId ?? null,
    })
  } catch {
    /* the ledger is best-effort; a failed write must not break the feature */
  }
}

/** Has a feature spent past its daily cap today? Fails open=false on error. */
export async function featureOverBudget(feature: string): Promise<boolean> {
  try {
    const admin = createAdminClient() as unknown as SupabaseClient
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const { data } = await admin
      .from('ai_usage')
      .select('cost_usd')
      .eq('feature', feature)
      .gte('created_at', since.toISOString())
    const spent = ((data ?? []) as { cost_usd: number }[]).reduce((s, r) => s + Number(r.cost_usd), 0)
    return !withinBudget(spent, 0, dailyCapFor(feature))
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
    const admin = createAdminClient() as unknown as SupabaseClient
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
