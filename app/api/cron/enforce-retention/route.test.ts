import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// LIVE-174 (2026-09-06): cron_run_markers had NO purge. weekly-digest claims one row per member
// per ISO week and deletes it only when the send throws, so every successful send left a row
// behind forever — an unbounded table with no writer that ever shrank it. These tests pin the
// sweep against the real route with the admin client mocked: the delete happens, it happens on
// `created_at` at exactly the 60-day window, its count is reported per TABLE (so a table added to
// RETENTION_TABLES cannot go unmentioned), and a failure is logged rather than swallowed.

type Response = { data: { key?: string; id?: string; profile_id?: string }[] | null; error: { message: string } | null }

const state = vi.hoisted(() => ({
  /** Every delete the route drove, in order: table, the filters applied, the column selected. */
  deletes: [] as { table: string; filters: string[]; selected: string }[],
  /** Per-table canned reply for the awaited builder. */
  replies: {} as Record<string, Response>,
  studioDraftsPurged: 0,
  /** What the importer staging age-out (LIVE-120) was asked for, and what it reports back. */
  stagingCalls: [] as { now: string }[],
  stagingRemoved: 0,
  logged: { info: [] as Record<string, unknown>[], error: [] as { event: string; fields?: Record<string, unknown> }[] },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const record = { table, filters: [] as string[], selected: '' }
      const chain = {
        delete: () => chain,
        lt: (col: string, value: string) => {
          record.filters.push(`lt:${col}:${value}`)
          return chain
        },
        not: (col: string, op: string, value: string) => {
          record.filters.push(`not:${col}:${op}.${value}`)
          return chain
        },
        select: (cols: string) => {
          record.selected = cols
          state.deletes.push(record)
          return Promise.resolve(state.replies[table] ?? { data: [], error: null })
        },
      }
      return chain
    },
  }),
}))
// The Spark draft purge has its own home and its own tests; here it is a collaborator.
vi.mock('@/lib/studio/draft-store', () => ({
  purgeExpiredStudioDrafts: () => Promise.resolve(state.studioDraftsPurged),
}))
// The importer staging age-out (LIVE-120, ADR-1251) has its own tests against a fake bucket; here it
// is a collaborator the nightly run must ask for, with the run's clock, and report beside the tables.
vi.mock('@/lib/importer/harvest/staging-lifecycle', () => ({
  sweepStaleImporterStaging: (opts: { now?: Date }) => {
    state.stagingCalls.push({ now: opts.now?.toISOString() ?? '' })
    return Promise.resolve({ foldersSeen: 1, removed: state.stagingRemoved, kept: 0, errors: 0 })
  },
}))
vi.mock('@/lib/cron-auth', () => ({ rejectUnauthorizedCron: () => null }))
vi.mock('@/lib/observability/cron-heartbeat', () => ({
  withCronHeartbeat: (_name: string, handler: unknown) => handler,
}))
vi.mock('@/lib/log', () => ({
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  log: {
    info: (_event: string, fields?: Record<string, unknown>) => state.logged.info.push(fields ?? {}),
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => state.logged.error.push({ event, fields }),
  },
}))

import { GET } from './route'
import { CRON_MARKER_RETENTION_DAYS, RETENTION_TABLES } from '@/lib/consent/retention'

const req = new Request('http://localhost/api/cron/enforce-retention') as unknown as NextRequest

/** The nightly run: 2026-09-06 03:00 UTC. */
const RUN_AT = '2026-09-06T03:00:00Z'

function markerDelete() {
  return state.deletes.find((d) => d.table === 'cron_run_markers')
}

beforeEach(() => {
  state.deletes.length = 0
  state.replies = {}
  state.studioDraftsPurged = 0
  state.stagingCalls.length = 0
  state.stagingRemoved = 0
  state.logged.info.length = 0
  state.logged.error.length = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date(RUN_AT))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GET /api/cron/enforce-retention, cron_run_markers is bounded (LIVE-174)', () => {
  it('sweeps cron_run_markers and reports how many rows went', async () => {
    state.replies.cron_run_markers = {
      data: [{ key: 'weekly-digest:p1:2026-W20' }, { key: 'weekly-digest:p2:2026-W20' }],
      error: null,
    }
    const res = await GET(req)
    expect(res.status).toBe(200)

    const swept = markerDelete()
    expect(swept, 'the marker table must be swept — before LIVE-174 nothing ever deleted a claim row').toBeDefined()
    expect(swept?.selected).toBe('key')
    expect(await res.json()).toMatchObject({ ok: true, cronMarkersPurged: 2 })
  })

  it('cuts at exactly 60 days on created_at, not the interaction window and not the digest week', async () => {
    await GET(req)
    // 2026-09-06 minus 60 days. Written out rather than recomputed, so a changed constant has to
    // be a deliberate edit here too.
    expect(markerDelete()?.filters).toEqual(['lt:created_at:2026-07-08T03:00:00.000Z'])
    expect(CRON_MARKER_RETENTION_DAYS).toBe(60)
  })

  it('leaves a marker inside the window alone: the only filter is the age cutoff', async () => {
    await GET(req)
    const filters = markerDelete()?.filters ?? []
    expect(filters).toHaveLength(1)
    expect(filters[0].startsWith('lt:created_at:')).toBe(true)
  })

  it('still sweeps the tables it always swept', async () => {
    state.replies.member_tags = { data: [{ profile_id: 'p1' }], error: null }
    state.replies.interaction_events = { data: [{ id: 'e1' }, { id: 'e2' }], error: null }
    state.studioDraftsPurged = 3
    const res = await GET(req)
    expect(state.deletes.map((d) => d.table)).toEqual(['member_tags', 'interaction_events', 'cron_run_markers'])
    expect(await res.json()).toMatchObject({
      tagsPurged: 1,
      interactionsPurged: 2,
      studioDraftsPurged: 3,
      cronMarkersPurged: 0,
    })
  })
})

describe('GET /api/cron/enforce-retention, importer staging media is aged out beside the tables (LIVE-120)', () => {
  it('asks the staging age-out to run on the same clock and reports what it removed', async () => {
    state.stagingRemoved = 3
    const res = await GET(req)
    expect(state.stagingCalls, 'before LIVE-120 nothing ever removed a harvested staging file').toEqual([{ now: '2026-09-06T03:00:00.000Z' }])
    expect(await res.json()).toMatchObject({ ok: true, importerStagingPurged: 3 })
    expect(state.logged.info[0]).toMatchObject({ importerStagingPurged: 3 })
  })

  it('is a storage prefix, not a table: it does not join purgedByTable', async () => {
    const res = await GET(req)
    const body = (await res.json()) as { purgedByTable: Record<string, number> }
    expect(Object.keys(body.purgedByTable)).not.toContain('importerStagingPurged')
  })
})

describe('GET /api/cron/enforce-retention, the run says which tables it bounds', () => {
  it('reports one count per RETENTION_TABLES entry, in the log and in the response', async () => {
    const res = await GET(req)
    const body = (await res.json()) as { purgedByTable: Record<string, number> }
    expect(Object.keys(body.purgedByTable).sort()).toEqual([...RETENTION_TABLES].sort())
    expect(body.purgedByTable.cron_run_markers).toBe(0)
    expect(state.logged.info[0]).toMatchObject({ purgedByTable: body.purgedByTable })
  })
})

describe('GET /api/cron/enforce-retention, a failed sweep is visible', () => {
  it('logs the failure instead of swallowing it, and does not lose the rest of the run', async () => {
    state.replies.cron_run_markers = { data: null, error: { message: 'deadlock detected' } }
    state.replies.member_tags = { data: [{ profile_id: 'p1' }], error: null }
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, tagsPurged: 1, cronMarkersPurged: 0 })
    const line = state.logged.error.find((l) => l.event === 'cron.enforce_retention.markers_purge_failed')
    expect(line, 'a swallowed purge failure is an invisible regression (AGENTS.md)').toBeDefined()
    expect(line?.fields).toMatchObject({ error: 'deadlock detected', cutoff: '2026-07-08T03:00:00.000Z' })
  })
})
