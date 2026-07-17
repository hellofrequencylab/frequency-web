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
