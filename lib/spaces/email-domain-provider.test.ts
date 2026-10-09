import { afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ data: { name: 'example.com', status: 'verified', capabilities: { sending: 'enabled' } } as Record<string, unknown> | null, error: null as unknown }))
vi.mock('resend', () => ({ Resend: class { domains = { get: async () => state } } }))
import { retrieveEmailDomainVerification } from './email-domain-provider'
afterEach(() => { vi.unstubAllEnvs(); state.data = { name: 'example.com', status: 'verified', capabilities: { sending: 'enabled' } }; state.error = null })
describe('provider attestation', () => {
  it('requires exact domain and enabled verified sending', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fixture-key')
    expect(await retrieveEmailDomainVerification('p1', 'example.com')).toEqual({ sendingVerified: true })
    await expect(retrieveEmailDomainVerification('p1', 'other.com')).rejects.toThrow('could not be confirmed')
    state.data = { name: 'example.com', status: 'verified', capabilities: { sending: 'disabled' } }
    expect(await retrieveEmailDomainVerification('p1', 'example.com')).toEqual({ sendingVerified: false })
  })
  it('fails closed for missing credentials, error and unknown provider response', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    await expect(retrieveEmailDomainVerification('p1', 'example.com')).rejects.toThrow('unavailable')
    vi.stubEnv('RESEND_API_KEY', 'fixture-key'); state.error = { message: 'failed' }
    await expect(retrieveEmailDomainVerification('p1', 'example.com')).rejects.toThrow('could not be confirmed')
    state.error = null; state.data = null
    await expect(retrieveEmailDomainVerification('p1', 'example.com')).rejects.toThrow('could not be confirmed')
  })
})
