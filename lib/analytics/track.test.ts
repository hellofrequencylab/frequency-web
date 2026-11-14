import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ record: vi.fn(), consent: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/engagement/events', () => ({ recordEngagementEvent: mocks.record }))
vi.mock('@/lib/consent/consent', () => ({ hasConsent: mocks.consent }))
vi.mock('./ga-server', () => ({ gaServerEnabled: () => true, sendGa4Event: mocks.send }))
import { track } from './track'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.record.mockResolvedValue({ recorded: true })
  mocks.consent.mockResolvedValue(true)
})
describe('ledger to Google boundary', () => {
  it('passes checkout session identity separately from pixel-safe purchase parameters', async () => {
    await track('commerce.purchase', { ga_client_id: '123.456', ga_session_id: '1695123456', value: 5, currency: 'usd', transaction_id: 'cs_1', email: 'private@example.com', topic: 'private-topic' }, 'member', { idempotencyKey: 'purchase:cs_1' })
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledWith('commerce.purchase', { value: 5, currency: 'usd', transaction_id: 'cs_1' }, 'member', { clientId: '123.456', sessionId: '1695123456' }))
    expect(mocks.record).toHaveBeenCalledTimes(1)
  })
  it('does not mirror denied consent or a repeated authoritative settlement', async () => {
    mocks.consent.mockResolvedValue(false)
    await track('commerce.purchase', { ga_client_id: '123.456' }, 'member')
    await vi.waitFor(() => expect(mocks.consent).toHaveBeenCalled())
    expect(mocks.send).not.toHaveBeenCalled()
    mocks.record.mockResolvedValue({ recorded: false })
    mocks.consent.mockResolvedValue(true)
    await track('commerce.purchase', { ga_client_id: '123.456' }, 'member', { idempotencyKey: 'purchase:cs_1' })
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
