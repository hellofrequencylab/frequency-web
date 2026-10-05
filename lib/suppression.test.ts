import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controllable mock of the admin client. email_suppressions now carries a nullable space_id
// (20260714000000_space_email.sql): a NULL row is a GLOBAL suppression, a row with a space_id is
// scoped to one Space. isSuppressed reads the rows for an address (.select().eq('email', ...)) and
// matches the scope in code; suppress pre-checks the (scope, address) row then inserts. The mock
// records the .eq() filter, the rows returned for a read, and the .insert() payload.
const state: {
  rows: { space_id: string | null }[]
  readError: { message: string } | null
  insertError: { code: string; message: string } | null
} = { rows: [], readError: null, insertError: null }
const eqSpy = vi.fn()
const insertSpy = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          eqSpy(col, val)
          // Terminal read: a thenable resolving to the address's suppression rows.
          return Promise.resolve({ data: state.readError ? null : state.rows, error: state.readError })
        },
      }),
      insert: (payload: unknown) => {
        insertSpy(payload)
        // supabase-js RESOLVES with { error }; it never rejects. That is the shape SCAN-763 is about.
        return Promise.resolve({ error: state.insertError })
      },
    }),
  }),
}))

import { isSuppressed, suppress, recordEmailEvent } from '@/lib/suppression'

describe('isSuppressed (global-only, the existing behavior)', () => {
  beforeEach(() => {
    state.rows = []
    eqSpy.mockClear()
  })

  it('is false when there is no suppression row', async () => {
    state.rows = []
    expect(await isSuppressed('a@b.com')).toBe(false)
  })

  it('is true for a GLOBAL row, and looks up the lowercased email', async () => {
    state.rows = [{ space_id: null }]
    expect(await isSuppressed('  A@B.com ')).toBe(true)
    expect(eqSpy).toHaveBeenCalledWith('email', 'a@b.com')
  })

  it('a global-only check IGNORES a per-Space-only suppression (no spaceId passed)', async () => {
    state.rows = [{ space_id: 'space-A' }] // suppressed only in space A
    expect(await isSuppressed('a@b.com')).toBe(false)
  })
})

describe('isSuppressed (per-Space scope)', () => {
  beforeEach(() => {
    state.rows = []
  })

  it('is true when suppressed for THIS Space', async () => {
    state.rows = [{ space_id: 'space-A' }]
    expect(await isSuppressed('a@b.com', 'space-A')).toBe(true)
  })

  it('is true when suppressed GLOBALLY (applies to every Space)', async () => {
    state.rows = [{ space_id: null }]
    expect(await isSuppressed('a@b.com', 'space-A')).toBe(true)
  })

  it('is false when suppressed only for a DIFFERENT Space', async () => {
    state.rows = [{ space_id: 'space-B' }]
    expect(await isSuppressed('a@b.com', 'space-A')).toBe(false)
  })
})

describe('suppress', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    state.rows = []
    state.readError = null
    state.insertError = null
  })

  it('inserts the lowercased email with its reason as a GLOBAL suppression (no space_id)', async () => {
    await suppress('  Foo@Bar.COM ', 'hard_bounce')
    expect(insertSpy).toHaveBeenCalledWith({ email: 'foo@bar.com', reason: 'hard_bounce' })
  })

  it('inserts a SPACE-SCOPED suppression when a spaceId is given', async () => {
    await suppress('a@b.com', 'unsubscribe', 'space-A')
    expect(insertSpy).toHaveBeenCalledWith({ email: 'a@b.com', reason: 'unsubscribe', space_id: 'space-A' })
  })

  it('is idempotent: skips the insert when the (scope, address) row already exists', async () => {
    state.rows = [{ space_id: null }] // already globally suppressed
    await suppress('a@b.com', 'hard_bounce')
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

// ── SCAN-763: a failed write is the caller's to see ────────────────────────────────────────────
//
// suppress() used to wrap everything in an empty catch and never read the resolved `{ error }`, so
// the Resend webhook could not tell a saved suppression from a lost one: it acked 200, kept its svix
// claim, and the bouncing address kept getting mail. The contract now: a real DB error rejects; the
// one benign failure, a unique-index race (23505), still resolves because the row exists either way.
describe('suppress surfaces a failed write (SCAN-763)', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    state.rows = []
    state.readError = null
    state.insertError = null
  })

  it('REJECTS when the insert resolves with a real error (XX000), so the webhook can 503 and redeliver', async () => {
    state.insertError = { code: 'XX000', message: 'internal_error' }
    await expect(suppress('a@b.com', 'complaint')).rejects.toThrow(/internal_error/)
  })

  it('RESOLVES on a unique-index race (23505): a concurrent insert means the row exists', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    await expect(suppress('a@b.com', 'complaint')).resolves.toBeUndefined()
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it('REJECTS when the pre-check read fails rather than inserting on top of an unknown state', async () => {
    state.readError = { message: 'connection reset' }
    await expect(suppress('a@b.com', 'hard_bounce')).rejects.toThrow(/connection reset/)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

describe('recordEmailEvent surfaces a failed append (SCAN-763)', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    state.insertError = null
  })

  it('resolves when the append lands', async () => {
    await expect(recordEmailEvent({ email: 'A@B.com', eventType: 'delivered' })).resolves.toBeUndefined()
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ email: 'a@b.com', event_type: 'delivered' }))
  })

  it('REJECTS when the append resolves with an error, so the webhook releases its claim', async () => {
    state.insertError = { code: 'XX000', message: 'email_events unavailable' }
    await expect(recordEmailEvent({ email: 'a@b.com', eventType: 'bounced' })).rejects.toThrow(/email_events unavailable/)
  })
})
