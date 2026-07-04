import { describe, it, expect, vi, beforeEach } from 'vitest'

// Server-authoritative active timer session (ADR-521) — the owner-gated actions. Network-free:
// auth (getMyProfileId) + the supabase admin client are mocked. The invariants locked here:
//   1. SELF-GATED: no signed-in caller -> fail, no write. Every write/read is scoped to the
//      session-derived profile_id (never a caller-supplied id).
//   2. start upserts the row (one per member, onConflict profile_id) with the wall-clock started_at.
//   3. pause / resume update the row; resume clears paused_at and adopts the shifted started_at.
//   4. cancel deletes the caller's row (idempotent).
//   5. getActiveTimerSession reconstructs a LiveSessionRecord whose startedAt is Date.parse of the
//      stored started_at, so elapsed recomputes from the wall clock (resume-as-running).

// ── Mock the caller identity ────────────────────────────────────────────────────────────────
let PROFILE_ID: string | null = 'me-0000-4000-a000-00000000self'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => PROFILE_ID,
}))

// ── A chainable admin-client mock recording every write, scoped by the eq() filter ───────────
interface Recorded {
  upserts: { row: Record<string, unknown>; opts: Record<string, unknown> | undefined }[]
  updates: { row: Record<string, unknown>; eq: [string, string] }[]
  deletes: { eq: [string, string] }[]
  selectEqs: [string, string][]
}
const rec: Recorded = { upserts: [], updates: [], deletes: [], selectEqs: [] }
let selectRow: Record<string, unknown> | null = null

function builder(table: string) {
  void table
  return {
    upsert(row: Record<string, unknown>, opts?: Record<string, unknown>) {
      rec.upserts.push({ row, opts })
      return Promise.resolve({ error: null })
    },
    update(row: Record<string, unknown>) {
      return {
        eq: (col: string, val: string) => {
          rec.updates.push({ row, eq: [col, val] })
          return Promise.resolve({ error: null })
        },
      }
    },
    delete() {
      return {
        eq: (col: string, val: string) => {
          rec.deletes.push({ eq: [col, val] })
          return Promise.resolve({ error: null })
        },
      }
    },
    select(_cols: string) {
      void _cols
      return {
        eq: (col: string, val: string) => {
          rec.selectEqs.push([col, val])
          return { maybeSingle: async () => ({ data: selectRow, error: null }) }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

import {
  startTimerSession,
  pauseTimerSession,
  resumeTimerSession,
  cancelTimerSession,
  getActiveTimerSession,
} from './timer-session-actions'

beforeEach(() => {
  PROFILE_ID = 'me-0000-4000-a000-00000000self'
  rec.upserts = []
  rec.updates = []
  rec.deletes = []
  rec.selectEqs = []
  selectRow = null
})

describe('startTimerSession — self-gated upsert', () => {
  it('fails with no write when not signed in', async () => {
    PROFILE_ID = null
    const result = await startTimerSession({
      kind: 'mindless',
      practiceId: 'p1',
      startedAt: 1_000_000,
      pausedAt: null,
      resumeFromSec: 0,
      secondsTarget: 600,
      setup: { mode: 'timer' },
    })
    expect('error' in result).toBe(true)
    expect(rec.upserts).toHaveLength(0)
  })

  it('upserts the row on the session-derived profile with the wall-clock started_at', async () => {
    const result = await startTimerSession({
      kind: 'movement',
      practiceId: 'p9',
      startedAt: 1_700_000_000_000,
      pausedAt: 1_700_000_000_000,
      resumeFromSec: 42,
      secondsTarget: 1200,
      setup: { config: { mode: 'walk' } },
    })
    expect('error' in result).toBe(false)
    expect(rec.upserts).toHaveLength(1)
    const { row, opts } = rec.upserts[0]
    expect(row.profile_id).toBe('me-0000-4000-a000-00000000self')
    expect(row.mode).toBe('movement')
    expect(row.practice_id).toBe('p9')
    expect(row.started_at).toBe(new Date(1_700_000_000_000).toISOString())
    expect(row.seconds_target).toBe(1200)
    // resumeFromSec rides inside the setup jsonb wrapper.
    expect((row.setup as { resumeFromSec: number }).resumeFromSec).toBe(42)
    expect(opts).toEqual({ onConflict: 'profile_id' })
  })

  it('stores a null practice_id for an unbound run', async () => {
    await startTimerSession({
      kind: 'mindless',
      practiceId: '',
      startedAt: 5,
      pausedAt: null,
      resumeFromSec: 0,
      secondsTarget: null,
      setup: {},
    })
    expect(rec.upserts[0].row.practice_id).toBeNull()
    expect(rec.upserts[0].row.seconds_target).toBeNull()
  })
})

describe('pause / resume — scoped updates', () => {
  it('pause stamps paused_at scoped to the caller', async () => {
    await pauseTimerSession(2_000_000)
    expect(rec.updates).toHaveLength(1)
    expect(rec.updates[0].row.paused_at).toBe(new Date(2_000_000).toISOString())
    expect(rec.updates[0].eq).toEqual(['profile_id', 'me-0000-4000-a000-00000000self'])
  })

  it('resume clears paused_at and adopts the shifted started_at', async () => {
    await resumeTimerSession(3_500_000)
    expect(rec.updates).toHaveLength(1)
    expect(rec.updates[0].row.paused_at).toBeNull()
    expect(rec.updates[0].row.started_at).toBe(new Date(3_500_000).toISOString())
    expect(rec.updates[0].eq).toEqual(['profile_id', 'me-0000-4000-a000-00000000self'])
  })

  it('pause fails with no write when not signed in', async () => {
    PROFILE_ID = null
    const result = await pauseTimerSession(1)
    expect('error' in result).toBe(true)
    expect(rec.updates).toHaveLength(0)
  })
})

describe('cancelTimerSession — scoped delete', () => {
  it('deletes only the caller row', async () => {
    await cancelTimerSession()
    expect(rec.deletes).toHaveLength(1)
    expect(rec.deletes[0].eq).toEqual(['profile_id', 'me-0000-4000-a000-00000000self'])
  })
})

describe('getActiveTimerSession — self-scoped read + record reconstruction', () => {
  it('returns null when no row exists', async () => {
    selectRow = null
    const result = await getActiveTimerSession()
    expect('error' in result).toBe(false)
    if (!('error' in result)) expect(result.data).toBeNull()
    // The read is scoped to the caller.
    expect(rec.selectEqs[0]).toEqual(['profile_id', 'me-0000-4000-a000-00000000self'])
  })

  it('reconstructs a LiveSessionRecord whose startedAt is parsed from the stored wall clock', async () => {
    const startedMs = 1_700_000_000_000
    selectRow = {
      profile_id: 'me-0000-4000-a000-00000000self',
      practice_id: 'p3',
      mode: 'mindless',
      setup: { resumeFromSec: 90, payload: { mode: 'timer', minutes: 10 } },
      started_at: new Date(startedMs).toISOString(),
      paused_at: null,
      seconds_target: 600,
    }
    const result = await getActiveTimerSession()
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const record = result.data!
    expect(record.kind).toBe('mindless')
    // The wall clock is preserved exactly, so elapsed = now - startedAt recomputes on resume.
    expect(record.startedAt).toBe(startedMs)
    expect(record.pausedAt).toBeNull()
    expect(record.practiceId).toBe('p3')
    expect(record.resumeFromSec).toBe(90)
    expect(record.secondsTarget).toBe(600)
    expect(record.setup).toEqual({ mode: 'timer', minutes: 10 })
  })

  it('carries the pause moment through for a paused run', async () => {
    const startedMs = 1_700_000_000_000
    const pausedMs = 1_700_000_030_000
    selectRow = {
      profile_id: 'me-0000-4000-a000-00000000self',
      practice_id: 'p3',
      mode: 'movement',
      setup: { resumeFromSec: 0, payload: { config: { mode: 'run' } } },
      started_at: new Date(startedMs).toISOString(),
      paused_at: new Date(pausedMs).toISOString(),
      seconds_target: null,
    }
    const result = await getActiveTimerSession()
    if ('error' in result) throw new Error('unexpected fail')
    expect(result.data!.pausedAt).toBe(pausedMs)
    expect(result.data!.secondsTarget).toBeNull()
  })

  it('fails when not signed in (never returns another member row)', async () => {
    PROFILE_ID = null
    const result = await getActiveTimerSession()
    expect('error' in result).toBe(true)
    expect(rec.selectEqs).toHaveLength(0)
  })
})
