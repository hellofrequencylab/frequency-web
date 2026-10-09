import { afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ data: { name: 'example.com', status: 'verified', capabilities: { sending: 'enabled' } } as Record<string, unknown> | null, error: null as unknown, domains: [] as {id:string;name:string;created_at:string}[], createdName:'' }))
vi.mock('resend', () => ({ Resend: class { domains = { get: async () => state, create: async (input:{name:string}) => {state.createdName=input.name;return state}, verify:async()=>({error:state.error}),list:async()=>({data:{data:state.domains,has_more:false},error:state.error}) } } }))
import { retrieveEmailDomainVerification,createEmailProviderDomain,reconcileEmailProviderDomain,requestEmailProviderVerification } from './email-domain-provider'
afterEach(() => { vi.unstubAllEnvs(); state.data = { name: 'example.com', status: 'verified', capabilities: { sending: 'enabled' } }; state.error = null;state.domains=[];state.createdName='' })
describe('provider attestation', () => {
  it('requires exact domain and enabled verified sending', async () => {
    vi.stubEnv('RESEND_API_KEY', 'fixture-key')
    expect(await retrieveEmailDomainVerification('p1', 'example.com')).toEqual({ sendingVerified: true })
    await expect(retrieveEmailDomainVerification('p1', 'other.com')).rejects.toThrow('could not be confirmed')
    state.data = { name: 'example.com', status: 'verified', capabilities: { sending: 'disabled' } }
    expect(await retrieveEmailDomainVerification('p1', 'example.com')).toEqual({ sendingVerified: false })
  })
  it('reconciles only an exact domain created after the durable operation began',async()=>{
    vi.stubEnv('RESEND_API_KEY','fixture-key')
    state.domains=[{id:'old',name:'example.com',created_at:'2020-01-01T00:00:00Z'},{id:'other',name:'other.com',created_at:'2026-10-08T00:00:00Z'}]
    expect(await reconcileEmailProviderDomain('example.com','2026-10-08T00:00:00Z')).toBeNull()
    state.domains.push({id:'recover',name:'example.com',created_at:'2026-10-08T00:00:01Z'})
    expect(await reconcileEmailProviderDomain('example.com','2026-10-08T00:00:00Z')).toEqual({id:'recover'})
  })
  it('creates only the requested domain and never claims readiness on provider error',async()=>{
    vi.stubEnv('RESEND_API_KEY','fixture-key')
    state.data={id:'p1',name:'example.com',records:[]}
    expect(await createEmailProviderDomain('example.com')).toEqual({id:'p1',records:[]})
    expect(state.createdName).toBe('example.com')
    state.error={message:'rejected'}
    await expect(createEmailProviderDomain('example.com')).rejects.toThrow('reconciliation')
    await expect(requestEmailProviderVerification('p1')).rejects.toThrow('could not start')
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
