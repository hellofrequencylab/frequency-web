import { beforeEach, describe, expect, it, vi } from 'vitest'

// The 'inapp' outbox handler: one `notifications` row per job, and a loud failure (so the drain
// retries and dead-letters) rather than a silently missing bell row.

const m = vi.hoisted(() => ({ insert: vi.fn(), error: null as { message: string } | null }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        m.insert(table, row)
        return { error: m.error }
      },
    }),
  }),
}))

import { INAPP_JOB_KIND, runInappNotification } from './inapp'

const run = (payload: Record<string, unknown>) => runInappNotification(payload, undefined as never)

beforeEach(() => {
  m.insert.mockReset()
  m.error = null
})

describe('runInappNotification', () => {
  it('is the kind the router enqueues', () => {
    expect(INAPP_JOB_KIND).toBe('inapp')
  })

  it('writes one notifications row in the bell shape', async () => {
    await run({ profileId: 'p1', type: 'guestbook_signed', body: 'signed your guestbook', actorId: 's1', referenceType: 'guestbook', referenceId: 'ada' })
    expect(m.insert).toHaveBeenCalledWith('notifications', {
      recipient_id: 'p1',
      actor_id: 's1',
      type: 'guestbook_signed',
      reference_type: 'guestbook',
      reference_id: 'ada',
      body: 'signed your guestbook',
    })
  })

  it('leaves the optional columns null', async () => {
    await run({ profileId: 'p1', type: 'x', body: 'b' })
    expect(m.insert.mock.calls[0][1]).toMatchObject({ actor_id: null, reference_type: null, reference_id: null })
  })

  it('throws on a malformed job so it dead-letters instead of vanishing', async () => {
    await expect(run({ type: 'x', body: 'b' })).rejects.toThrow(/missing/)
    await expect(run({ profileId: 'p1', body: 'b' })).rejects.toThrow(/missing/)
    await expect(run({ profileId: 'p1', type: 'x', body: '  ' })).rejects.toThrow(/missing/)
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('throws when the insert fails so the drain retries', async () => {
    m.error = { message: 'db down' }
    await expect(run({ profileId: 'p1', type: 'x', body: 'b' })).rejects.toThrow(/db down/)
  })
})
