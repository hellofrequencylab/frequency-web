import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const mock = vi.hoisted(() => ({ rpc: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mock.rpc }) }))
vi.mock('@/lib/log', () => ({ log: { error: mock.error } }))
import { purgeExpiredExperimentAssignments } from './experiment-retention'
beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockResolvedValue({ data: 2, error: null }) })
describe('experiment assignment retention', () => {
  it('uses the exact 180-day cutoff and reports the authoritative count', async () => {
    expect(await purgeExpiredExperimentAssignments(new Date('2026-11-13T12:00:00Z'))).toBe(2)
    expect(mock.rpc).toHaveBeenCalledWith('analytics_experiment_purge', { _cutoff: '2026-05-17T12:00:00.000Z' })
  })
  it.each([{ data: null, error: { message: 'offline' } }, { data: -1, error: null }, { data: '2', error: null }, { data: 1.5, error: null }])('reports failures and never claims an invalid count', async (reply) => {
    mock.rpc.mockResolvedValue(reply)
    expect(await purgeExpiredExperimentAssignments(new Date('2026-11-13T12:00:00Z'))).toBe(0)
    expect(mock.error).toHaveBeenCalledWith('cron.enforce_retention.experiments_purge_failed', { cutoff: '2026-05-17T12:00:00.000Z' })
  })
  it('reports a thrown transport error without breaking the rest of the retention run', async () => {
    mock.rpc.mockRejectedValue(new Error('offline'))
    expect(await purgeExpiredExperimentAssignments(new Date('2026-11-13T12:00:00Z'))).toBe(0)
    expect(mock.error).toHaveBeenCalledTimes(1)
  })
})
