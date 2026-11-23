// The part of Vera's request that is the same bytes on every turn: her tool definitions, then the
// stable half of her system prompt with the cache marker on it (ADR-1287). The provider only keeps
// a prefix that clears a minimum length, and a prefix under it is billed in full each time with no
// error, so its size has to be MEASURED, not guessed from characters. This module builds that
// prefix from the same functions the live turn calls (never a copy), and the two requests a token
// count needs. It sends nothing: scripts/vera-prefix-tokens.mjs is the hand-run reading.

import type Anthropic from '@anthropic-ai/sdk'
import { buildRequestPrefix } from '@/lib/ai/complete'
import { CACHE_MIN_TOKENS, MODELS, type ModelTier } from '@/lib/ai/models'
import { buildVeraSystem, veraTurnTools } from './agent-claude'
import { DEFAULT_VERA_CONFIG } from './config'

/** Which optional tool groups a turn offers on top of the member chat set. */
interface VeraToolAccess {
  spaceManager?: boolean
  operator?: boolean
}

/** Every tool set a turn can send. Each is its own cache entry, because tools render first. */
export const VERA_PREFIX_VARIANTS: readonly { name: string; access: VeraToolAccess }[] = [
  { name: 'member', access: {} },
  { name: 'space manager', access: { spaceManager: true } },
  { name: 'operator', access: { operator: true } },
  { name: 'operator in a Space they run', access: { spaceManager: true, operator: true } },
]

/** Pure: the cached head of a Vera turn, exactly as the loop renders it. The stable block does not
 *  depend on the member, the config or the viewer (agent-claude.test.ts pins that), so the
 *  defaults stand in for all of them. */
export function veraCachedPrefix(access: VeraToolAccess = {}): { system: Anthropic.MessageCreateParams['system']; tools?: Anthropic.Tool[] } {
  const { stable } = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
  return buildRequestPrefix({ system: { stable }, cacheSystem: true, tools: veraTurnTools(access.spaceManager === true, access.operator === true) })
}

/** The endpoint counts a whole request and needs one message, so the prefix is read as a
 *  difference: the same one-word message with the prefix and without it. */
const PROBE_MESSAGE: Anthropic.MessageParam[] = [{ role: 'user', content: 'Hi' }]

/** Pure: the two token-count requests for one variant, on the model that tier sends to. */
export function veraPrefixCountRequests(
  tier: ModelTier,
  access: VeraToolAccess = {},
): { withPrefix: Anthropic.MessageCountTokensParams; messageOnly: Anthropic.MessageCountTokensParams } {
  const model = MODELS[tier]
  return {
    withPrefix: { model, ...veraCachedPrefix(access), messages: PROBE_MESSAGE },
    messageOnly: { model, messages: PROBE_MESSAGE },
  }
}

interface VeraPrefixReading {
  tier: ModelTier
  /** Tokens the prefix adds to a request. */
  prefixTokens: number
  /** The tier's cache minimum (CACHE_MIN_TOKENS). */
  floor: number
  /** prefixTokens minus floor: negative means the prefix is too short to be cached. */
  margin: number
  cached: boolean
}

/** Pure: turn the two counts into the answer. Throws on a count that cannot be a reading, so a
 *  bad reply is never printed as a number. */
export function veraPrefixReading(tier: ModelTier, counts: { withPrefix: number; messageOnly: number }): VeraPrefixReading {
  const ok = (n: number) => Number.isSafeInteger(n) && n >= 0
  if (!ok(counts.withPrefix) || !ok(counts.messageOnly) || counts.withPrefix < counts.messageOnly) {
    throw new Error('The token counts are not a usable reading')
  }
  const prefixTokens = counts.withPrefix - counts.messageOnly
  const floor = CACHE_MIN_TOKENS[tier]
  return { tier, prefixTokens, floor, margin: prefixTokens - floor, cached: prefixTokens >= floor }
}
