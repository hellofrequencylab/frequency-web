import { describe, it, expect, vi, beforeEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

// The chokepoint's request shape (ADR-1287, PROG-E8). Three things are pinned here:
//   1. the CACHE PREFIX: the stable half of a two-part system prompt carries the marker, the
//      volatile half never does, and the volatile half renders AFTER the stable one;
//   2. BYTE STABILITY across rounds of the tool loop: the prefix object handed to the SDK on
//      round two is the same bytes as round one (a rebuilt prefix is how the cache used to miss);
//   3. STREAMING: with `onText` the loop uses the SDK's stream, deltas reach the callback, and
//      usage still comes from the final message, cache counts included.

interface Recorded {
  create: Anthropic.MessageCreateParams[]
  stream: Anthropic.MessageCreateParams[]
}

const recorded = vi.hoisted((): Recorded => ({ create: [], stream: [] }))
const script = vi.hoisted(() => ({ replies: [] as Anthropic.Message[], clientOff: false }))

function reply(content: Anthropic.Message['content'], usage: Partial<Anthropic.Message['usage']> = {}): Anthropic.Message {
  return {
    id: 'msg',
    type: 'message',
    role: 'assistant',
    model: 'm',
    content,
    stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
      ...usage,
    } as Anthropic.Message['usage'],
  } as Anthropic.Message
}

vi.mock('./client', () => ({
  aiEnabled: () => true,
  getAnthropic: () => {
    if (script.clientOff) return null
    return {
      messages: {
        create: vi.fn(async (params: Anthropic.MessageCreateParams) => {
          recorded.create.push(JSON.parse(JSON.stringify(params)))
          return script.replies.shift() ?? reply([{ type: 'text', text: '', citations: null }])
        }),
        stream: vi.fn((params: Anthropic.MessageCreateParams) => {
          recorded.stream.push(JSON.parse(JSON.stringify(params)))
          const final = script.replies.shift() ?? reply([{ type: 'text', text: '', citations: null }])
          const listeners: Array<(delta: string, snapshot: string) => void> = []
          return {
            on(event: string, fn: (delta: string, snapshot: string) => void) {
              if (event === 'text') listeners.push(fn)
              return this
            },
            async finalMessage() {
              // Play the final text back as three deltas before resolving, as the SDK would.
              const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
              const third = Math.ceil(text.length / 3) || 1
              for (let i = 0; i < text.length; i += third) {
                for (const fn of listeners) fn(text.slice(i, i + third), text.slice(0, i + third))
              }
              return final
            },
          }
        }),
      },
    }
  },
}))

import { buildRequestPrefix, completeRaw, runToolLoop, usageOf, AiUnavailableError } from './complete'

const TOOLS: Anthropic.Tool[] = [
  { name: 'suggest_circle', description: 'Find a circle', input_schema: { type: 'object', properties: { q: { type: 'string' } } } },
]

beforeEach(() => {
  recorded.create.length = 0
  recorded.stream.length = 0
  script.replies.length = 0
  script.clientOff = false
})

describe('buildRequestPrefix (the cacheable head of every request)', () => {
  it('marks the STABLE block and only that block, and renders it before the volatile one', () => {
    const p = buildRequestPrefix({ system: { stable: 'PERSONA', volatile: 'member facts' }, cacheSystem: true, tools: TOOLS })
    expect(Array.isArray(p.system)).toBe(true)
    const blocks = p.system as Anthropic.TextBlockParam[]
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'text', text: 'PERSONA', cache_control: { type: 'ephemeral' } })
    expect(blocks[1]).toEqual({ type: 'text', text: 'member facts' })
    expect(blocks[1]).not.toHaveProperty('cache_control')
    expect(p.tools).toBe(TOOLS)
  })

  it('omits an empty volatile block rather than sending an empty text block', () => {
    const p = buildRequestPrefix({ system: { stable: 'PERSONA' }, cacheSystem: true })
    expect(p.system as Anthropic.TextBlockParam[]).toHaveLength(1)
  })

  it('leaves a plain string system uncached unless asked (every existing caller unchanged)', () => {
    expect(buildRequestPrefix({ system: 'hi' }).system).toBe('hi')
    expect(buildRequestPrefix({ system: 'hi', cacheSystem: true }).system).toEqual([
      { type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('never marks a two-part prompt when caching is off, but still keeps the order', () => {
    const blocks = buildRequestPrefix({ system: { stable: 'A', volatile: 'B' } }).system as Anthropic.TextBlockParam[]
    expect(blocks.map((b) => b.text)).toEqual(['A', 'B'])
    expect(blocks.some((b) => 'cache_control' in b)).toBe(false)
  })
})

describe('runToolLoop keeps the prefix byte-stable across rounds', () => {
  it('sends identical tools + system bytes on every round, with the marker on the stable block', async () => {
    script.replies.push(
      reply([{ type: 'tool_use', id: 't1', name: 'suggest_circle', input: { q: 'swim' }, caller: { type: 'direct' } }]),
      reply([{ type: 'text', text: 'Try the Sunrise Swim.', citations: null }]),
    )
    const res = await runToolLoop({
      system: { stable: 'PERSONA', volatile: 'member facts' },
      cacheSystem: true,
      tools: TOOLS,
      messages: [{ role: 'user', content: 'hi' }],
      maxRounds: 3,
      onToolCalls: async () => [{ type: 'tool_result', tool_use_id: 't1', content: 'Sunrise Swim' }],
    })
    expect(recorded.create).toHaveLength(2)
    const [r1, r2] = recorded.create
    expect(JSON.stringify(r1.system)).toBe(JSON.stringify(r2.system))
    expect(JSON.stringify(r1.tools)).toBe(JSON.stringify(r2.tools))
    expect((r1.system as Anthropic.TextBlockParam[])[0].cache_control).toEqual({ type: 'ephemeral' })
    // The conversation tail is the only thing that moved between rounds.
    expect(r1.messages).toHaveLength(1)
    expect(r2.messages).toHaveLength(3)
    expect(res.text).toBe('Try the Sunrise Swim.')
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })
  })
})

describe('runToolLoop streams when handed onText', () => {
  it('uses the SDK stream, delivers deltas with their round, and reads usage from the final message', async () => {
    script.replies.push(
      reply([{ type: 'text', text: 'Looking.', citations: null }, { type: 'tool_use', id: 't1', name: 'suggest_circle', input: {}, caller: { type: 'direct' } }], {
        cache_creation_input_tokens: 2000,
      }),
      reply([{ type: 'text', text: 'Found one.', citations: null }], { cache_read_input_tokens: 2000 }),
    )
    const deltas: Array<[string, number]> = []
    const res = await runToolLoop({
      system: { stable: 'PERSONA', volatile: 'facts' },
      cacheSystem: true,
      tools: TOOLS,
      messages: [{ role: 'user', content: 'hi' }],
      maxRounds: 3,
      onText: (d, round) => deltas.push([d, round]),
      onToolCalls: async () => [{ type: 'tool_result', tool_use_id: 't1', content: 'x' }],
    })
    expect(recorded.create).toHaveLength(0)
    expect(recorded.stream).toHaveLength(2)
    expect(deltas.filter(([, r]) => r === 0).map(([d]) => d).join('')).toBe('Looking.')
    expect(deltas.filter(([, r]) => r === 1).map(([d]) => d).join('')).toBe('Found one.')
    expect(res.text).toBe('Found one.')
    // Summed across both rounds, cache counts carried: the ledger sees what happened.
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10, cacheReadInputTokens: 2000, cacheCreationInputTokens: 2000 })
    // The streamed request carries the same marked prefix as the blocking one.
    expect((recorded.stream[0].system as Anthropic.TextBlockParam[])[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('stays on the blocking call when onText is absent (whole-document generation unchanged)', async () => {
    script.replies.push(reply([{ type: 'text', text: 'Whole.', citations: null }]))
    await runToolLoop({ system: 'S', tools: TOOLS, messages: [{ role: 'user', content: 'hi' }], maxRounds: 1, onToolCalls: async () => null })
    expect(recorded.stream).toHaveLength(0)
    expect(recorded.create).toHaveLength(1)
  })
})

describe('completeRaw + usageOf', () => {
  it('carries the cache counts through so cost and ledger see them', async () => {
    script.replies.push(reply([{ type: 'text', text: 'ok', citations: null }], { cache_read_input_tokens: 500 }))
    const res = await completeRaw({ system: 'S', messages: [{ role: 'user', content: 'hi' }] })
    expect(res.usage.cacheReadInputTokens).toBe(500)
    expect(res.text).toBe('ok')
  })

  it('usageOf reads a null cache field as zero', () => {
    const u = usageOf({ input_tokens: 1, output_tokens: 2, cache_read_input_tokens: null, cache_creation_input_tokens: null } as Anthropic.Message['usage'])
    expect(u).toEqual({ inputTokens: 1, outputTokens: 2, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })
  })

  it('throws AiUnavailableError when no client is configured (AI_DISABLED semantics intact)', async () => {
    script.clientOff = true
    await expect(completeRaw({ system: 'S', messages: [] })).rejects.toBeInstanceOf(AiUnavailableError)
    await expect(runToolLoop({ system: 'S', tools: [], messages: [], maxRounds: 1, onToolCalls: async () => null })).rejects.toBeInstanceOf(
      AiUnavailableError,
    )
  })
})
