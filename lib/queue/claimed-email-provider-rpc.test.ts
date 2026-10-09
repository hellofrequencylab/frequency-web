import { beforeEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ rpc: vi.fn(), single: vi.fn(), eq: vi.fn(), inside: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({
  rpc: fixture.rpc,
  from: fixture.from,
}) }))
import { claimedEmailProviderRpc } from './outbox'
const query = { select: () => query, eq: fixture.eq, in: fixture.inside, maybeSingle: fixture.single }
beforeEach(() => {
  vi.clearAllMocks()
  fixture.from.mockReturnValue(query)
  fixture.eq.mockReturnValue(query)
  fixture.inside.mockReturnValue(query)
  fixture.single.mockResolvedValue({ data: { id: 'job', kind: 'email', status: 'processing' }, error: null })
  fixture.rpc.mockResolvedValue({ data: true, error: null })
})
describe('claimed email provider ledger authority', () => {
  it('pins actual job and processing email kinds before calling service RPC', async () => {
    await claimedEmailProviderRpc('job', 'prepare_email_provider_attempt', { p_queue_job_id: 'replacement', p_payload: {} })
    expect(fixture.eq).toHaveBeenCalledWith('id', 'job')
    expect(fixture.eq).toHaveBeenCalledWith('status', 'processing')
    expect(fixture.inside).toHaveBeenCalledWith('kind', ['email', 'space-campaign-email'])
    expect(fixture.rpc).toHaveBeenCalledWith('prepare_email_provider_attempt', { p_queue_job_id: 'job', p_payload: {} })
  })
  it('preserves accepted settlement after queue status change or cleanup', async () => {
    fixture.single.mockResolvedValue({ data: { queue_job_id: 'job' }, error: null })
    await claimedEmailProviderRpc('job', 'settle_email_provider_attempt', { p_nonce: 'old', p_outcome: 'accepted', p_provider_id: 'accepted-id' })
    expect(fixture.from).toHaveBeenCalledWith('email_provider_attempts')
    expect(fixture.eq).toHaveBeenCalledWith('queue_job_id', 'job')
    expect(fixture.eq).not.toHaveBeenCalledWith('status', 'processing')
    expect(fixture.rpc).toHaveBeenCalled()
  })
  it('rejects absent, unclaimed or non-email jobs before mutation', async () => {
    fixture.single.mockResolvedValue({ data: null, error: null })
    await expect(claimedEmailProviderRpc('job', 'prepare_email_provider_attempt', {})).rejects.toThrow('claimed email job')
    expect(fixture.rpc).not.toHaveBeenCalled()
  })
  it('does not reinterpret failed authority lookup as absence or acceptance', async () => {
    fixture.single.mockResolvedValue({ data: null, error: { message: 'offline' } })
    await expect(claimedEmailProviderRpc('job', 'read_accepted_email_provider_attempt', {})).rejects.toThrow('lookup unavailable')
    expect(fixture.rpc).not.toHaveBeenCalled()
  })
})
