import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controllable mock of the admin client. email_suppressions now carries a nullable space_id
// (20260714000000_space_email.sql): a NULL row is a GLOBAL suppression, a row with a space_id is
// scoped to one Space. isSuppressed reads the rows for an address (.select().eq('email', ...)) and
// matches the scope in code; suppress pre-checks the (scope, address) row then inserts. The mock
// records the .eq() filter, the rows returned for a read, and the .insert() payload.
const state: {
  rows: { space_id: string | null }[]
  readError: { code: string; message: string } | null
  insertError: { code: string; message: string } | null
} = { rows: [], readError: null, insertError: null }
const eqSpy = vi.fn()
const insertSpy = vi.fn()
// EMAIL-083: the contacts opt-out sync. Records each update payload with its filters.
const contactUpdates: { payload: unknown; filters: [string, string, unknown][] }[] = []
let contactUpdateError: { message: string } | null = null

function contactsUpdate(payload: unknown) {
  const entry = { payload, filters: [] as [string, string, unknown][] }
  contactUpdates.push(entry)
  const chain = {
    eq: (col: string, val: unknown) => (entry.filters.push(['eq', col, val]), chain),
    neq: (col: string, val: unknown) => (entry.filters.push(['neq', col, val]), chain),
    then: (resolve: (r: { error: unknown }) => unknown) => Promise.resolve(resolve({ error: contactUpdateError })),
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'contacts' ? { update: contactsUpdate } : ({
      select: () => ({
        eq: (col: string, val: unknown) => {
          eqSpy(col, val)
          // Terminal read: a thenable resolving to the address's suppression rows.
          return Promise.resolve(
            state.readError ? { data: null, error: state.readError } : { data: state.rows, error: null },
          )
        },
      }),
      insert: (payload: unknown) => {
        insertSpy(payload)
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

// SCAN-763: supabase-js resolves with { error } instead of rejecting. Before this, suppress() had an
// empty catch and recordEmailEvent() never read the error, so the Resend webhook could never 503 and
// release its svix claim: a bounce or complaint that failed to save during a database blip was
// acked as handled and the address kept getting mail.
describe('suppress surfaces a database failure (SCAN-763)', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    state.rows = []
    state.readError = null
    state.insertError = null
  })

  it('rejects when the insert resolves with a non-duplicate error (XX000)', async () => {
    state.insertError = { code: 'XX000', message: 'internal_error' }
    await expect(suppress('a@b.com', 'complaint')).rejects.toThrow('internal_error')
  })

  it('resolves on a duplicate-key race (23505): the row we wanted now exists', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    await expect(suppress('a@b.com', 'complaint')).resolves.toBeUndefined()
  })

  it('rejects when the pre-check read fails, and never inserts blind', async () => {
    state.readError = { code: '57P01', message: 'terminating connection' }
    await expect(suppress('a@b.com', 'hard_bounce')).rejects.toThrow('terminating connection')
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

describe('recordEmailEvent surfaces a database failure (SCAN-763)', () => {
  beforeEach(() => {
    insertSpy.mockClear()
    state.insertError = null
  })

  it('resolves and writes the normalized row when the insert succeeds', async () => {
    await recordEmailEvent({ email: ' A@B.com ', eventType: 'delivered', providerId: 'r-1' })
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', event_type: 'delivered', provider_id: 'r-1' }),
    )
  })

  it('rejects when the insert resolves with an error', async () => {
    state.insertError = { code: 'XX000', message: 'internal_error' }
    await expect(recordEmailEvent({ email: 'a@b.com', eventType: 'bounced' })).rejects.toThrow('internal_error')
  })
})

describe('bounce classification (EMAIL-052)', async () => {
  const { classifyBounce, bounceSuppressionReason, SOFT_BOUNCE_LIMIT } = await import('./suppression')
  it('only an explicit Transient is soft', () => {
    expect(classifyBounce({ bounce: { type: 'Transient', subType: 'MailboxFull' } })).toBe('transient')
    expect(classifyBounce({ bounce: { type: 'Permanent' } })).toBe('permanent')
    expect(classifyBounce({ bounce: { type: 'Undetermined' } })).toBe('permanent')
    expect(classifyBounce({})).toBe('permanent')
    expect(classifyBounce(null)).toBe('permanent')
  })
  it('a soft bounce suppresses only once it repeats', () => {
    expect(bounceSuppressionReason('permanent', 0)).toBe('hard_bounce')
    expect(bounceSuppressionReason('transient', 0)).toBeNull()
    expect(bounceSuppressionReason('transient', SOFT_BOUNCE_LIMIT - 2)).toBeNull()
    expect(bounceSuppressionReason('transient', SOFT_BOUNCE_LIMIT - 1)).toBe('soft_bounce_repeat')
  })
})

describe('suppress marks the contact unsubscribed on a real opt-out (EMAIL-083)', () => {
  beforeEach(() => {
    state.rows = []
    state.readError = null
    state.insertError = null
    contactUpdates.length = 0
    contactUpdateError = null
  })

  it('an unsubscribe for a Space marks that Space\'s contact rows unsubscribed', async () => {
    await suppress(' A@B.com ', 'unsubscribe', 'space-A')
    expect(contactUpdates).toEqual([
      {
        payload: { consent_state: 'unsubscribed' },
        filters: [['eq', 'email', 'a@b.com'], ['neq', 'consent_state', 'unsubscribed'], ['eq', 'space_id', 'space-A']],
      },
    ])
  })

  it('a global complaint marks every contact row with the address', async () => {
    await suppress('a@b.com', 'complaint')
    expect(contactUpdates).toHaveLength(1)
    expect(contactUpdates[0].filters).toEqual([['eq', 'email', 'a@b.com'], ['neq', 'consent_state', 'unsubscribed']])
  })

  it('an already-suppressed address still gets its stale contact record fixed', async () => {
    state.rows = [{ space_id: 'space-A' }]
    await suppress('a@b.com', 'unsubscribe', 'space-A')
    expect(contactUpdates).toHaveLength(1)
  })

  it('a hard bounce does not change consent (undeliverable is not a refusal)', async () => {
    await suppress('a@b.com', 'hard_bounce')
    expect(contactUpdates).toEqual([])
  })

  it('a failed contact sync never fails the suppression (the row every send checks already landed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    contactUpdateError = { message: 'boom' }
    await expect(suppress('a@b.com', 'unsubscribe')).resolves.toBeUndefined()
    expect(insertSpy).toHaveBeenCalled()
  })

  it('a failed suppression insert throws before any contact change', async () => {
    state.insertError = { code: '08006', message: 'connection lost' }
    await expect(suppress('a@b.com', 'unsubscribe')).rejects.toThrow('connection lost')
    expect(contactUpdates).toEqual([])
  })
})
