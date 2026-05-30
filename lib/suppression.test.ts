import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controllable mock of the admin client: a chainable builder that records the
// .eq() filter and the .upsert() payload, and returns a settable row.
const state: { row: { email: string } | null } = { row: null }
const eqSpy = vi.fn()
const upsertSpy = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          eqSpy(col, val)
          return { maybeSingle: async () => ({ data: state.row }) }
        },
      }),
      upsert: (payload: unknown, opts: unknown) => {
        upsertSpy(payload, opts)
        return Promise.resolve({ error: null })
      },
    }),
  }),
}))

import { isSuppressed, suppress } from '@/lib/suppression'

describe('isSuppressed', () => {
  beforeEach(() => {
    state.row = null
    eqSpy.mockClear()
  })

  it('is false when there is no suppression row', async () => {
    state.row = null
    expect(await isSuppressed('a@b.com')).toBe(false)
  })

  it('is true when a row exists, and looks up the lowercased email', async () => {
    state.row = { email: 'a@b.com' }
    expect(await isSuppressed('  A@B.com ')).toBe(true)
    expect(eqSpy).toHaveBeenCalledWith('email', 'a@b.com')
  })
})

describe('suppress', () => {
  beforeEach(() => upsertSpy.mockClear())

  it('upserts the lowercased email with its reason (idempotent)', async () => {
    await suppress('  Foo@Bar.COM ', 'hard_bounce')
    expect(upsertSpy).toHaveBeenCalledWith(
      { email: 'foo@bar.com', reason: 'hard_bounce' },
      expect.objectContaining({ onConflict: 'email' }),
    )
  })
})
