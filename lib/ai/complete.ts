// The single AI chokepoint (ENTITY-SPACES-BUILD §B.7, Epic 0.5b, ADR-318): a thin,
// guarded wrapper around one model completion. Model tiering, max_tokens discipline,
// system-prompt caching, optional tools / tool_choice (structured output), optional image
// content blocks (vision), optional `thinking` passthrough, and a bounded tool-use loop
// helper — so EVERY call shape in the app routes through here instead of touching the SDK
// directly. Provider stays swappable in client.ts.
//
// Three layers:
//   • completeRaw — returns the full message (content blocks + token usage), the
//     low-level seam every structured/vision/tool site uses. It does NOT record usage;
//     the caller keeps its own ledger entry (feature-tagged), so behavior is identical.
//   • completeText — the text-only convenience on top of completeRaw (unchanged API).
//   • runToolLoop — the bounded multi-round tool-use loop (Vera's live turn). Streams when
//     the caller hands it `onText`; a whole-document generation path leaves that off.
//
// All three throw AiUnavailableError when no client is configured so callers fall back
// to their deterministic path (the product never depends on AI being up).
//
// CACHING (ADR-041's rule, wired in ADR-1287). The request prefix renders tools → system →
// messages, and a `cache_control` marker on the LAST system block caches everything before it.
// So a caller splits its system prompt into a `stable` half (voice primer + persona: identical
// bytes for every member, every round) and a `volatile` half (this member's facts, the operator's
// knobs), and `buildRequestPrefix` marks only the stable block. The loop builds that prefix ONCE
// and reuses the same object every round, which is what keeps it byte-stable; the test in
// complete.test.ts pins both facts. Usage carries the cache read/write counts so the ledger and
// the cost estimate see what actually happened rather than the uncached remainder.

import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from './client'
import { MODELS, DEFAULT_TIER, type ModelTier } from './models'
import { addUsage, estimateCostUsd, type TokenUsage } from './budget'

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

/**
 * A system prompt is a plain string, or a two-part prompt for a path that caches: `stable` is the
 * byte-identical prefix (voice primer, persona, contracts) and `volatile` is what changes per
 * request (this member's facts, operator knobs). Only the stable half is marked for caching, and it
 * always renders FIRST, because a cache is a prefix match and one changed byte ahead of the marker
 * invalidates everything behind it.
 */
export type SystemPrompt = string | { stable: string; volatile?: string }

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
  system: SystemPrompt
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

function systemParam(system: SystemPrompt, cache?: boolean): Anthropic.MessageCreateParams['system'] {
  if (typeof system === 'string') {
    return cache ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system
  }
  const blocks: Anthropic.TextBlockParam[] = [
    cache ? { type: 'text', text: system.stable, cache_control: { type: 'ephemeral' } } : { type: 'text', text: system.stable },
  ]
  if (system.volatile) blocks.push({ type: 'text', text: system.volatile })
  return blocks
}

/** The cacheable head of a request: tools, then the system blocks, in the order the API renders
 *  them. Pure, so a test can prove (a) the marker sits on the stable block and never on the volatile
 *  one and (b) two rounds produce identical bytes. The loop calls this once per turn, not per round. */
export function buildRequestPrefix(p: {
  system: SystemPrompt
  cacheSystem?: boolean
  tools?: Anthropic.Tool[]
}): { system: Anthropic.MessageCreateParams['system']; tools?: Anthropic.Tool[] } {
  return {
    system: systemParam(p.system, p.cacheSystem),
    ...(p.tools ? { tools: p.tools } : {}),
  }
}

function joinText(content: Anthropic.Message['content']): string {
  return content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim()
}

/** The SDK's usage object as the ledger's shape, cache counts included. The API reports the
 *  cache fields as numbers on every current model (null only on shapes this app never sends), so
 *  a missing field reads as zero rather than dropping the whole count. */
export function usageOf(u: Anthropic.Message['usage']): TokenUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
  }
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
    ...buildRequestPrefix({ system: p.system, cacheSystem: p.cacheSystem, tools: p.tools }),
    messages: p.messages,
    ...(p.toolChoice ? { tool_choice: p.toolChoice } : {}),
    ...(p.thinking ? { thinking: p.thinking } : {}),
  })

  const usage = usageOf(res.usage)
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
  system: SystemPrompt
  messages: CompleteMessage[]
  tools: Anthropic.Tool[]
  tier?: ModelTier
  maxTokens?: number
  cacheSystem?: boolean
  /** Hard cap on rounds (bounds the spiral). */
  maxRounds: number
  /**
   * Stream the assistant's text as it is generated. When set, each round runs through the SDK's
   * streaming API and every text delta is handed here with the round it belongs to (a later round
   * starts a new reply, so a consumer resets on a round change). Usage is still read from the
   * FINAL message of each round, so the ledger sees exactly what a blocking call would have.
   * Leave it off for a whole-document generation; that path is unchanged.
   */
  onText?: (delta: string, round: number) => void
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
  let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 }
  let lastContent: Anthropic.Message['content'] = []
  let lastText = ''

  // Built ONCE per turn and spread into every round unchanged: the same object, the same bytes.
  // Rebuilding it per round is how the prefix used to drift (ADR-1287).
  const prefix = buildRequestPrefix({ system: p.system, cacheSystem: p.cacheSystem, tools: p.tools })

  for (let round = 0; round < p.maxRounds; round++) {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: p.maxTokens ?? 512,
      ...prefix,
      messages,
    }
    let res: Anthropic.Message
    if (p.onText) {
      const onText = p.onText
      const stream = client.messages.stream(params)
      stream.on('text', (delta) => onText(delta, round))
      // finalMessage() resolves with the whole message once the stream ends (errors reject), so
      // usage and the tool_use blocks come from the same place they would on a blocking call.
      res = await stream.finalMessage()
    } else {
      res = await client.messages.create(params)
    }
    usage = addUsage(usage, usageOf(res.usage))
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
