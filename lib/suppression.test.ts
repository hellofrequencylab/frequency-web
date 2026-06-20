import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controllable mock of the admin client. email_suppressions now carries a nullable space_id
// (20260714000000_space_email.sql): a NULL row is a GLOBAL suppression, a row with a space_id is
// scoped to one Space. isSuppressed reads the rows for an address (.select().eq('email', ...)) and
// matches the scope in code; suppress pre-checks the (scope, address) row then inserts. The mock
// records the .eq() filter, the rows returned for a read, and the .insert() payload.
const state: { rows: { space_id: string | null }[] } = { rows: [] }
const eqSpy = vi.fn()
const insertSpy = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          eqSpy(col, val)
          // Terminal read: a thenable resolving to the address's suppression rows.
          return Promise.resolve({ data: state.rows })
        },
      }),
      insert: (payload: unknown) => {
        insertSpy(payload)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { isSuppressed, suppress } from '@/lib/suppression'

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
