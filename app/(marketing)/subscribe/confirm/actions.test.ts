import { describe, it, expect, vi, beforeEach } from 'vitest'

// The confirm click starts the /subscribe nurture (day 0, 3, 10) exactly when it is a first confirmation.
const confirmOptin = vi.fn()
const enrollInNurture = vi.fn()

vi.mock('@/lib/crm/optin/tokens', () => ({ verifyOptinToken: () => true }))
vi.mock('@/lib/crm/optin/store', () => ({ confirmOptin: (...a: unknown[]) => confirmOptin(...a) }))
vi.mock('@/lib/crm/import/store', () => ({ getRootSpaceId: async () => 'root' }))
vi.mock('@/lib/email', () => ({ sendOptinWelcomeEmail: async () => undefined }))
vi.mock('@/lib/unsubscribe-tokens', () => ({ buildSpaceUnsubscribeUrl: () => 'https://x/unsub' }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://frequencylocal.com' }))
vi.mock('@/lib/nurture/enroll', () => ({ enrollInNurture: (...a: unknown[]) => enrollInNurture(...a) }))

import { confirmSubscribe } from './actions'
import { SUBSCRIBE_NURTURE_KEY } from '@/lib/nurture/subscribe'

const input = { e: 'Pat@Example.com', x: String(Math.floor(Date.now() / 1000) + 3600), t: 'tok' }

beforeEach(() => {
  confirmOptin.mockReset()
  enrollInNurture.mockReset()
})

describe('confirmSubscribe enrolls the /subscribe nurture', () => {
  it('enrolls a first confirmation under the subscribe key', async () => {
    confirmOptin.mockResolvedValue({ status: 'confirmed', firstConfirmation: true, profileId: null, displayName: null, contactId: 'c1' })
    expect(await confirmSubscribe(input)).toEqual({ ok: true })
    expect(enrollInNurture).toHaveBeenCalledWith({ contactId: 'c1', email: 'pat@example.com', persona: SUBSCRIBE_NURTURE_KEY })
  })

  it('does not enroll on a repeat confirmation', async () => {
    confirmOptin.mockResolvedValue({ status: 'confirmed', firstConfirmation: false, profileId: null, displayName: null, contactId: 'c1' })
    await confirmSubscribe(input)
    expect(enrollInNurture).not.toHaveBeenCalled()
  })

  it('does not enroll a kept opt-out', async () => {
    confirmOptin.mockResolvedValue({ status: 'kept_unsubscribed', firstConfirmation: false, profileId: null, displayName: null })
    expect(await confirmSubscribe(input)).toEqual({ ok: false })
    expect(enrollInNurture).not.toHaveBeenCalled()
  })
})
