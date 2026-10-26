import { describe, expect, it } from 'vitest'
import type { EmailPayload } from '@/lib/email'
import { NOTIFICATION_REGISTRY, resolveNotificationType, type NotificationEvent } from './registry'

// THE CATALOG, as a whole. router.test.ts pins the first rows by name; this file holds the
// invariants that must stay true as rows are added, and the rows that file does not name
// (order.shipped, housing.match, loyalty.nudge).

const EVENTS = Object.keys(NOTIFICATION_REGISTRY) as NotificationEvent[]
const email = { to: 'a@b.c', subject: 'S', html: '<p>x</p>' } as EmailPayload

describe('NOTIFICATION_REGISTRY invariants', () => {
  it('keys every row by its own event name and resolves each one', () => {
    expect(EVENTS.length).toBeGreaterThan(0)
    for (const event of EVENTS) {
      expect(NOTIFICATION_REGISTRY[event].event).toBe(event)
      expect(resolveNotificationType(event)).toBe(NOTIFICATION_REGISTRY[event])
    }
  })

  it('declares at least one channel per row, none twice, and none on the in-app channel yet', () => {
    for (const event of EVENTS) {
      const { channels } = NOTIFICATION_REGISTRY[event]
      expect(channels.length, event).toBeGreaterThan(0)
      expect(new Set(channels).size, event).toBe(channels.length)
      expect(channels, event).not.toContain('inapp')
    }
  })

  it('flags a row transactional exactly when its category is transactional', () => {
    for (const event of EVENTS) {
      const t = NOTIFICATION_REGISTRY[event]
      expect(t.transactional === true, event).toBe(t.category === 'transactional')
    }
  })

  it('never lets a transactional row ride a push channel, so consent-free mail stays mail', () => {
    for (const event of EVENTS) {
      const t = NOTIFICATION_REGISTRY[event]
      if (t.transactional) expect(t.channels, event).toEqual(['email'])
    }
  })
})

describe('rows router.test.ts does not name', () => {
  it('order.shipped is lifecycle news, not a receipt, and skips email when the buyer has no address', () => {
    const t = resolveNotificationType('order.shipped')
    expect(t.category).toBe('lifecycle')
    expect(t.transactional ?? false).toBe(false)
    expect(t.channels).toEqual(['email', 'push'])
    const base = { title: 'T', body: 'B', url: '/orders/1' }
    expect(t.render(base)).toEqual({ push: base })
    expect(t.render({ ...base, email })).toEqual({ push: base, email })
  })

  it('housing.match rides the matches category and carries the collapse tag on the push only', () => {
    const t = resolveNotificationType('housing.match')
    expect(t.category).toBe('matches')
    expect(t.channels).toEqual(['email', 'push'])
    const ctx = { title: 'T', body: 'B', url: '/housing', tag: 'housing:p:q' }
    expect(t.render(ctx)).toEqual({ push: ctx })
    expect(t.render({ ...ctx, email })).toEqual({ push: ctx, email })
  })

  it('loyalty.nudge is a push-only lifecycle nudge', () => {
    const t = resolveNotificationType('loyalty.nudge')
    expect(t.category).toBe('lifecycle')
    expect(t.channels).toEqual(['push'])
    const ctx = { title: 'T', body: 'B', url: '/spaces/lab', tag: 'loyalty:lab' }
    expect(t.render(ctx)).toEqual({ push: ctx })
  })
})
