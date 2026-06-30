import { describe, it, expect, vi, beforeEach } from 'vitest'

// Controllable admin-client mock: trigger-matched rules come back from the
// automation_rules select; the contacts select resolves the actor's email.
const state: {
  rules: { action_type: string; action_config: Record<string, unknown> }[]
  contactEmail: string | null
} = { rules: [], contactEmail: null }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table === 'automation_rules') {
          return {
            eq: () => ({
              eq: async () => ({ data: state.rules }),
            }),
          }
        }
        // contacts
        return {
          eq: () => ({
            maybeSingle: async () => ({ data: state.contactEmail ? { email: state.contactEmail } : null }),
          }),
        }
      },
    }),
  }),
}))

const enqueueEmail = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
vi.mock('@/lib/email', () => ({
  enqueueEmail: (...args: unknown[]) => enqueueEmail(...args),
  listUnsubscribeHeaders: () => ({}),
}))

vi.mock('@/lib/comms/send-gate', () => ({
  resolveSendGate: async () => ({ allowed: true, reason: 'ok' }),
}))

vi.mock('@/lib/unsubscribe-tokens', () => ({
  buildUnsubscribeUrl: () => 'https://example.com/unsub',
}))

vi.mock('@/lib/site', () => ({ SITE_URL: 'https://example.com' }))

const enqueue = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {})
vi.mock('@/lib/queue/outbox', () => ({
  enqueue: (...args: unknown[]) => enqueue(...args),
}))

import {
  isAutomationActionType,
  AUTOMATION_ACTION_TYPES,
  runAutomationsForEvent,
  evaluateConditions,
  parseConditions,
  isAutomationConditionOp,
  type AutomationCondition,
} from '@/lib/automations'

describe('isAutomationActionType', () => {
  it('accepts the known action types', () => {
    expect(isAutomationActionType('email_actor')).toBe(true)
    expect(isAutomationActionType('push_actor')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isAutomationActionType('sms_actor')).toBe(false)
    expect(isAutomationActionType('')).toBe(false)
    expect(isAutomationActionType(null)).toBe(false)
    expect(isAutomationActionType(123)).toBe(false)
  })

  it('lists email_actor and push_actor', () => {
    expect([...AUTOMATION_ACTION_TYPES]).toEqual(['email_actor', 'push_actor'])
  })
})

describe('runAutomationsForEvent — push_actor branch', () => {
  beforeEach(() => {
    state.rules = []
    state.contactEmail = null
    enqueueEmail.mockClear()
    enqueue.mockClear()
  })

  it('does nothing without an actor', async () => {
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'T', body: 'B' } }]
    await runAutomationsForEvent('practice.verified', null)
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('enqueues a push job for the actor with title/body and a default url', async () => {
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'Nice work', body: 'You did it' } }]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(enqueue).toHaveBeenCalledWith('push', {
      profileId: 'profile-1',
      payload: { title: 'Nice work', body: 'You did it', url: '/' },
      category: 'lifecycle',
    })
    // Push does not require the CRM email lookup, so no email is enqueued.
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('passes a provided url through as the deep link', async () => {
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'T', body: 'B', url: '/crew/journey' } }]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(enqueue).toHaveBeenCalledWith('push', {
      profileId: 'profile-1',
      payload: { title: 'T', body: 'B', url: '/crew/journey' },
      category: 'lifecycle',
    })
  })

  it('skips a push rule missing title or body', async () => {
    state.rules = [
      { action_type: 'push_actor', action_config: { title: '', body: 'B' } },
      { action_type: 'push_actor', action_config: { body: 'no title' } },
      { action_type: 'push_actor', action_config: { title: 'no body' } },
    ]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('never throws when enqueueing the push job rejects', async () => {
    enqueue.mockRejectedValueOnce(new Error('boom'))
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'T', body: 'B' } }]
    await expect(runAutomationsForEvent('practice.verified', 'profile-1')).resolves.toBeUndefined()
  })

  it('leaves the email_actor path working alongside push', async () => {
    state.contactEmail = 'a@b.com'
    state.rules = [
      { action_type: 'email_actor', action_config: { subject: 'Hi', body: 'There' } },
      { action_type: 'push_actor', action_config: { title: 'T', body: 'B' } },
    ]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(enqueueEmail).toHaveBeenCalledTimes(1)
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('fires only when the rule conditions hold for the event context', async () => {
    state.rules = [
      { action_type: 'push_actor', action_config: { title: 'T', body: 'B', conditions: [{ field: 'source', op: 'eq', value: 'qr' }] } },
    ]
    // Context misses the condition: nothing fires.
    await runAutomationsForEvent('practice.verified', 'profile-1', { source: 'web' })
    expect(enqueue).not.toHaveBeenCalled()
    // Context satisfies the condition: the push fires.
    await runAutomationsForEvent('practice.verified', 'profile-1', { source: 'qr' })
    expect(enqueue).toHaveBeenCalledTimes(1)
  })
})

describe('isAutomationConditionOp', () => {
  it('accepts the known operators and rejects others', () => {
    for (const op of ['eq', 'neq', 'exists', 'absent', 'gt', 'lt']) {
      expect(isAutomationConditionOp(op)).toBe(true)
    }
    expect(isAutomationConditionOp('contains')).toBe(false)
    expect(isAutomationConditionOp('')).toBe(false)
    expect(isAutomationConditionOp(null)).toBe(false)
  })
})

describe('parseConditions', () => {
  it('drops malformed entries and keeps valid predicates', () => {
    const raw = [
      { field: 'source', op: 'eq', value: 'qr' },
      { field: '', op: 'eq', value: 'x' }, // empty field
      { field: 'count', op: 'badop', value: 1 }, // bad op
      { field: 'present', op: 'exists' }, // no value is fine for exists
      'not-an-object',
      null,
    ]
    expect(parseConditions(raw)).toEqual([
      { field: 'source', op: 'eq', value: 'qr' },
      { field: 'present', op: 'exists' },
    ])
  })

  it('returns [] for non-array input', () => {
    expect(parseConditions(undefined)).toEqual([])
    expect(parseConditions({})).toEqual([])
    expect(parseConditions('x')).toEqual([])
  })
})

describe('evaluateConditions', () => {
  const ctx = { source: 'qr', count: 5, space: { slug: 'denver' }, present: 'yes' }

  it('is true with no conditions (always fire)', () => {
    expect(evaluateConditions([], ctx)).toBe(true)
  })

  it('eq / neq compare loosely as strings', () => {
    expect(evaluateConditions([{ field: 'source', op: 'eq', value: 'qr' }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'source', op: 'eq', value: 'web' }], ctx)).toBe(false)
    expect(evaluateConditions([{ field: 'count', op: 'eq', value: '5' }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'source', op: 'neq', value: 'web' }], ctx)).toBe(true)
  })

  it('exists / absent test for presence', () => {
    expect(evaluateConditions([{ field: 'present', op: 'exists' }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'missing', op: 'exists' }], ctx)).toBe(false)
    expect(evaluateConditions([{ field: 'missing', op: 'absent' }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'present', op: 'absent' }], ctx)).toBe(false)
  })

  it('gt / lt coerce to numbers and fail closed on NaN', () => {
    expect(evaluateConditions([{ field: 'count', op: 'gt', value: 3 }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'count', op: 'gt', value: 9 }], ctx)).toBe(false)
    expect(evaluateConditions([{ field: 'count', op: 'lt', value: 9 }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'source', op: 'gt', value: 1 }], ctx)).toBe(false) // 'qr' is NaN
  })

  it('reads nested dot-paths', () => {
    expect(evaluateConditions([{ field: 'space.slug', op: 'eq', value: 'denver' }], ctx)).toBe(true)
    expect(evaluateConditions([{ field: 'space.slug', op: 'eq', value: 'austin' }], ctx)).toBe(false)
  })

  it('requires ALL conditions to hold (AND semantics)', () => {
    const all: AutomationCondition[] = [
      { field: 'source', op: 'eq', value: 'qr' },
      { field: 'count', op: 'gt', value: 3 },
    ]
    expect(evaluateConditions(all, ctx)).toBe(true)
    expect(evaluateConditions([...all, { field: 'missing', op: 'exists' }], ctx)).toBe(false)
  })
})
