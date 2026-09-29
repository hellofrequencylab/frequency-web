import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// HYG-144 (ADR-1636). The storage-backup cron against its REAL auth gate and REAL heartbeat
// wrapper. What it pins: a request without the bearer is refused; until all four R2 variables are
// set a run is INERT (200, one log line naming what is missing, no database client created); a
// half-set configuration is inert too; a configured run hands the loop the declared budget and
// answers 200 with its counts, and a failed copy answers 500 so the wrapper fail-pings.

const state = vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  return {
    adminCreated: 0,
    infos: [] as Array<{ event: string; fields: Record<string, unknown> | undefined }>,
    errors: [] as Array<{ event: string; fields: Record<string, unknown> | undefined }>,
    runLimits: [] as Array<{ maxItems: number; maxBytes: number }>,
    runResult: null as Record<string, unknown> | null,
  }
})

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn(), setTag: vi.fn() }))
vi.mock('@/lib/observability/tags', () => ({ setObservabilityTags: () => {} }))
vi.mock('@/lib/log', () => ({
  log: {
    info: (event: string, fields?: Record<string, unknown>) => { state.infos.push({ event, fields }) },
    warn: () => {},
    error: (event: string, fields?: Record<string, unknown>) => { state.errors.push({ event, fields }) },
  },
  briefError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    state.adminCreated += 1
    return {}
  },
}))
vi.mock('@/lib/backup/storage-copy', () => ({
  supabaseToR2Deps: () => ({}),
  runStorageCopy: async (_deps: unknown, limits: { maxItems: number; maxBytes: number }) => {
    state.runLimits.push(limits)
    return state.runResult
  },
}))

import { GET } from './route'

const R2_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BACKUP_BUCKET']

function req(auth = 'Bearer test-cron-secret') {
  return new Request('https://x.test/api/cron/storage-backup', { headers: auth ? { authorization: auth } : {} })
}

beforeEach(() => {
  state.adminCreated = 0
  state.infos.length = 0
  state.errors.length = 0
  state.runLimits.length = 0
  state.runResult = null
  delete process.env.CRON_HEARTBEAT_BASE_URL
  for (const k of R2_KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of R2_KEYS) delete process.env[k]
})

describe('storage-backup cron', () => {
  it('refuses a request without the cron bearer', async () => {
    const res = await GET(req('Bearer nope'))
    expect(res.status).toBe(401)
    expect(state.adminCreated).toBe(0)
  })

  it('is inert with no R2 variables: 200, one line naming all four, no database client', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, inert: true, missing: R2_KEYS })
    expect(state.infos.find((l) => l.event === 'cron.storage_backup.inert')?.fields).toEqual({ missing: R2_KEYS })
    expect(state.adminCreated).toBe(0)
    expect(state.runLimits).toEqual([])
  })

  it('is inert with a half-set configuration, and names the missing half (blank counts as unset)', async () => {
    process.env.R2_ACCOUNT_ID = 'acct'
    process.env.R2_ACCESS_KEY_ID = 'akid'
    process.env.R2_SECRET_ACCESS_KEY = '   '
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ inert: true, missing: ['R2_SECRET_ACCESS_KEY', 'R2_BACKUP_BUCKET'] })
    expect(state.adminCreated).toBe(0)
  })

  describe('configured', () => {
    beforeEach(() => {
      process.env.R2_ACCOUNT_ID = 'acct'
      process.env.R2_ACCESS_KEY_ID = 'akid'
      process.env.R2_SECRET_ACCESS_KEY = 'secret'
      process.env.R2_BACKUP_BUCKET = 'bucket'
    })

    it('runs the copy with the declared budget and answers 200 with its counts', async () => {
      state.runResult = { listed: 2, copied: 2, gone: 0, bytes: 20, stopped: 'caught_up', more: false, cursor_before: null, cursor_after: { at: 't', id: 'i' } }
      const res = await GET(req())
      expect(res.status).toBe(200)
      expect(state.adminCreated).toBe(1)
      expect(state.runLimits).toEqual([{ maxItems: 500, maxBytes: 1536 * 1024 * 1024 }])
      const body = await res.json()
      expect(body).toMatchObject({ ok: true, copied: 2, budget: { processed: 2, remaining: 0, more: false } })
      expect(state.infos.find((l) => l.event === 'cron.storage_backup.counts')?.fields).toMatchObject({ copied: 2, cursor_at: 't' })
    })

    it('answers 500 when a copy failed, naming the object', async () => {
      state.runResult = { listed: 3, copied: 1, gone: 0, bytes: 10, stopped: 'error', more: true, cursor_before: null, cursor_after: { at: 't', id: 'i' }, error: 'R2 PUT failed: HTTP 403', failed_key: 'posts/a.png' }
      const res = await GET(req())
      expect(res.status).toBe(500)
      expect(state.errors.find((l) => l.event === 'cron.storage_backup.failed')?.fields).toMatchObject({ failed_key: 'posts/a.png', error: 'R2 PUT failed: HTTP 403' })
    })
  })
})
