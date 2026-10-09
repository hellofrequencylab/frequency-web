import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => { process.env.RESEND_API_KEY = 'fixture-only'; return { send: vi.fn(), rpc: vi.fn(), suppressed: vi.fn(async () => false) } })
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/suppression', () => ({ isSuppressed: mocks.suppressed }))
import { sendRawEmail } from './email'
const payload = { to: 'fixture@example.test', subject: 'Fixture', html: '<p>Fixture</p>' }
beforeEach(() => { vi.clearAllMocks(); mocks.suppressed.mockResolvedValue(false); vi.stubEnv('EMAIL_PROVIDER_ACCEPTANCE_ENABLED', 'true') })
it('actual sender uses durable prepare/SDK key/acceptance linkage with trusted queue ID', async () => {
  const frozen = { ...payload, from: 'Frequency <fixture@send.example.test>' }
  mocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: { state: 'dispatching', idempotencyKey: 'frequency/email/job-1', nonce: 'n', payload: frozen }, error: null })
    .mockResolvedValueOnce({ data: true, error: null })
  mocks.send.mockResolvedValue({ data: { id: 'resend-1' }, error: null })
  expect(await sendRawEmail(payload, { queueJobId: 'job-1' })).toEqual({ id: 'resend-1' })
  expect(mocks.send).toHaveBeenCalledWith(frozen, { idempotencyKey: 'frequency/email/job-1' })
  expect(mocks.rpc.mock.calls[0][1].p_queue_job_id).toBe('job-1')
})
it('activation cannot silently bypass ledger for direct sender calls', async () => {
  await expect(sendRawEmail(payload)).rejects.toThrow('trusted queue job context')
  expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled()
})
it('ledger failure prevents provider call', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } })
  await expect(sendRawEmail(payload, { queueJobId: 'job-1' })).rejects.toThrow('ledger unavailable')
  expect(mocks.send).not.toHaveBeenCalled()
})

it('rollback cannot bypass the ledger for a job already stamped as requiring acceptance', async () => {
  vi.stubEnv('EMAIL_PROVIDER_ACCEPTANCE_ENABLED', '')
  mocks.rpc.mockResolvedValue({ data: { providerId: 'already-accepted' }, error: null })
  expect(await sendRawEmail(payload, { queueJobId: 'job-1', providerAcceptanceRequired: true })).toEqual({ id: 'already-accepted' })
  expect(mocks.send).not.toHaveBeenCalled()
})

it('accepted replay survives later suppression without a new dispatch', async () => {
  mocks.suppressed.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ data: { providerId: 'accepted-before-suppression' }, error: null })
  expect(await sendRawEmail(payload, { queueJobId: 'job-1' })).toEqual({ id: 'accepted-before-suppression' })
  expect(mocks.suppressed).not.toHaveBeenCalled()
  expect(mocks.send).not.toHaveBeenCalled()
})
