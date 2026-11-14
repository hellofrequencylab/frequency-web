import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ identity: vi.fn(), track: vi.fn() }))
vi.mock('./ga-client-id', () => ({ readGaIdentity: mocks.identity }))
vi.mock('./track', () => ({ track: mocks.track }))
import { recordVerifiedLeadCapture } from './leads'
beforeEach(() => { vi.clearAllMocks(); mocks.track.mockResolvedValue(true) })

it('records a confirmed lead with stable deduplication and no contact details in pixels', async () => {
  mocks.identity.mockResolvedValue({ clientId: '123.456', sessionId: '1695123456' })
  await recordVerifiedLeadCapture('stored-lead-id', 'create_space')
  expect(mocks.track).toHaveBeenCalledWith('lead.captured', { source: 'create_space' }, null, {
    idempotencyKey: 'lead.captured:stored-lead-id', gaIdentity: { clientId: '123.456', sessionId: '1695123456' },
  })
})
it('preserves the first-party fact without browser identity and never fails the successful capture', async () => {
  mocks.identity.mockResolvedValue(null)
  mocks.track.mockRejectedValue(new Error('analytics unavailable'))
  await expect(recordVerifiedLeadCapture('stored-lead-id', 'create_space')).resolves.toBeUndefined()
  expect(mocks.track.mock.calls[0][3].gaIdentity).toBeNull()
})
