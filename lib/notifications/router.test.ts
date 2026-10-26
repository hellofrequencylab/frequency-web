import { describe, it, expect, vi } from 'vitest'
import { routeNotification, type RouterDeps } from './router'
import {
  resolveNotificationType,
  NOTIFICATION_REGISTRY,
  type NotificationEvent,
} from './registry'
import type { SendGateDecision } from '@/lib/comms/send-gate'
import type { EmailPayload } from '@/lib/email'

// ── The registry: the declarative catalog is the source of truth ──────────────
// A registry lookup is PURE — no IO — so the mapping event → category/channels is a plain
// assertion. Every catalogued event must resolve; an unknown event is a programming error.

describe('resolveNotificationType — pure registry lookup', () => {
  it('maps event.dispatch to the community push type', () => {
    const t = resolveNotificationType('event.dispatch')
    expect(t.category).toBe('dispatches')
    expect(t.channels).toEqual(['push'])
    expect(t.transactional ?? false).toBe(false)
  })

  it('maps booking.reminder to the transactional email type', () => {
    const t = resolveNotificationType('booking.reminder')
    expect(t.category).toBe('transactional')
    expect(t.channels).toEqual(['email'])
    expect(t.transactional).toBe(true)
  })

  it('maps guestbook.sign to the comments in-app + push type and renders both from the context (ADR-1279)', () => {
    const t = resolveNotificationType('guestbook.sign')
    expect(t.category).toBe('comments')
    expect(t.channels).toEqual(['inapp', 'push'])
    expect(t.transactional ?? false).toBe(false)
    expect(
      t.render({ title: 'T', body: 'B', url: '/people/ada#guestbook', ownerHandle: 'ada', signerProfileId: 'signer-1' }),
    ).toEqual({
      inapp: { type: 'guestbook_signed', body: 'signed your guestbook', actorId: 'signer-1', referenceType: 'guestbook', referenceId: 'ada' },
      push: { title: 'T', body: 'B', url: '/people/ada#guestbook' },
    })
  })

  it('maps the three shared-Plan moments onto the categories the grid already wires (PROG-CAL7, LIVE-545)', () => {
    const share = resolveNotificationType('plan.share')
    expect(share.category).toBe('lifecycle')
    expect(share.channels).toEqual(['email', 'push'])
    expect(share.transactional ?? false).toBe(false)
    const email = { to: 'a@b.c', subject: 'S', html: '<p>x</p>' } as EmailPayload
    expect(share.render({ title: 'T', body: 'B', url: '/spaces/lab/settings/calendar', tag: 'plan-share:p:requested', email })).toEqual({
      push: { title: 'T', body: 'B', url: '/spaces/lab/settings/calendar', tag: 'plan-share:p:requested' },
      email,
    })
    expect(share.render({ title: 'T', body: 'B', url: '/x', tag: 't' })).toEqual({ push: { title: 'T', body: 'B', url: '/x', tag: 't' } })
    for (const event of ['plan.comment', 'plan.assign'] as const) {
      const t = resolveNotificationType(event)
      expect(t.category).toBe('comments')
      expect(t.channels).toEqual(['push'])
      expect(t.render({ title: 'T', body: 'B', url: '/x', tag: 't' })).toEqual({ push: { title: 'T', body: 'B', url: '/x', tag: 't' } })
    }
  })

  it('throws on an unknown event (a catalogue bug, not a runtime denial)', () => {
    expect(() => resolveNotificationType('nope.nope' as NotificationEvent)).toThrow(/no registry entry/)
  })

  it('every catalogued event has a render fn and at least one channel', () => {
    for (const event of Object.keys(NOTIFICATION_REGISTRY) as NotificationEvent[]) {
      const t = resolveNotificationType(event)
      expect(typeof t.render).toBe('function')
      expect(t.channels.length).toBeGreaterThan(0)
    }
  })
})

// ── The routing decision: gate per channel, enqueue only the allowed ──────────
// Injected seams (resolveGate + enqueueJob) make the decision testable with no database.

const allow: SendGateDecision = { allowed: true, reason: 'ok' }
const deny = (reason: SendGateDecision['reason']): SendGateDecision => ({ allowed: false, reason })

function fakeDeps(decision: SendGateDecision): {
  deps: RouterDeps
  enqueued: { kind: string; payload: Record<string, unknown> }[]
  gate: ReturnType<typeof vi.fn>
} {
  const enqueued: { kind: string; payload: Record<string, unknown> }[] = []
  const gate = vi.fn(async () => decision)
  const deps: RouterDeps = {
    resolveGate: gate as unknown as RouterDeps['resolveGate'],
    enqueueJob: async (kind, payload) => {
      enqueued.push({ kind, payload })
    },
  }
  return { deps, enqueued, gate }
}

describe('routeNotification — the in-app channel (guestbook.sign)', () => {
  const ctx = { title: 'T', body: 'B', url: '/people/ada#guestbook', ownerHandle: 'ada', signerProfileId: 'signer-1' }

  it('enqueues an inapp job next to the push when the gate allows both', async () => {
    const { deps, enqueued, gate } = fakeDeps(allow)
    const result = await routeNotification('guestbook.sign', { profileId: 'owner-1' }, ctx, {}, deps)
    expect(result.enqueuedCount).toBe(2)
    expect(gate).toHaveBeenCalledWith('owner-1', 'inapp', 'comments', expect.anything())
    expect(enqueued[0]).toEqual({
      kind: 'inapp',
      payload: {
        profileId: 'owner-1',
        type: 'guestbook_signed',
        body: 'signed your guestbook',
        actorId: 'signer-1',
        referenceType: 'guestbook',
        referenceId: 'ada',
      },
    })
    expect(enqueued[1].kind).toBe('push')
  })

  it('writes no bell row when the member has the in-app switch off, and the push still goes to the gate', async () => {
    const enqueued: string[] = []
    const deps: RouterDeps = {
      resolveGate: (async (_id: string, channel: string) => (channel === 'inapp' ? deny('pref_off') : allow)) as unknown as RouterDeps['resolveGate'],
      enqueueJob: async (kind) => {
        enqueued.push(kind)
      },
    }
    const result = await routeNotification('guestbook.sign', { profileId: 'owner-1' }, ctx, {}, deps)
    expect(result.outcomes).toEqual([
      { channel: 'inapp', reason: 'pref_off', enqueued: false },
      { channel: 'push', reason: 'ok', enqueued: true },
    ])
    expect(enqueued).toEqual(['push'])
  })
})

describe('routeNotification — post.mention (in-app only)', () => {
  const ctx = { authorId: 'author-1', postId: 'post-1', context: 'a post' }

  it('enqueues one inapp job in the bell row shape, gated on inapp_mentions', async () => {
    const { deps, enqueued, gate } = fakeDeps(allow)
    const result = await routeNotification('post.mention', { profileId: 'member-1' }, ctx, {}, deps)
    expect(result.outcomes).toEqual([{ channel: 'inapp', reason: 'ok', enqueued: true }])
    expect(gate).toHaveBeenCalledWith('member-1', 'inapp', 'mentions', expect.anything())
    expect(enqueued).toEqual([
      {
        kind: 'inapp',
        payload: {
          profileId: 'member-1',
          type: 'mention',
          body: 'mentioned you in a post',
          actorId: 'author-1',
          referenceType: 'post',
          referenceId: 'post-1',
        },
      },
    ])
  })

  it('writes nothing when the member has the in-app mentions switch off', async () => {
    const { deps, enqueued } = fakeDeps(deny('pref_off'))
    const result = await routeNotification('post.mention', { profileId: 'member-1' }, ctx, {}, deps)
    expect(result.enqueuedCount).toBe(0)
    expect(enqueued).toEqual([])
  })
})

describe('routeNotification — post.reply (in-app only)', () => {
  const ctx = { replierId: 'replier-1', postId: 'post-1' }

  it('enqueues one inapp job in the bell row shape, gated on inapp_comments', async () => {
    const { deps, enqueued, gate } = fakeDeps(allow)
    const result = await routeNotification('post.reply', { profileId: 'author-1' }, ctx, {}, deps)
    expect(result.outcomes).toEqual([{ channel: 'inapp', reason: 'ok', enqueued: true }])
    expect(gate).toHaveBeenCalledWith('author-1', 'inapp', 'comments', expect.anything())
    expect(enqueued).toEqual([
      {
        kind: 'inapp',
        payload: {
          profileId: 'author-1',
          type: 'reply',
          body: 'replied to your post',
          actorId: 'replier-1',
          referenceType: 'post',
          referenceId: 'post-1',
        },
      },
    ])
  })

  it('writes nothing when the author has the in-app comments switch off', async () => {
    const { deps, enqueued } = fakeDeps(deny('pref_off'))
    const result = await routeNotification('post.reply', { profileId: 'author-1' }, ctx, {}, deps)
    expect(result.enqueuedCount).toBe(0)
    expect(enqueued).toEqual([])
  })
})

describe('routeNotification — event.dispatch (push)', () => {
  it('enqueues a push job in the outbox shape when the gate allows', async () => {
    const { deps, enqueued, gate } = fakeDeps(allow)
    const result = await routeNotification(
      'event.dispatch',
      { profileId: 'p1' },
      { title: 'Doors at 7', body: 'Come early', url: '/events/x' },
      {},
      deps,
    )

    expect(result.enqueuedCount).toBe(1)
    expect(result.outcomes).toEqual([{ channel: 'push', reason: 'ok', enqueued: true }])
    // The gate is asked about the push channel + the registry's category.
    expect(gate).toHaveBeenCalledWith('p1', 'push', 'dispatches', expect.anything())
    // The job matches what the outbox's `push` handler drains.
    expect(enqueued).toEqual([
      {
        kind: 'push',
        payload: {
          profileId: 'p1',
          payload: { title: 'Doors at 7', body: 'Come early', url: '/events/x' },
          category: 'dispatches',
        },
      },
    ])
  })

  it('enqueues nothing and records the reason when the gate denies (pref_off)', async () => {
    const { deps, enqueued } = fakeDeps(deny('pref_off'))
    const result = await routeNotification(
      'event.dispatch',
      { profileId: 'p1' },
      { title: 'T', body: 'B', url: '/e' },
      {},
      deps,
    )
    expect(result.enqueuedCount).toBe(0)
    expect(result.outcomes).toEqual([{ channel: 'push', reason: 'pref_off', enqueued: false }])
    expect(enqueued).toEqual([])
  })

  it('a transient gate error denies without enqueuing (fail-closed)', async () => {
    const { deps, enqueued } = fakeDeps(deny('error'))
    const result = await routeNotification(
      'event.dispatch',
      { profileId: 'p1' },
      { title: 'T', body: 'B', url: '/e' },
      {},
      deps,
    )
    expect(result.enqueuedCount).toBe(0)
    expect(result.outcomes[0].reason).toBe('error')
    expect(enqueued).toEqual([])
  })
})

describe('routeNotification — booking.reminder (transactional email)', () => {
  const email: EmailPayload = { to: 'm@x.com', subject: 'Reminder: Session', html: '<p>hi</p>', text: 'hi' }

  it('enqueues the rendered email on the raw email outbox kind', async () => {
    const { deps, enqueued, gate } = fakeDeps(allow)
    const result = await routeNotification(
      'booking.reminder',
      { profileId: 'p9', email: 'm@x.com' },
      { email },
      {},
      deps,
    )
    expect(result.enqueuedCount).toBe(1)
    // Transactional category → the gate is consulted for email + suppression state.
    expect(gate).toHaveBeenCalledWith('p9', 'email', 'transactional', expect.objectContaining({ email: 'm@x.com' }))
    expect(enqueued).toEqual([{ kind: 'email', payload: email as unknown as Record<string, unknown> }])
  })

  it('respects suppression (the one gate even transactional mail obeys)', async () => {
    const { deps, enqueued } = fakeDeps(deny('suppressed'))
    const result = await routeNotification(
      'booking.reminder',
      { profileId: 'p9', email: 'm@x.com' },
      { email },
      {},
      deps,
    )
    expect(result.enqueuedCount).toBe(0)
    expect(result.outcomes[0]).toEqual({ channel: 'email', reason: 'suppressed', enqueued: false })
    expect(enqueued).toEqual([])
  })
})

describe('routeNotification — frequency options + unknown event', () => {
  it('passes the frequency cap through to the gate', async () => {
    const { deps, gate } = fakeDeps(allow)
    await routeNotification(
      'event.dispatch',
      { profileId: 'p1' },
      { title: 'T', body: 'B', url: '/e' },
      { frequency: { sentInWindow: 2, cap: 3 } },
      deps,
    )
    expect(gate).toHaveBeenCalledWith(
      'p1',
      'push',
      'dispatches',
      expect.objectContaining({ frequency: { sentInWindow: 2, cap: 3 } }),
    )
  })

  it('throws on an unrecognised event before any gate/enqueue', async () => {
    const { deps, enqueued } = fakeDeps(allow)
    await expect(
      routeNotification(
        'ghost.event' as NotificationEvent,
        { profileId: 'p1' },
        {} as never,
        {},
        deps,
      ),
    ).rejects.toThrow(/no registry entry/)
    expect(enqueued).toEqual([])
  })
})
