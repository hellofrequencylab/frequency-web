import { describe, it, expect } from 'vitest'
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import { toAnthropicTools, parseAssistantContent, extractSuggestions, buildVeraSystem, createChipsFilter } from './agent-claude'
import { VERA_TOOLS } from './tools'
import { DEFAULT_VERA_CONFIG } from './config'
import { VOICE_PRIMER } from '@/lib/ai/voice'

describe('toAnthropicTools', () => {
  it('maps the bounded surface to Anthropic tool schemas', () => {
    const tools = toAnthropicTools(VERA_TOOLS)
    expect(tools.length).toBe(VERA_TOOLS.length)
    const remember = tools.find((t) => t.name === 'remember_fact')!
    expect(remember.description).toBeTruthy()
    expect(remember.input_schema.type).toBe('object')
    expect(remember.input_schema.required).toContain('fact')
    // optional param present in properties but not required
    expect(Object.keys(remember.input_schema.properties as object)).toContain('category')
    expect(remember.input_schema.required).not.toContain('category')
  })
})

describe('parseAssistantContent', () => {
  it('splits text and tool_use blocks', () => {
    const content = [
      { type: 'text', text: 'Hey — ' },
      { type: 'text', text: 'welcome.' },
      { type: 'tool_use', id: 'tu_1', name: 'remember_fact', input: { fact: 'new in town' } },
    ] as unknown as ContentBlock[]
    const { text, toolCalls } = parseAssistantContent(content)
    expect(text).toBe('Hey — welcome.')
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toEqual({ id: 'tu_1', tool: 'remember_fact', args: { fact: 'new in town' } })
  })

  it('handles a text-only reply', () => {
    const { text, toolCalls } = parseAssistantContent([{ type: 'text', text: 'All set.' }] as unknown as ContentBlock[])
    expect(text).toBe('All set.')
    expect(toolCalls).toHaveLength(0)
  })
})

describe('extractSuggestions (live-loop chips, ONBOARDING-BUILD-LIST §1.5)', () => {
  it('peels a trailing CHIPS line into quick replies and keeps the prose', () => {
    const { reply, suggestions } = extractSuggestions(
      'Glad you made it. The Sunset Runners meet Tuesdays.\nCHIPS: Find me a circle | Yes, introduce me',
    )
    expect(reply).toBe('Glad you made it. The Sunset Runners meet Tuesdays.')
    expect(suggestions).toEqual(['Find me a circle', 'Yes, introduce me'])
  })

  it('caps at 3, dedupes case-insensitively, drops empties and over-long options', () => {
    const long = 'x'.repeat(80)
    const { suggestions } = extractSuggestions(
      `Hey.\nchips: One | one | | ${long} | Two | Three | Four`,
    )
    expect(suggestions).toEqual(['One', 'Two', 'Three'])
  })

  it('yields no chips (and the untouched reply) when the model skips the line', () => {
    const { reply, suggestions } = extractSuggestions('Just a reply.')
    expect(reply).toBe('Just a reply.')
    expect(suggestions).toEqual([])
  })

  it('strips a mid-text CHIPS line without losing surrounding prose', () => {
    const { reply, suggestions } = extractSuggestions('Line one.\nCHIPS: Tap me\nLine two.')
    expect(reply).toBe('Line one.\nLine two.')
    expect(suggestions).toEqual(['Tap me'])
  })
})

describe('buildVeraSystem (the cache split, ADR-1287)', () => {
  const ctxA = { facts: { interests: ['swimming'], goals: ['make friends'], neighborhood: 'Mission' } } as never
  const ctxB = { facts: { interests: ['chess'] } } as never
  const hotCfg = { ...DEFAULT_VERA_CONFIG, register: 'hot' as const, styleNote: 'be brief', greeting: 'Yo.' }

  it('keeps the STABLE block byte-identical across members, configs, support history and viewers', () => {
    const a = buildVeraSystem(ctxA, DEFAULT_VERA_CONFIG, 'two open tickets', { isOperator: true, roleLabel: 'janitor' })
    const b = buildVeraSystem(ctxB, hotCfg, undefined, null)
    const c = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
    expect(a.stable).toBe(b.stable)
    expect(b.stable).toBe(c.stable)
    // Every per-request fact lives in the volatile half, never the stable one.
    for (const needle of ['swimming', 'Mission', 'two open tickets', 'janitor', 'be brief', 'Yo.', 'HOT']) {
      expect(a.stable + b.stable, needle).not.toContain(needle)
    }
    expect(a.volatile).toContain('swimming')
    expect(a.volatile).toContain('two open tickets')
    expect(a.volatile).toContain('janitor')
    expect(b.volatile).toContain('be brief')
    expect(b.volatile).toContain('HOT')
  })

  it('opens the stable block with the voice primer, so the cache covers voice + persona + tools', () => {
    const { stable } = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
    expect(stable.startsWith(VOICE_PRIMER)).toBe(true)
    expect(stable).toContain('You are Vera')
    expect(stable).toContain('CHIPS:')
  })

  it('always writes the operator knobs and the bug-report line into the volatile half', () => {
    const { volatile } = buildVeraSystem(null, DEFAULT_VERA_CONFIG)
    expect(volatile).toContain('Report a bug')
    expect(volatile).toContain(String(DEFAULT_VERA_CONFIG.maxReplyChars))
    expect(volatile).toContain(DEFAULT_VERA_CONFIG.greeting)
  })
})

describe('createChipsFilter (streaming-safe chip stripping, ADR-1287)', () => {
  function run(deltas: string[]): string {
    let out = ''
    const f = createChipsFilter((t) => (out += t))
    for (const d of deltas) f.push(d)
    f.flush()
    return out
  }

  it('emits prose as it arrives and drops the CHIPS line, even when it lands mid-delta', () => {
    expect(run(['Glad you ', 'made it.\nCHI', 'PS: Find me a circle | Yes'])).toBe('Glad you made it.\n')
  })

  it('never shows a partial CHIPS prefix, then releases it when it turns out to be prose', () => {
    let out = ''
    const f = createChipsFilter((t) => (out += t))
    f.push('Hey.\nCh')
    expect(out).toBe('Hey.\n')
    f.push('ess is on Tuesdays.')
    expect(out).toBe('Hey.\nChess is on Tuesdays.')
    f.flush()
    expect(out).toBe('Hey.\nChess is on Tuesdays.')
  })

  it('streams a single-line reply character by character (no line buffering on prose)', () => {
    let out = ''
    const f = createChipsFilter((t) => (out += t))
    f.push('S')
    f.push('o')
    f.push(' glad.')
    expect(out).toBe('So glad.')
  })

  it('drops everything after the CHIPS line, across later deltas', () => {
    expect(run(['Reply.\n', 'chips: a | b\n', 'stray text after'])).toBe('Reply.\n')
  })

  it('matches extractSuggestions on the whole reply once flushed', () => {
    const whole = 'Line one.\nLine two.\nCHIPS: One | Two'
    expect(run(whole.split(/(?=[ .])/)).trim()).toBe(extractSuggestions(whole).reply)
  })

  it('reset starts a fresh round', () => {
    let out = ''
    const f = createChipsFilter((t) => (out += t))
    f.push('First.\nCHIPS: x')
    f.reset()
    f.push('Second.')
    f.flush()
    expect(out).toBe('First.\nSecond.')
  })
})
