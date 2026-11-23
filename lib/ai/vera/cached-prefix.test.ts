import { afterEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

const loop = vi.hoisted(() => ({ calls: [] as { system: unknown; tools?: unknown; cacheSystem?: boolean }[] }))

vi.mock('@/lib/ai', () => ({ aiEnabled: () => true }))
vi.mock('@/lib/ai/usage', () => ({ aiAvailable: async () => true, featureOverBudget: async () => false }))
vi.mock('@/lib/ai/rate-limit', () => ({ aiRateLimited: async () => false }))
vi.mock('./usage-gate', () => ({ veraDailyCapReached: async () => false }))
vi.mock('./config', async (original) => {
  const real = await original<typeof import('./config')>()
  return { ...real, getVeraConfig: async () => ({ ...real.DEFAULT_VERA_CONFIG, register: 'hot' as const }) }
})
vi.mock('@/lib/ai/complete', async (original) => {
  const real = await original<typeof import('@/lib/ai/complete')>()
  return {
    ...real,
    runToolLoop: async (p: { system: unknown; tools?: unknown; cacheSystem?: boolean }) => {
      loop.calls.push(p)
      return { text: 'Hello.', model: 'synthetic', rounds: 1, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 }
    },
  }
})

import { buildRequestPrefix, type SystemPrompt } from '@/lib/ai/complete'
import { CACHE_MIN_TOKENS, MODELS } from '@/lib/ai/models'
import { runVeraClaudeTurn } from './agent-claude'
import { VERA_PREFIX_VARIANTS, veraCachedPrefix, veraPrefixCountRequests, veraPrefixReading } from './cached-prefix'

const bytes = (access?: Parameters<typeof veraCachedPrefix>[0]) => JSON.stringify(veraCachedPrefix(access))
const systemBlocks = (access?: Parameters<typeof veraCachedPrefix>[0]) => veraCachedPrefix(access).system as Anthropic.TextBlockParam[]

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  loop.calls.length = 0
})

describe('veraCachedPrefix is deterministic', () => {
  it('gives byte-identical output for the same inputs, at any time and with any random source', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const first = VERA_PREFIX_VARIANTS.map((v) => bytes(v.access))
    vi.setSystemTime(new Date('2031-07-19T13:37:42Z'))
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const second = VERA_PREFIX_VARIANTS.map((v) => bytes(v.access))
    expect(second).toEqual(first)
  })

  it('carries no date, clock time or generated id', () => {
    for (const v of VERA_PREFIX_VARIANTS) {
      const text = bytes(v.access)
      expect(text).not.toMatch(/\b20\d\d-\d\d-\d\d\b/)
      expect(text).not.toMatch(/\b\d{1,2}:\d\d:\d\d\b/)
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    }
  })

  it('is one marked system block after the tools, and each tool set is its own prefix', () => {
    for (const v of VERA_PREFIX_VARIANTS) {
      const blocks = systemBlocks(v.access)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' })
      expect(Object.keys(veraCachedPrefix(v.access))).toEqual(['system', 'tools'])
    }
    expect(new Set(VERA_PREFIX_VARIANTS.map((v) => bytes(v.access))).size).toBe(VERA_PREFIX_VARIANTS.length)
    expect(bytes()).toBe(bytes({}))
  })
})

describe('veraCachedPrefix is what the live turn sends', () => {
  const turn = { history: [], memberText: 'Hi', profileId: 'p1' }

  async function sent(input: Parameters<typeof runVeraClaudeTurn>[0]) {
    await runVeraClaudeTurn(input)
    expect(loop.calls).toHaveLength(1)
    const call = loop.calls[0]
    expect(call.cacheSystem).toBe(true)
    return buildRequestPrefix({ system: call.system as SystemPrompt, cacheSystem: call.cacheSystem, tools: call.tools as Anthropic.Tool[] })
  }

  it('a member turn: same tools, and the same marked block at the head of the system prompt', async () => {
    const live = await sent({ ...turn, supportSummary: 'two open tickets' })
    const prefix = veraCachedPrefix()
    expect(JSON.stringify(live.tools)).toBe(JSON.stringify(prefix.tools))
    const blocks = live.system as Anthropic.TextBlockParam[]
    expect(JSON.stringify(blocks[0])).toBe(JSON.stringify(systemBlocks()[0]))
    // What follows the marked block is this conversation's, and is not marked.
    expect(blocks.slice(1).every((b) => !b.cache_control)).toBe(true)
  })

  it('a Space manager and an operator turn match their variants', async () => {
    const manager = await sent({ ...turn, spaceGuide: 'You may call set_space_feature here.' })
    expect(JSON.stringify(manager.tools)).toBe(JSON.stringify(veraCachedPrefix({ spaceManager: true }).tools))
    loop.calls.length = 0
    const operator = await sent({ ...turn, viewer: { isOperator: true, roleLabel: 'janitor' }, adminLookup: async () => '' })
    expect(JSON.stringify(operator.tools)).toBe(JSON.stringify(veraCachedPrefix({ operator: true }).tools))
    expect(JSON.stringify((operator.system as Anthropic.TextBlockParam[])[0])).toBe(JSON.stringify(systemBlocks({ operator: true })[0]))
  })
})

describe('the token count requests and the reading', () => {
  it('counts the prefix on the model the tier sends to, against the same message alone', () => {
    const { withPrefix, messageOnly } = veraPrefixCountRequests('haiku', { operator: true })
    expect(withPrefix.model).toBe(MODELS.haiku)
    expect(messageOnly.model).toBe(MODELS.haiku)
    expect(JSON.stringify({ system: withPrefix.system, tools: withPrefix.tools })).toBe(bytes({ operator: true }))
    expect(withPrefix.messages).toEqual(messageOnly.messages)
    expect(Object.keys(messageOnly).sort()).toEqual(['messages', 'model'])
    expect(veraPrefixCountRequests('sonnet').withPrefix.model).toBe(MODELS.sonnet)
  })

  it('reads the difference against the tier minimum', () => {
    const floor = CACHE_MIN_TOKENS.haiku
    expect(veraPrefixReading('haiku', { withPrefix: floor + 8, messageOnly: 8 })).toEqual({ tier: 'haiku', prefixTokens: floor, floor, margin: 0, cached: true })
    expect(veraPrefixReading('haiku', { withPrefix: floor + 7, messageOnly: 8 })).toMatchObject({ margin: -1, cached: false })
    expect(veraPrefixReading('sonnet', { withPrefix: floor + 7, messageOnly: 8 }).cached).toBe(true)
  })

  it('refuses a reply that is not a count', () => {
    expect(() => veraPrefixReading('haiku', { withPrefix: Number.NaN, messageOnly: 8 })).toThrow()
    expect(() => veraPrefixReading('haiku', { withPrefix: 5, messageOnly: 8 })).toThrow()
    expect(() => veraPrefixReading('haiku', { withPrefix: -1, messageOnly: -2 })).toThrow()
  })
})
