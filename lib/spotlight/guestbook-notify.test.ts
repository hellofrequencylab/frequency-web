import { describe, it, expect, vi } from 'vitest'

// The Guestbook sign notice (ADR-1279): two channels, both behind the OWNER's `comments`
// preferences and both riding the registry row `guestbook.sign`. The router's send-gate reads
// inapp_comments and push_comments; what these lock is the DECISION on this side: the copy and
// ids handed to the router, what is reported from its outcomes, and that nothing ever throws.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }))
vi.mock('@/lib/notifications/router', () => ({ routeNotification: vi.fn() }))

import { notifyGuestbookSigned, type GuestbookNotifyDeps } from './guestbook'

function client(signer: { display_name?: string | null; handle?: string | null } | null) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: signer }) }) }) }),
  } as unknown as NonNullable<GuestbookNotifyDeps['client']>
}

const routed = (outcomes: { channel: 'inapp' | 'push'; enqueued: boolean }[]) =>
  vi.fn(async () => ({
    event: 'guestbook.sign' as const,
    outcomes: outcomes.map((o) => ({ ...o, reason: o.enqueued ? ('ok' as const) : ('pref_off' as const) })),
    enqueuedCount: outcomes.filter((o) => o.enqueued).length,
  }))

const input = { ownerProfileId: 'owner-1', ownerHandle: 'ada', signerProfileId: 'signer-1' }

describe('notifyGuestbookSigned', () => {
  it('routes one notice carrying the copy, the guestbook url and the ids the bell row needs', async () => {
    const route = routed([{ channel: 'inapp', enqueued: true }, { channel: 'push', enqueued: true }])
    const out = await notifyGuestbookSigned(input, { client: client({ display_name: 'Grace', handle: 'grace' }), route })

    expect(out).toEqual({ inapp: true, push: 1 })
    expect(route).toHaveBeenCalledWith(
      'guestbook.sign',
      { profileId: 'owner-1' },
      {
        title: 'New note in your guestbook',
        body: 'Grace signed your guestbook.',
        url: '/people/ada#guestbook',
        ownerHandle: 'ada',
        signerProfileId: 'signer-1',
      },
    )
  })

  it('reports only the channels the router actually enqueued, and falls back to the handle for the name', async () => {
    const route = routed([{ channel: 'inapp', enqueued: false }, { channel: 'push', enqueued: true }])
    const out = await notifyGuestbookSigned(input, { client: client({ handle: 'grace' }), route })
    expect(out).toEqual({ inapp: false, push: 1 })
    expect((route.mock.calls[0] as unknown[])[2]).toMatchObject({ body: '@grace signed your guestbook.' })
  })

  it('never throws: a throwing router is logged and reported as not sent', async () => {
    const log = vi.fn()
    const out = await notifyGuestbookSigned(input, {
      client: client(null),
      route: async () => { throw new Error('outbox down') },
      log,
    })
    expect(out).toEqual({ inapp: false, push: 0 })
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toMatch(/threw/)
  })

  it('does nothing with an incomplete input', async () => {
    const route = vi.fn()
    const out = await notifyGuestbookSigned({ ...input, ownerHandle: '' }, { client: client(null), route })
    expect(out).toEqual({ inapp: false, push: 0 })
    expect(route).not.toHaveBeenCalled()
  })
})
