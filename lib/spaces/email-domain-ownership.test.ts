import { beforeEach, describe, expect, it, vi } from 'vitest'
const dns = vi.hoisted(() => ({ values: [] as string[][], fail: false }))
vi.mock('node:dns/promises', () => ({ resolveTxt: async () => { if (dns.fail) throw new Error('DNS unavailable'); return dns.values } }))
vi.mock('@/lib/signing-secret', () => ({ signingSecret: () => 'fixture-signing-key' }))
import { emailOwnershipChallenge, verifyEmailDomainOwnership } from './email-domain-ownership'
beforeEach(() => { dns.values = []; dns.fail = false })
describe('email-specific domain control proof', () => {
  it('requires matching TXT, with split strings joined and short DNS segments', async () => {
    const proof = emailOwnershipChallenge('space-a', 'owner-a', 'example.com', 1000)
    expect(proof.segments.every((p) => p.length <= 200)).toBe(true)
    await expect(verifyEmailDomainOwnership('space-a', 'owner-a', 'example.com', proof.token, 1001)).rejects.toThrow('not visible')
    dns.values = [proof.segments]
    await expect(verifyEmailDomainOwnership('space-a', 'owner-a', 'example.com', proof.token, 1001)).resolves.toBeUndefined()
  })
  it('rejects wrong tenant, owner, domain, expired state and forged signature', async () => {
    const proof = emailOwnershipChallenge('space-a', 'owner-a', 'example.com', 1000)
    dns.values = [proof.segments]
    for (const args of [['space-b','owner-a','example.com'],['space-a','owner-b','example.com'],['space-a','owner-a','other.com']])
      await expect(verifyEmailDomainOwnership(args[0],args[1],args[2],proof.token,1001)).rejects.toThrow('another Space')
    await expect(verifyEmailDomainOwnership('space-a','owner-a','example.com',proof.token,3601001)).rejects.toThrow('expired')
    await expect(verifyEmailDomainOwnership('space-a','owner-a','example.com',`${proof.token}a`,1001)).rejects.toThrow('invalid')
  })
  it('fails safely while DNS is unavailable', async () => {
    const proof = emailOwnershipChallenge('s','o','example.com',1000); dns.fail=true
    await expect(verifyEmailDomainOwnership('s','o','example.com',proof.token,1001)).rejects.toThrow('Check again')
  })
})
