// Thin, guarded wrapper around a non-streaming Claude completion: model tiering,
// max_tokens discipline, optional system-prompt caching, and cost accounting.
// Throws AiUnavailableError when no client is configured so callers fall back.

import { getAnthropic } from './client'
import { MODELS, DEFAULT_TIER, type ModelTier } from './models'
import { estimateCostUsd, type TokenUsage } from './budget'

export class AiUnavailableError extends Error {
  constructor(message = 'AI is not configured') {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

export interface CompleteParams {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  tier?: ModelTier
  maxTokens?: number
  /** Cache the (large, stable) system prompt across calls to cut input cost. */
  cacheSystem?: boolean
}

export interface CompleteResult {
  text: string
  usage: TokenUsage
  costUsd: number
  tier: ModelTier
}

export async function completeText(p: CompleteParams): Promise<CompleteResult> {
  const client = getAnthropic()
  if (!client) throw new AiUnavailableError()

  const tier = p.tier ?? DEFAULT_TIER
  const res = await client.messages.create({
    model: MODELS[tier],
    max_tokens: p.maxTokens ?? 512,
    system: p.cacheSystem
      ? [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }]
      : p.system,
    messages: p.messages,
  })

  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
  const usage: TokenUsage = {
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }

  return { text, usage, costUsd: estimateCostUsd(tier, usage), tier }
}
