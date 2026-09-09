import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// Finding R2 (2026-09-04): the density-rollup step of the nightly cron had been failing on every run
// since 2026-08-22 (sqlstate 21000 from PostgREST's safeupdate preload) and the route logged it at
// INFO as `cron.refresh_resonance_density { cells: 0 }`, indistinguishable from an empty success.
// These tests pin the observability contract for that step: a failure is logged at ERROR under its
// own `.failed` event and the JSON carries `ok: false` for the step, while the cron as a whole still
// returns 200 / ok: true because the trait, edge and embedding steps completed. Every collaborator
// is mocked; the only thing under test is how the route routes the helper's result.

const density = vi.hoisted(() => ({
  result: { cells: 0 } as { cells: number; error?: string },
}))
const standing = vi.hoisted(() => ({
  result: { spaces: 0 } as { spaces: number; error?: string },
}))
const logged = vi.hoisted(() => ({
  error: [] as { event: string; fields?: Record<string, unknown> }[],
  info: [] as { event: string; fields?: Record<string, unknown> }[],
}))

vi.mock('@/lib/traits/refresh', () => ({
  refreshMemberTraits: () => Promise.resolve({ members: 3, traits: 9 }),
}))
vi.mock('@/lib/resonance/edges', () => ({
  refreshResonanceEdges: () => Promise.resolve({ anchors: 0, edges: 0 }),
}))
vi.mock('@/lib/resonance/embeddings', () => ({
  refreshResonanceEmbeddings: () => Promise.resolve({ refreshed: 0, skipped: 0 }),
}))
vi.mock('@/lib/resonance/density', () => ({
  refreshResonanceDensityCells: () => Promise.resolve(density.result),
}))
vi.mock('@/lib/spaces/standing-rollup', () => ({
  refreshSpaceStanding: () => Promise.resolve(standing.result),
}))
vi.mock('@/lib/cron-auth', () => ({
  rejectUnauthorizedCron: () => null,
}))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: (req: NextRequest) => Promise<Response>) => handler,
}))
vi.mock('@/lib/log', () => ({
  log: {
    info: (event: string, fields?: Record<string, unknown>) => logged.info.push({ event, fields }),
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => logged.error.push({ event, fields }),
    time: async <T,>(_event: string, fn: () => T | Promise<T>) => fn(),
  },
}))

import { GET } from './route'

const req = new Request('http://localhost/api/cron/refresh-traits') as unknown as NextRequest

beforeEach(() => {
  logged.error.length = 0
  logged.info.length = 0
  density.result = { cells: 0 }
  standing.result = { spaces: 0 }
})

describe('GET /api/cron/refresh-traits, the density-rollup step', () => {
  it('logs a failed rollup at ERROR under .failed and marks the step ok: false, without failing the cron', async () => {
    density.result = { cells: 0, error: '21000: DELETE requires a WHERE clause' }
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.resonanceDensity).toEqual({
      ok: false,
      cells: 0,
      error: '21000: DELETE requires a WHERE clause',
    })

    expect(logged.error).toHaveLength(1)
    expect(logged.error[0].event).toBe('cron.refresh_resonance_density.failed')
    expect(logged.error[0].fields).toMatchObject({
      ok: false,
      cells: 0,
      error: '21000: DELETE requires a WHERE clause',
    })
    // The failure is NOT also reported as a healthy step at info.
    expect(logged.info.map((l) => l.event)).not.toContain('cron.refresh_resonance_density')
  })

  it('logs a successful rollup at info with ok: true and the cell count, and never at error', async () => {
    density.result = { cells: 17 }
    const res = await GET(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.resonanceDensity).toEqual({ ok: true, cells: 17 })
    expect(logged.error).toHaveLength(0)
    const line = logged.info.find((l) => l.event === 'cron.refresh_resonance_density')
    expect(line?.fields).toEqual({ ok: true, cells: 17 })
  })
})

// The space-standing rollup (LIVE-263) rides the same cron and takes the SAME observability
// contract, for the same reason: a nightly rollup whose failure is indistinguishable from an empty
// success is a rollup nobody notices has stopped. The directory degrades on its own when the table
// is unreadable, which is exactly why the cron has to be loud about it: the surface stays fine and
// the signal quietly disappears.
describe('GET /api/cron/refresh-traits, the space-standing step', () => {
  it('logs a failed rollup at ERROR under .failed and marks the step ok: false, without failing the cron', async () => {
    standing.result = { spaces: 0, error: '42P01: relation "space_standing" does not exist' }
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.spaceStanding).toEqual({
      ok: false,
      spaces: 0,
      error: '42P01: relation "space_standing" does not exist',
    })
    const failure = logged.error.find((l) => l.event === 'cron.refresh_space_standing.failed')
    expect(failure?.fields).toMatchObject({ ok: false, spaces: 0 })
    expect(logged.info.map((l) => l.event)).not.toContain('cron.refresh_space_standing')
  })

  it('logs a successful rollup at info with ok: true and the row count, and never at error', async () => {
    standing.result = { spaces: 22 }
    const res = await GET(req)
    const body = await res.json()
    expect(body.spaceStanding).toEqual({ ok: true, spaces: 22 })
    expect(logged.error.map((l) => l.event)).not.toContain('cron.refresh_space_standing.failed')
    const line = logged.info.find((l) => l.event === 'cron.refresh_space_standing')
    expect(line?.fields).toEqual({ ok: true, spaces: 22 })
  })
})
