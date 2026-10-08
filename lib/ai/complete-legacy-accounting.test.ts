import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
const f = vi.hoisted(() => ({ create: vi.fn(), record: vi.fn() }))
vi.mock('./client', () => ({ getAnthropic: () => ({ messages: { create: f.create } }) }))
vi.mock('./usage', () => ({ recordAiUsage: f.record }))
import { completeRaw, completeText, runToolLoop } from './complete'
function message(tool = false): Anthropic.Message {
  return {
    content: tool ? [{ type: 'tool_use', id: 'tool-1', name: 'lookup', input: {} }] : [{ type: 'text', text: 'Synthetic reply', citations: null }],
    usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 },
  } as Anthropic.Message
}
const request = { system: 'Synthetic', messages: [{ role: 'user' as const, content: 'Synthetic input' }] }
beforeEach(() => { vi.clearAllMocks(); f.create.mockResolvedValue(message()); f.record.mockResolvedValue(undefined) })
describe('compatible completion attribution preparation', () => {
  it('leaves omitted context to the existing caller ledger path', async () => {
    await completeRaw(request)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.record).not.toHaveBeenCalled()
  })
  it('records one real model/usage row when a migrated text caller opts in', async () => {
    const result = await completeText({ ...request, accounting: { feature: 'practice-curate', profileId: 'actor', spaceId: 'space' } })
    expect(f.record).toHaveBeenCalledTimes(1)
    expect(f.record).toHaveBeenCalledWith({ feature: 'practice-curate', profileId: 'actor', spaceId: 'space', model: expect.any(String), usage: result.usage, costUsd: result.costUsd })
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 2, cacheReadInputTokens: 3, cacheCreationInputTokens: 4 })
  })
  it('keeps one aggregate legacy row across multiple migrated tool rounds', async () => {
    f.create.mockResolvedValueOnce(message(true)).mockResolvedValueOnce(message())
    const result = await runToolLoop({ ...request, accounting: { feature: 'vera-chat', profileId: 'actor' }, tools: [], maxRounds: 2, onToolCalls: () => [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'Synthetic result' }] })
    expect(f.create).toHaveBeenCalledTimes(2)
    expect(f.record).toHaveBeenCalledTimes(1)
    expect(f.record).toHaveBeenCalledWith(expect.objectContaining({ feature: 'vera-chat', profileId: 'actor', model: result.model, usage: result.usage }))
    expect(result.usage.inputTokens).toBe(20)
  })
  it('does not invent successful usage when the provider fails', async () => {
    f.create.mockRejectedValueOnce(new Error('Synthetic provider failure'))
    await expect(completeRaw({ ...request, accounting: { feature: 'practice-curate' } })).rejects.toThrow('Synthetic provider failure')
    expect(f.record).not.toHaveBeenCalled()
  })
})
