import { describe, it, expect } from 'vitest'
import type { ContentBlock } from '@anthropic-ai/sdk/resources/messages'
import { toAnthropicTools, parseAssistantContent } from './agent-claude'
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
