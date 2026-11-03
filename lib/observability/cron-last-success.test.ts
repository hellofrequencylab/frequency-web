import { describe, it, expect } from 'vitest'
import { CRON_OK_KEY_PREFIX, judgeStamps, isStampedCron } from '@/lib/observability/cron-last-success'
import { CRON_UNMONITORED, cronFreshnessMinutes } from '@/lib/observability/slos'

describe('judgeStamps', () => {
  const now = Date.parse('2026-11-03T12:00:00Z')
  const job = 'embed-help' // daily window
  const row = (ageMin: number) => ({ key: `${CRON_OK_KEY_PREFIX}${job}`, created_at: new Date(now - ageMin * 60_000).toISOString() })
  const find = (rows: ReturnType<typeof row>[]) => judgeStamps(rows, now).find((s) => s.job === job)!

  it('is fresh inside the window, stale past it, unreported with no stamp', () => {
    const win = cronFreshnessMinutes(job)!
    expect(find([row(win - 5)]).state).toBe('fresh')
    expect(find([row(win + 5)]).state).toBe('stale')
    expect(find([]).state).toBe('unreported')
  })

  it('returns one verdict per unmonitored job, and every one has a window', () => {
    expect(judgeStamps([], now)).toHaveLength(CRON_UNMONITORED.length)
    for (const { job: j } of CRON_UNMONITORED) {
      expect(cronFreshnessMinutes(j), j).not.toBeNull()
      expect(isStampedCron(j)).toBe(true)
    }
  })
})
