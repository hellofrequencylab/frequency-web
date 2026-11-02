import { describe, it, expect, vi, beforeEach } from 'vitest'

const queueHealth = vi.fn()
vi.mock('@/lib/queue/outbox', () => ({ queueHealth: () => queueHealth() }))

import { GET, QUEUE_LAG_ALERT_MIN } from './route'

describe('GET /api/status/queue-lag', () => {
  beforeEach(() => queueHealth.mockReset())

  it('answers 200 while the oldest due job is inside the window', async () => {
    queueHealth.mockResolvedValue({ pending: 3, deadLettered: 0, lagMin: 2, oldestDueAgeMin: 2, measured: true })
    const res = await GET()
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('answers 503 once the lag passes the alert window', async () => {
    queueHealth.mockResolvedValue({ pending: 90, deadLettered: 0, lagMin: QUEUE_LAG_ALERT_MIN + 1, oldestDueAgeMin: 40, measured: true })
    const res = await GET()
    expect(res.status).toBe(503)
    expect((await res.json()).ok).toBe(false)
  })

  it('answers 503 when the read itself failed, so a dead database is not read as healthy', async () => {
    queueHealth.mockResolvedValue({ pending: 0, deadLettered: 0, lagMin: 0, oldestDueAgeMin: null, measured: false })
    expect((await GET()).status).toBe(503)
  })
})
