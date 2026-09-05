import { describe, it, expect, beforeEach, vi } from 'vitest'

// scan2 L5-05 (2026-09-05): the guest-side postEventDispatch reads the compose result and returns
// it. It used to drop the result and return ok() no matter what the data layer did.

const { getMyProfileId, composeEventDispatch, hostMaybeSingle, revalidatePath } = vi.hoisted(() => ({
  getMyProfileId: vi.fn(),
  composeEventDispatch: vi.fn(),
  hostMaybeSingle: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath }))
vi.mock('@/lib/auth', () => ({ getMyProfileId }))
vi.mock('@/lib/events/dispatch', () => ({ composeEventDispatch }))
vi.mock('@/lib/events/cohosts', () => ({ isEventCohost: async () => false }))
vi.mock('@/lib/events/host-gate', () => ({ viewerActsAsEventHost: async () => true }))
vi.mock('@/lib/events/crm-access', () => ({
  loadEventCrmAccess: async () => ({ canMessage: true }),
  eventCrmLockedError: () => 'locked',
}))
vi.mock('@/lib/events/rsvp-depth', () => ({ setRsvp: vi.fn(), approveRsvp: vi.fn(), eventRequiresApproval: vi.fn() }))
vi.mock('@/lib/events/guest-rsvp-email', () => ({ sendRsvpApprovedNotice: vi.fn() }))
vi.mock('@/lib/messages/direct-conversation', () => ({ findOrCreateDirectConversation: vi.fn() }))
vi.mock('@/lib/blocking', () => ({ isBlockedBetween: async () => false }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitOk: async () => true }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: hostMaybeSingle }),
          maybeSingle: hostMaybeSingle,
        }),
      }),
    }),
  }),
}))

import { postEventDispatch } from './social-actions'

const RESULT = { eventDispatchId: 'ed-1', dispatchId: 'disp-1', enqueued: 2, smsRequested: false, smsSent: 0, emailSent: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  getMyProfileId.mockResolvedValue('host-1')
  // isEventHost: the event row read resolves to the caller as host.
  hostMaybeSingle.mockResolvedValue({ data: { host_id: 'host-1' }, error: null })
})

describe('postEventDispatch reads the compose result', () => {
  it('returns a failure, and does not revalidate, when the write failed', async () => {
    composeEventDispatch.mockResolvedValue({ ...RESULT, eventDispatchId: null, dispatchId: null, status: 'write-failed' })
    const res = await postEventDispatch('ev-1', 'full-moon', { body: 'Doors at 7', toDispatch: true })
    expect(res).toEqual({ error: 'Could not post your update. Please try again.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('returns ok with status send-failed, and revalidates, when the page post landed but the send did not', async () => {
    composeEventDispatch.mockResolvedValue({ ...RESULT, status: 'send-failed' })
    const res = await postEventDispatch('ev-1', 'full-moon', { body: 'Doors at 7', toDispatch: true })
    expect(res).toEqual({ data: { status: 'send-failed' } })
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('returns ok with status ok when both happened', async () => {
    composeEventDispatch.mockResolvedValue({ ...RESULT, status: 'ok' })
    const res = await postEventDispatch('ev-1', 'full-moon', { body: 'Doors at 7', toDispatch: true })
    expect(res).toEqual({ data: { status: 'ok' } })
  })
})
