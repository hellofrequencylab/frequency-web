// Paid provider attempts reserve before dispatch and settle before returning. No prompts are logged.
import 'server-only'
import { accountingRpc } from './accounting-rpc'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'
import { FEATURE_DAILY_CAP_USD, GLOBAL_DAILY_CAP_USD, dailyCapFor, spaceDailyCapFor, promptTokensOf, type TokenUsage } from './budget'

export interface AiAccountingContext {
  feature: string
  profileId?: string | null
  spaceId?: string | null
  /** One member turn may make several independently settled provider rounds. */
  operationId?: string
}
export class AiAccountingError extends Error {
  readonly reservationId: string
  readonly stage: string
  constructor(reservationId: string, stage: string) {
    super(`AI accounting unavailable (${stage}; reference ${reservationId}).`)
    this.name = 'AiAccountingError'
    this.reservationId = reservationId
    this.stage = stage
  }
}
function amount(value: number): boolean { return Number.isFinite(value) && value >= 0 }
export async function reserveAiAttempt(context: AiAccountingContext, model: string, quoteUsd: number): Promise<string> {
  const id = randomUUID()
  if (!context || !Object.hasOwn(FEATURE_DAILY_CAP_USD, context.feature) || !amount(quoteUsd) || quoteUsd === 0) {
    throw new AiAccountingError(id, 'invalid_quote')
  }
  try {
    const { data, error } = await accountingRpc(createAdminClient(), 'ai_reserve_attempt', {
      p_id: id, p_operation: context.operationId ?? id, p_feature: context.feature, p_model: model, p_estimate: quoteUsd,
      p_profile: context.profileId ?? null, p_space: context.spaceId ?? null,
      p_global_cap: GLOBAL_DAILY_CAP_USD, p_feature_cap: dailyCapFor(context.feature),
      p_space_cap: spaceDailyCapFor(context.feature),
    })
    if (error || data !== true) throw new AiAccountingError(id, error ? 'reserve_failed' : 'budget_or_switch')
    return id
  } catch (error) {
    log.error('ai.accounting.reserve_failed', { reservationId: id, feature: context.feature })
    throw error instanceof AiAccountingError ? error : new AiAccountingError(id, 'reserve_failed')
  }
}
export async function settleAiAttempt(id: string, usage: TokenUsage, costUsd: number): Promise<void> {
  const tokens = [usage.inputTokens, usage.outputTokens, usage.cacheReadInputTokens ?? 0, usage.cacheCreationInputTokens ?? 0]
  if (!amount(costUsd) || tokens.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    await holdAiAttempt(id, 'settle_failed')
    throw new AiAccountingError(id, 'invalid_usage')
  }
  try {
    const { data, error } = await accountingRpc(createAdminClient(), 'ai_settle_attempt', {
      p_id: id, p_input_tokens: promptTokensOf(usage), p_output_tokens: usage.outputTokens, p_actual: costUsd,
    })
    if (error || data !== true) throw new AiAccountingError(id, 'settle_failed')
  } catch {
    await holdAiAttempt(id, 'settle_failed')
    throw new AiAccountingError(id, 'settle_failed')
  }
}
export async function holdAiAttempt(id: string, reason: 'provider_failed' | 'stream_failed' | 'settle_failed'): Promise<void> {
  log.error('ai.accounting.uncertain', { reservationId: id, reason })
  try {
    const { error } = await accountingRpc(createAdminClient(), 'ai_hold_attempt', { p_id: id, p_reason: reason })
    if (error) log.error('ai.accounting.hold_failed', { reservationId: id })
  } catch { log.error('ai.accounting.hold_failed', { reservationId: id }) }
}
