import { beforeEach, describe, expect, it, vi } from 'vitest'
const f = vi.hoisted(() => ({
  available: vi.fn(), reserve: vi.fn(), settle: vi.fn(), hold: vi.fn(), count: vi.fn(), create: vi.fn(), stream: vi.fn(),
}))
vi.mock('./accounting', async (original) => ({ ...await original<typeof import('./accounting')>(), reserveAiAttempt: f.reserve, settleAiAttempt: f.settle, holdAiAttempt: f.hold }))
vi.mock('./usage', () => ({ aiAvailable: f.available }))

vi.mock('./client', () => ({ getAnthropic: () => ({ messages: { countTokens: f.count, create: f.create, stream: f.stream } }) }))
import { completeRaw, runToolLoop } from './complete'
const accounting = { feature: 'vera-chat', profileId: null }
const request = { accounting, system: 'test', messages: [{ role: 'user' as const, content: 'hello' }] }
function message(tool = false) {
  return { content: tool ? [{ type: 'tool_use', id: 't', name: 'read', input: {} }] : [{ type: 'text', text: 'okay' }], usage: { input_tokens: 10, output_tokens: 2 } }
}
beforeEach(() => {
  vi.resetAllMocks()
  f.available.mockResolvedValue(true)
  f.count.mockResolvedValue({ input_tokens: 10 }); f.reserve.mockResolvedValue('reservation');
  f.create.mockResolvedValue(message()); f.settle.mockResolvedValue(undefined); f.hold.mockResolvedValue(undefined)
})
describe('actual paid wrapper accounting boundary', () => {
  it('never transmits a prompt for quoting when switch/config reads fail closed', async () => {
    f.available.mockResolvedValue(false)
    await expect(completeRaw(request)).rejects.toThrow('AI is paused')
    expect(f.count).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled()
  })
  it('does not dispatch when the quote is unavailable or malformed', async () => {
    f.count.mockRejectedValueOnce(new Error('unsupported'))
    await expect(completeRaw(request)).rejects.toThrow('quote_failed')
    f.count.mockResolvedValueOnce({ input_tokens: NaN })
    await expect(completeRaw(request)).rejects.toThrow('quote_failed')
    expect(f.create).not.toHaveBeenCalled(); expect(f.reserve).not.toHaveBeenCalled()
  })
  it('does not dispatch on unavailable/denied reservation', async () => {
    f.reserve.mockRejectedValue(new Error('budget denied'))
    await expect(completeRaw(request)).rejects.toThrow('budget denied'); expect(f.create).not.toHaveBeenCalled()
  })
  it('settles actual usage before returning and disables automatic retries', async () => {
    await completeRaw(request)
    expect(f.count).toHaveBeenCalledWith(expect.objectContaining({ model: expect.any(String) }), { maxRetries: 0 })
    expect(f.create).toHaveBeenCalledWith(expect.any(Object), { maxRetries: 0 })
    expect(f.settle).toHaveBeenCalledWith('reservation', expect.objectContaining({ inputTokens: 10, outputTokens: 2 }), expect.any(Number))
    expect(f.reserve.mock.invocationCallOrder[0]).toBeLessThan(f.create.mock.invocationCallOrder[0])
  })
  it('holds unknown provider failure instead of claiming zero spend', async () => {
    f.create.mockRejectedValue(new Error('provider timeout'))
    await expect(completeRaw(request)).rejects.toThrow('provider timeout')
    expect(f.hold).toHaveBeenCalledWith('reservation', 'provider_failed'); expect(f.settle).not.toHaveBeenCalled()
  })
  it('does not return generated work when durable settlement fails', async () => {
    f.settle.mockRejectedValue(new Error('ledger down'))
    await expect(completeRaw(request)).rejects.toThrow('ledger down')
  })
  it('settles every tool round before a callback can fail', async () => {
    f.create.mockResolvedValue(message(true))
    const callback = vi.fn(() => { throw new Error('tool failed') })
    await expect(runToolLoop({ ...request, tools: [], maxRounds: 2, onToolCalls: callback })).rejects.toThrow('tool failed')
    expect(f.settle.mock.invocationCallOrder[0]).toBeLessThan(callback.mock.invocationCallOrder[0]); expect(f.reserve).toHaveBeenCalledTimes(1)
  })
  it('retains a hold for failed partial streams', async () => {
    f.stream.mockReturnValue({ on: vi.fn(), finalMessage: vi.fn().mockRejectedValue(new Error('stream lost')) })
    await expect(runToolLoop({ ...request, tools: [], maxRounds: 2, onText: vi.fn(), onToolCalls: vi.fn() })).rejects.toThrow('stream lost')
    expect(f.hold).toHaveBeenCalledWith('reservation', 'stream_failed'); expect(f.settle).not.toHaveBeenCalled()
  })
  it('holds a paid stream when the receiving callback fails', async () => {
    let text: ((delta: string) => void) | undefined
    f.stream.mockReturnValue({ on: (_event: string, callback: (delta: string) => void) => { text = callback }, finalMessage: async () => { text!('partial'); return message() } })
    await expect(runToolLoop({ ...request, tools: [], maxRounds: 2, onText: () => { throw new Error('consumer closed') }, onToolCalls: vi.fn() })).rejects.toThrow('consumer closed')
    expect(f.hold).toHaveBeenCalledWith('reservation', 'stream_failed'); expect(f.settle).not.toHaveBeenCalled()
  })
  it('cannot start a second tool round when its reservation is denied', async () => {
    f.create.mockResolvedValue(message(true)); f.reserve.mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('budget'))
    await expect(runToolLoop({ ...request, tools: [], maxRounds: 2, onToolCalls: () => [{ type: 'tool_result', tool_use_id: 't', content: 'done' }] })).rejects.toThrow('budget')
    expect(f.create).toHaveBeenCalledTimes(1); expect(f.settle).toHaveBeenCalledWith('first', expect.any(Object), expect.any(Number))
  })
})
