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

const sendPushToProfile = vi.fn<(...args: unknown[]) => Promise<number>>(async () => 1)
vi.mock('@/lib/push', () => ({
  sendPushToProfile: (...args: unknown[]) => sendPushToProfile(...args),
}))

import {
  isAutomationActionType,
  AUTOMATION_ACTION_TYPES,
  runAutomationsForEvent,
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
    sendPushToProfile.mockClear()
  })

  it('does nothing without an actor', async () => {
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'T', body: 'B' } }]
    await runAutomationsForEvent('practice.verified', null)
    expect(sendPushToProfile).not.toHaveBeenCalled()
  })

  it('sends push to the actor profile with title/body and a default url', async () => {
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'Nice work', body: 'You did it' } }]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(sendPushToProfile).toHaveBeenCalledWith(
      'profile-1',
      { title: 'Nice work', body: 'You did it', url: '/' },
      'lifecycle',
    )
    // Push does not require the CRM email lookup, so no email is enqueued.
    expect(enqueueEmail).not.toHaveBeenCalled()
  })

  it('passes a provided url through as the deep link', async () => {
    state.rules = [{ action_type: 'push_actor', action_config: { title: 'T', body: 'B', url: '/crew/journey' } }]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(sendPushToProfile).toHaveBeenCalledWith(
      'profile-1',
      { title: 'T', body: 'B', url: '/crew/journey' },
      'lifecycle',
    )
  })

  it('skips a push rule missing title or body', async () => {
    state.rules = [
      { action_type: 'push_actor', action_config: { title: '', body: 'B' } },
      { action_type: 'push_actor', action_config: { body: 'no title' } },
      { action_type: 'push_actor', action_config: { title: 'no body' } },
    ]
    await runAutomationsForEvent('practice.verified', 'profile-1')
    expect(sendPushToProfile).not.toHaveBeenCalled()
  })

  it('never throws when the push sender rejects', async () => {
    sendPushToProfile.mockRejectedValueOnce(new Error('boom'))
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
    expect(sendPushToProfile).toHaveBeenCalledTimes(1)
  })
})
