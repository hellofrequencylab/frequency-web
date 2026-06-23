// The single AI chokepoint (ENTITY-SPACES-BUILD §B.7, Epic 0.5b, ADR-318): a thin,
// guarded wrapper around a non-streaming Claude completion. Model tiering, max_tokens
// discipline, optional system-prompt caching, optional tools / tool_choice (structured
// output), optional image content blocks (vision), optional `thinking` passthrough,
// and a bounded tool-use loop helper — so EVERY call shape in the app routes through
// here instead of touching the SDK directly. Provider stays swappable in client.ts.
//
// Two layers:
//   • completeRaw — returns the full message (content blocks + token usage), the
//     low-level seam every structured/vision/tool site uses. It does NOT record usage;
//     the caller keeps its own ledger entry (feature-tagged), so behavior is identical.
//   • completeText — the text-only convenience on top of completeRaw (unchanged API).
//   • runToolLoop — the bounded multi-round tool-use loop (Vera's live turn).
//
// All three throw AiUnavailableError when no client is configured so callers fall back
// to their deterministic path (the product never depends on AI being up).

import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS, DEFAULT_TIER, type ModelTier } from './models'
import { estimateCostUsd, type TokenUsage } from './budget'

export class AiUnavailableError extends Error {
  constructor(message = 'AI is not configured') {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

/** Message content: a plain string, or rich content blocks (text + images for
 *  vision, tool_result blocks in a loop). Mirrors the SDK's MessageParam content. */
export type CompleteMessage = {
  role: 'user' | 'assistant'
  content: Anthropic.MessageParam['content']
}

export interface CompleteParams {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  tier?: ModelTier
  maxTokens?: number
  /** Cache the (large, stable) system prompt across calls to cut input cost. */
  cacheSystem?: boolean
}

/** The widened, low-level params. Carries everything a raw messages.create call
 *  needs: tools, tool_choice, vision/tool_result content, and `thinking`. */
export interface CompleteRawParams {
  system: string
  /** Rich messages (string OR content blocks for vision / tool_result). */
  messages: CompleteMessage[]
  tier?: ModelTier
  maxTokens?: number
  /** Cache the (large, stable) system prompt across calls to cut input cost. */
  cacheSystem?: boolean
  /** Structured-output / agent tools, forwarded verbatim to the model. */
  tools?: Anthropic.Tool[]
  /** Force/allow a specific tool (e.g. `{ type: 'tool', name }`). */
  toolChoice?: Anthropic.MessageCreateParams['tool_choice']
  /** Extended-thinking config passthrough (e.g. `{ type: 'disabled' }`). */
  thinking?: Anthropic.MessageCreateParams['thinking']
}

export interface CompleteResult {
  text: string
  usage: TokenUsage
  costUsd: number
  tier: ModelTier
}

/** The full result of a raw completion: the resolved tier + model, every content
 *  block (so callers can pull a tool_use block), the concatenated text, and usage. */
export interface CompleteRawResult {
  tier: ModelTier
  model: string
  content: Anthropic.Message['content']
  text: string
  usage: TokenUsage
  costUsd: number
}

function systemParam(system: string, cache?: boolean): Anthropic.MessageCreateParams['system'] {
  return cache
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system
}

function joinText(content: Anthropic.Message['content']): string {
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/**
 * The low-level chokepoint. One non-streaming completion through the shared client,
 * carrying tools / tool_choice / vision content / thinking. Returns the full content
 * blocks + usage; the caller parses the shape it needs and records its own usage.
 */
export async function completeRaw(p: CompleteRawParams): Promise<CompleteRawResult> {
  const client = getAnthropic()
  if (!client) throw new AiUnavailableError()

  const tier = p.tier ?? DEFAULT_TIER
  const model = MODELS[tier]
  const res = await client.messages.create({
    model,
    max_tokens: p.maxTokens ?? 512,
    system: systemParam(p.system, p.cacheSystem),
    messages: p.messages,
    ...(p.tools ? { tools: p.tools } : {}),
    ...(p.toolChoice ? { tool_choice: p.toolChoice } : {}),
    ...(p.thinking ? { thinking: p.thinking } : {}),
  })

  const usage: TokenUsage = {
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  }
  return {
    tier,
    model,
    content: res.content,
    text: joinText(res.content),
    usage,
    costUsd: estimateCostUsd(tier, usage),
  }
}

/** Text-only convenience on top of completeRaw (the original API, unchanged). */
export async function completeText(p: CompleteParams): Promise<CompleteResult> {
  const res = await completeRaw({
    system: p.system,
    messages: p.messages,
    tier: p.tier,
    maxTokens: p.maxTokens,
    cacheSystem: p.cacheSystem,
  })
  return { text: res.text, usage: res.usage, costUsd: res.costUsd, tier: res.tier }
}

export interface RunToolLoopParams {
  system: string
  messages: CompleteMessage[]
  tools: Anthropic.Tool[]
  tier?: ModelTier
  maxTokens?: number
  cacheSystem?: boolean
  /** Hard cap on rounds (bounds the spiral). */
  maxRounds: number
  /**
   * Given the tool calls the model just made, return the tool_result blocks to feed
   * back. Return null/empty to stop the loop (no further round). Each call is one
   * assistant turn the loop appends before requesting the next round.
   */
  onToolCalls: (
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    round: number,
  ) => Promise<Anthropic.ToolResultBlockParam[] | null> | Anthropic.ToolResultBlockParam[] | null
}

export interface ToolLoopResult {
  /** The final content blocks the loop ended on. */
  content: Anthropic.Message['content']
  /** Concatenated assistant text across the final turn. */
  text: string
  /** Summed token usage across every round. */
  usage: TokenUsage
  /** The resolved tier + model (for the ledger). */
  tier: ModelTier
  model: string
}

/**
 * Bounded multi-round tool-use loop (Vera's live turn). Each round calls the model;
 * `onToolCalls` decides which tool_results to feed back (running reads server-side,
 * stubbing writes). The loop stops when the model makes no tool calls, when
 * onToolCalls returns null/empty, or when maxRounds is hit. Usage is summed across
 * rounds; the caller records ONE ledger entry. Throws AiUnavailableError when off.
 */
export async function runToolLoop(p: RunToolLoopParams): Promise<ToolLoopResult> {
  const client = getAnthropic()
  if (!client) throw new AiUnavailableError()

  const tier = p.tier ?? DEFAULT_TIER
  const model = MODELS[tier]
  const messages: CompleteMessage[] = [...p.messages]
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let lastContent: Anthropic.Message['content'] = []
  let lastText = ''

  for (let round = 0; round < p.maxRounds; round++) {
    const res = await client.messages.create({
      model,
      max_tokens: p.maxTokens ?? 512,
      system: systemParam(p.system, p.cacheSystem),
      tools: p.tools,
      messages,
    })
    usage.inputTokens += res.usage.input_tokens
    usage.outputTokens += res.usage.output_tokens
    lastContent = res.content

    const text = joinText(res.content)
    if (text) lastText = text

    const toolCalls = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> }))
    if (toolCalls.length === 0) break

    const results = await p.onToolCalls(toolCalls, round)
    if (!results || results.length === 0) break

    messages.push({ role: 'assistant', content: res.content })
    messages.push({ role: 'user', content: results })
  }

  return { content: lastContent, text: lastText, usage, tier, model }
}
