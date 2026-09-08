import { describe, it, expect, vi, beforeEach } from 'vitest'

// The Guestbook sign notice (ADR-1279): two channels, both behind the OWNER's `comments`
// preferences. In-app goes through the send-gate seam (resolveSendGate) before the bell row is
// written; push rides the registry row `guestbook.sign` (category `comments`), so the router's
// gate reads `push_comments`. Every seam is injected here, so what these lock is the DECISION:
// what is written, under which preference, with which copy, and that nothing ever throws.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/comms/send-gate', () => ({ resolveSendGate: vi.fn() }))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: vi.fn() }))

import { notifyGuestbookSigned, type GuestbookNotifyDeps } from './guestbook'

const inserts: Record<string, unknown>[] = []
function client(signer: { display_name?: string | null; handle?: string | null } | null, insertError: { message: string } | null = null) {
  return {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: signer }) }) }),
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row })
        return { error: insertError }
      },
    }),
  } as unknown as NonNullable<GuestbookNotifyDeps['client']>
}

const input = { ownerProfileId: 'owner-1', ownerHandle: 'ada', signerProfileId: 'signer-1' }

beforeEach(() => {
  inserts.length = 0
})

describe('notifyGuestbookSigned', () => {
  it('writes the bell row and routes the push when both comments switches are on', async () => {
    const gate = vi.fn(async () => ({ allowed: true, reason: 'ok' as const }))
    const route = vi.fn(async () => ({ event: 'guestbook.sign' as const, outcomes: [], enqueuedCount: 1 }))
    const out = await notifyGuestbookSigned(input, { client: client({ display_name: 'Grace', handle: 'grace' }), gate, route })

    expect(out).toEqual({ inapp: true, push: 1 })
    expect(gate).toHaveBeenCalledWith('owner-1', 'inapp', 'comments')
    expect(inserts).toEqual([
      {
        table: 'notifications',
        recipient_id: 'owner-1',
        actor_id: 'signer-1',
        type: 'guestbook_signed',
        reference_type: 'guestbook',
        reference_id: 'ada',
        body: 'signed your guestbook',
      },
    ])
    expect(route).toHaveBeenCalledWith(
      'guestbook.sign',
      { profileId: 'owner-1' },
      { title: 'New note in your guestbook', body: 'Grace signed your guestbook.', url: '/people/ada#guestbook' },
    )
  })

  it('skips the bell row when inapp_comments is off, and still offers the push to the gate', async () => {
    const route = vi.fn(async () => ({ event: 'guestbook.sign' as const, outcomes: [], enqueuedCount: 0 }))
    const out = await notifyGuestbookSigned(input, { client: client({ handle: 'grace' }), gate: async () => ({ allowed: false, reason: 'pref_off' as const }), route })
    expect(out).toEqual({ inapp: false, push: 0 })
    expect(inserts).toEqual([])
    expect(route).toHaveBeenCalledTimes(1)
    // No display name → the handle; the router decides push_comments, not this function.
    expect((route.mock.calls[0] as unknown[])[2]).toMatchObject({ body: '@grace signed your guestbook.' })
  })

  it('never throws: a failed insert or a throwing router are logged and reported as not sent', async () => {
    const log = vi.fn()
    const out = await notifyGuestbookSigned(input, {
      client: client(null, { message: 'nope' }),
      gate: async () => ({ allowed: true, reason: 'ok' as const }),
      route: async () => { throw new Error('outbox down') },
      log,
    })
    expect(out).toEqual({ inapp: false, push: 0 })
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[0][0]).toMatch(/insert failed/)
    expect(log.mock.calls[1][0]).toMatch(/push/)
  })

  it('does nothing with an incomplete input', async () => {
    const route = vi.fn()
    const out = await notifyGuestbookSigned({ ...input, ownerHandle: '' }, { client: client(null), gate: async () => ({ allowed: true, reason: 'ok' as const }), route })
    expect(out).toEqual({ inapp: false, push: 0 })
    expect(route).not.toHaveBeenCalled()
    expect(inserts).toEqual([])
  })
})
