import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mock }))
import { acceptEmailForJob } from './email-provider-acceptance'
import { TerminalQueueError } from '@/lib/queue/terminal-error'
const payload = { from: 'Frequency <test@send.example.test>', to: 'fixture@example.test', subject: 'Fixture', html: '<p>Fixture</p>' }
const prepared = { state: 'dispatching', idempotencyKey: 'frequency/email/job-1', nonce: 'attempt-1', payload }
beforeEach(() => vi.clearAllMocks())
describe('durable provider acceptance boundary', () => {
  it('sends persisted immutable payload and stable Resend SDK request key then settles ID', async () => {
    mock.rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: true, error: null })
    const send = vi.fn(async () => ({ data: { id: 'resend-1' }, error: null }))
    expect(await acceptEmailForJob('job-1', payload, send)).toEqual({ id: 'resend-1' })
    expect(send).toHaveBeenCalledWith(payload, { idempotencyKey: 'frequency/email/job-1' })
    expect(mock.rpc.mock.calls[1][1]).toMatchObject({ p_outcome: 'accepted', p_provider_id: 'resend-1' })
  })
  it('accepted ledger replay skips provider even after worker completion was lost', async () => {
    mock.rpc.mockResolvedValue({ data: { state: 'accepted', providerId: 'resend-1' }, error: null })
    const send = vi.fn()
    expect(await acceptEmailForJob('job-1', payload, send)).toEqual({ id: 'resend-1' }); expect(send).not.toHaveBeenCalled()
  })
  it('expired unresolved acceptance becomes a terminal visible hold without provider invocation', async () => {
    mock.rpc.mockResolvedValue({ data: { state: 'held' }, error: null })
    const send = vi.fn()
    await expect(acceptEmailForJob('job-1', payload, send)).rejects.toBeInstanceOf(TerminalQueueError)
    expect(send).not.toHaveBeenCalled()
  })
  it('network timeout records uncertainty and never invents rejection', async () => {
    mock.rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: true, error: null })
    await expect(acceptEmailForJob('job-1', payload, async () => { throw new Error('timeout') })).rejects.toThrow('timeout')
    expect(mock.rpc.mock.calls[1][1]).toMatchObject({ p_outcome: 'uncertain', p_provider_id: null })
  })
  it.each([[429,'retryable'],[503,'uncertain'],[422,'failed']])('classifies provider status %i as %s', async (status, outcome) => {
    mock.rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: true, error: null })
    await expect(acceptEmailForJob('job-1', payload, async () => ({ data: null, error: { statusCode: status } }))).rejects.toThrow()
    expect(mock.rpc.mock.calls[1][1].p_outcome).toBe(outcome)
  })
  it('a failed durable acceptance write cannot return success', async () => {
    mock.rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } })
    await expect(acceptEmailForJob('job-1', payload, async () => ({ data: { id: 'resend-1' }, error: null }))).rejects.toThrow('ledger unavailable')
  })
  it('conflicting frozen payload is held before any request', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Provider payload changed on retry' } })
    const send = vi.fn()
    await expect(acceptEmailForJob('job-1', payload, send)).rejects.toBeInstanceOf(TerminalQueueError); expect(send).not.toHaveBeenCalled()
  })
})

it.each([['concurrent_idempotent_requests','retryable'],['invalid_idempotent_request','failed'],['unknown_conflict','uncertain']])('classifies 409 %s as %s', async (name, outcome) => {
  mock.rpc.mockResolvedValueOnce({ data: prepared, error: null }).mockResolvedValueOnce({ data: true, error: null })
  await expect(acceptEmailForJob('job-1', payload, async () => ({ data: null, error: { statusCode: 409, name } }))).rejects.toThrow()
  expect(mock.rpc.mock.calls[1][1].p_outcome).toBe(outcome)
})
