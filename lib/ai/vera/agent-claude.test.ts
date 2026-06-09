import { describe, it, expect } from 'vitest'
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import { toAnthropicTools, parseAssistantContent, extractSuggestions } from './agent-claude'
import { VERA_TOOLS } from './tools'

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
