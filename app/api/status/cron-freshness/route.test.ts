import { describe, it, expect, vi, beforeEach } from 'vitest'

const readCronStamps = vi.fn()
vi.mock('@/lib/observability/cron-last-success', () => ({ readCronStamps: () => readCronStamps() }))

import { GET } from './route'

const stamp = (job: string, state: 'fresh' | 'stale' | 'unreported') => ({ job, ageMin: 1, windowMin: 60, state })

describe('GET /api/status/cron-freshness', () => {
  beforeEach(() => readCronStamps.mockReset())

  it('answers 200 when nothing is stale, even with a job not yet reported', async () => {
    readCronStamps.mockResolvedValue({ measured: true, stamps: [stamp('a', 'fresh'), stamp('b', 'unreported')] })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).unreported).toEqual(['b'])
  })

  it('answers 503 and names the stale job', async () => {
    readCronStamps.mockResolvedValue({ measured: true, stamps: [stamp('a', 'stale')] })
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).stale).toEqual(['a'])
  })

  it('answers 503 when the read failed', async () => {
    readCronStamps.mockResolvedValue({ measured: false, stamps: [] })
    expect((await GET()).status).toBe(503)
  })
})
