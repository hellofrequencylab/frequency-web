import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// SEASON AUTO-GO-LIVE on a frozen clock (functional QA, 2026-10-28). The cron promotes the EARLIEST
// scheduled season whose starts_at has arrived, only when none is Live, one per run, and re-asserts
// status='scheduled' on the flip so a concurrent run cannot double-promote.

const NOW = new Date('2026-12-01T00:10:00.000Z')
type Season = { id: string; name: string; starts_at: string; status: string }
let seasons: Season[] = []
let updateError: string | null = null
const updates: { id: unknown; status: unknown }[] = []

function from() {
  let mode: 'select' | 'update' = 'select'
  const eqs: [string, unknown][] = []
  let lte: string | null = null
  const rows = () => seasons.filter((s) => eqs.every(([c, v]) => (s as Record<string, unknown>)[c] === v) && (lte === null || s.starts_at <= lte))
  const api: Record<string, unknown> = {
    select: () => api,
    update: () => ((mode = 'update'), api),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), api),
    lte: (_c: string, v: string) => ((lte = v), api),
    order: () => api,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => {
      if (mode === 'update') {
        updates.push({ id: eqs.find(([c]) => c === 'id')?.[1], status: eqs.find(([c]) => c === 'status')?.[1] })
        if (!updateError) rows().forEach((s) => (s.status = 'active'))
        return Promise.resolve({ error: updateError ? { message: updateError } : null }).then(res)
      }
      return Promise.resolve({ data: rows().sort((a, b) => a.starts_at.localeCompare(b.starts_at)), error: null }).then(res)
    },
  }
  return api
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from, rpc: async () => ({}) }) }))

import { promoteDueScheduledSeasons } from './seasons'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  updates.length = 0
  updateError = null
})
afterEach(() => vi.useRealTimers())

const s = (id: string, starts_at: string, status = 'scheduled'): Season => ({ id, name: id, starts_at, status })

describe('promoteDueScheduledSeasons', () => {
  it('does nothing before the go-live time', async () => {
    seasons = [s('a', '2026-12-01T00:11:00.000Z')]
    expect(await promoteDueScheduledSeasons()).toEqual({ scheduledDue: 0, promoted: 0, promotedId: null, skippedBecauseActive: false })
    expect(seasons[0].status).toBe('scheduled')
  })

  it('promotes the earliest due season, and only one per run', async () => {
    seasons = [s('late', '2026-11-30T00:00:00.000Z'), s('early', '2026-11-01T00:00:00.000Z')]
    const r = await promoteDueScheduledSeasons()
    expect(r).toMatchObject({ scheduledDue: 2, promoted: 1, promotedId: 'early' })
    expect(seasons.map((x) => [x.id, x.status])).toEqual([['late', 'scheduled'], ['early', 'active']])
    expect(updates).toEqual([{ id: 'early', status: 'scheduled' }])
  })

  it('goes live exactly at starts_at', async () => {
    seasons = [s('now', NOW.toISOString())]
    expect((await promoteDueScheduledSeasons()).promoted).toBe(1)
  })

  it('skips while another season is Live and reports it', async () => {
    seasons = [s('live', '2026-09-01T00:00:00.000Z', 'active'), s('due', '2026-11-01T00:00:00.000Z')]
    const r = await promoteDueScheduledSeasons()
    expect(r).toMatchObject({ scheduledDue: 1, promoted: 0, skippedBecauseActive: true })
    expect(updates).toHaveLength(0)
  })

  it('throws on a write error so the cron reports failure', async () => {
    seasons = [s('due', '2026-11-01T00:00:00.000Z')]
    updateError = 'boom'
    await expect(promoteDueScheduledSeasons()).rejects.toThrow('boom')
  })
})
