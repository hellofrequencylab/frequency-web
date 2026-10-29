import { describe, expect, it } from 'vitest'
import { resolveNotificationType } from './registry'
import { routeNotification } from './router'

// THE THREE PASS 8 ROWS (calendar suite, LIVE-1709): lifecycle news, push only, tag collapses a repeat.

const ctx = { title: 'T', body: 'B', url: '/spaces/lab/settings/calendar', tag: 'plan-hold:p1' }

describe('plan.hold_warning, plan.hold_released, plan.todo_overdue', () => {
  for (const event of ['plan.hold_warning', 'plan.hold_released', 'plan.todo_overdue'] as const) {
    it(`${event} is a push-only lifecycle note`, () => {
      const t = resolveNotificationType(event)
      expect(t.category).toBe('lifecycle')
      expect(t.transactional ?? false).toBe(false)
      expect(t.channels).toEqual(['push'])
      expect(t.render(ctx)).toEqual({ push: ctx })
    })
  }

  it('the router gates on the member\'s own switch and enqueues the push with the category', async () => {
    const enqueued: [string, Record<string, unknown>][] = []
    const routed = await routeNotification(
      'plan.todo_overdue',
      { profileId: 'mara', subject: { subjectType: 'space', subjectId: 's1' } },
      ctx,
      {},
      {
        resolveGate: async () => ({ allowed: true, reason: 'ok' }),
        enqueueJob: async (kind, payload) => void enqueued.push([kind, payload]),
      },
    )
    expect(routed.enqueuedCount).toBe(1)
    expect(enqueued).toEqual([['push', { profileId: 'mara', payload: ctx, category: 'lifecycle' }]])

    const muted = await routeNotification(
      'plan.hold_warning',
      { profileId: 'mara' },
      ctx,
      {},
      { resolveGate: async () => ({ allowed: false, reason: 'pref_off' }), enqueueJob: async () => {} },
    )
    expect(muted.enqueuedCount).toBe(0)
    expect(muted.outcomes[0].reason).toBe('pref_off')
  })
})
