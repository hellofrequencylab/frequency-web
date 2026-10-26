import { describe, expect, it, vi } from 'vitest'
import { handleModelToolCalls } from './model-tools'
import type { ProposedToolCall } from './concierge'

describe('model authority is coaching, never outbound authorship', () => {
  it.each(['create_entity', 'send_playbook_email', 'send_intro_email'])('redirects %s without executing or proposing it', async (name) => {
    const read = vi.fn()
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([{ id: 't', name, input: { draft: '{"about":"Model copy"}', subject: 'Model subject', body: 'Model body' } }], proposals, read)
    expect(proposals).toEqual([])
    expect(read).not.toHaveBeenCalled()
    expect(results?.[0].content).toContain('Nothing was')
    expect(results?.[0].content).not.toContain('Model body')
  })

  it('rejects stale model-written intro alongside a valid read, without dispatching invalid args', async () => {
    const read = vi.fn().mockResolvedValue('A real circle')
    const proposals: ProposedToolCall[] = []
    const results = await handleModelToolCalls([
      { id: 'bad', name: 'draft_intro', input: { toHandle: 'maya', message: 'Publish me' } },
      { id: 'good', name: 'suggest_circle', input: {} },
    ], proposals, read)
    expect(read).toHaveBeenCalledExactlyOnceWith('suggest_circle', {})
    expect(proposals).toEqual([])
    expect(results?.[0].content).toContain('Nothing was changed')
  })

  it('keeps human confirmation for supported actions and never dispatches their writes', async () => {
    const read = vi.fn()
    const proposals: ProposedToolCall[] = []
    const result = await handleModelToolCalls([{ id: 'join', name: 'join_circle', input: { circle: 'runners' } }], proposals, read)
    expect(result).toBeNull()
    expect(proposals).toEqual([{ tool: 'join_circle', args: { circle: 'runners' } }])
    expect(read).not.toHaveBeenCalled()
  })
})

it('never proposes a model-authored bio update even with a supported profile tool', async () => {
  const proposals: ProposedToolCall[] = []
  const read = vi.fn()
  const result = await handleModelToolCalls([{ id: 'bio', name: 'set_profile_field', input: { field: 'bio', value: 'Generated member story' } }], proposals, read)
  expect(proposals).toEqual([])
  expect(read).not.toHaveBeenCalled()
  expect(result?.[0].content).toContain('/settings/profile')
})


it.each([null, [], 'model text'])('refuses non-object tool arguments without throwing: %s', async (input) => {
  const proposals: ProposedToolCall[] = []
  const read = vi.fn()
  const result = await handleModelToolCalls([{ id: 'bad', name: 'set_profile_field', input: input as unknown as Record<string, unknown> }], proposals, read)
  expect(result?.[0].content).toContain('Nothing was changed')
  expect(proposals).toEqual([])
  expect(read).not.toHaveBeenCalled()
})
