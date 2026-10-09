import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ caller: 'owner', error: false, verified: true, providerFails: false, ownershipFails: false, provisions: 0,
  space: { id: 's1', owner_profile_id: 'owner', domain: 'example.com', plan: 'business', entitlements: { billing: { space_email_custom_identity: true } } },
  identity: { id: 'i1', space_id: 's1', domain_id: 'd1', local_part: 'hello', display_name: 'Example', paused_at: null as string | null },
  domain: { id: 'd1', space_id: 's1', domain: 'example.com', provider_domain_id: 'p1', paused_at: null as string | null }, writes: [] as Record<string, unknown>[] }))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => state.caller }))
vi.mock('./email-domain-ownership', () => ({ verifyEmailDomainOwnership: async () => { if (state.ownershipFails) throw new Error('Ownership TXT missing') }, emailOwnershipChallenge: () => ({ token: 'fixture' }) }))
vi.mock('@/lib/sites/vercel-domains', () => ({ siteDomainStatus: async () => ({ verified: false }) }))
vi.mock('./email-domain-provider', () => ({ createEmailProviderDomain: async () => { state.provisions++; return { id: 'p1', records: [] } }, retrieveEmailDomainVerification: async () => {
  if (state.providerFails) throw new Error('provider unavailable')
  return { sendingVerified: state.verified }
} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (name: string) => {
  const filters: Record<string, unknown> = {}; let inserted = false
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query },
    update: (value: Record<string, unknown>) => { state.writes.push(value); return query },
    insert: (value: Record<string, unknown>) => { state.writes.push(value); inserted = true; return query },
    single: async () => ({ data: { id: 'new-id' }, error: state.error ? {} : null }),
    maybeSingle: async () => {
      const row = name === 'spaces' ? state.space : name === 'space_email_identities' ? state.identity : state.domain
      const matches = Object.entries(filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value)
      return { data: inserted || matches ? row : null, error: state.error ? {} : null }
    } }
  return query
} }) }))
import { createSpaceEmailIdentity, registerSpaceEmailDomain, resolveSpaceEmailIdentity, pauseSpaceEmailIdentity } from './email-identity-registry'
beforeEach(() => { state.caller = 'owner'; state.error = false; state.verified = true; state.providerFails = false; state.ownershipFails = false; state.provisions = 0;
  state.space.plan = 'business'; state.identity.paused_at = null; state.domain.paused_at = null; state.writes = [] })
describe('live Space identity registry', () => {
  it('resolves From from trusted registry and current provider verification', async () => {
    expect(await resolveSpaceEmailIdentity('s1', 'i1')).toEqual({ identityId: 'i1', from: 'Example <hello@example.com>' })
  })
  it('rejects cross-Space and unknown identity IDs', async () => {
    await expect(resolveSpaceEmailIdentity('s1', 'other')).rejects.toThrow('identity is unavailable')
    await expect(createSpaceEmailIdentity('s1', 'other-domain', 'hello', 'Example')).rejects.toThrow('does not belong')
  })
  it('rejects operator/tenant impersonation at management boundary', async () => {
    state.caller = 'other'
    await expect(createSpaceEmailIdentity('s1', 'd1', 'hello', 'Example')).rejects.toThrow('Only the Space owner')
    expect(state.writes).toEqual([])
  })
  it('holds after downgrade and on provider failure, unverified or paused domain', async () => {
    state.space.plan = 'free'
    await expect(resolveSpaceEmailIdentity('s1', 'i1')).rejects.toThrow('paid_identity_required')
    state.space.plan = 'business'; state.verified = false
    await expect(resolveSpaceEmailIdentity('s1', 'i1')).rejects.toThrow('identity_unavailable')
    state.verified = true; state.domain.paused_at = 'now'
    await expect(resolveSpaceEmailIdentity('s1', 'i1')).rejects.toThrow('identity_unavailable')
    state.domain.paused_at = null; state.providerFails = true
    await expect(resolveSpaceEmailIdentity('s1', 'i1')).rejects.toThrow('provider unavailable')
  })
  it('cannot register an unrelated domain or self-attest verified state', async () => {
    await expect(registerSpaceEmailDomain('s1', 'other.com', 'p2')).rejects.toThrow('Connect this domain')
    state.verified = false
    await registerSpaceEmailDomain('s1', 'reply.example.com', 'p1')
    expect(state.writes[0].sending_verified).toBe(false)
  })
  it('lets the owner pause an identity after downgrade without deleting it', async () => {
    state.space.plan = 'free'
    await pauseSpaceEmailIdentity('s1', 'i1')
    expect(state.writes[0].paused_at).toEqual(expect.any(String))
  })
  it('never provisions from website assignment alone or caller-supplied provider IDs', async () => {
    state.ownershipFails = true
    await expect(registerSpaceEmailDomain('s1', 'example.com', 'arbitrary-provider-id')).rejects.toThrow('Ownership TXT missing')
    expect(state.provisions).toBe(0); expect(state.writes).toEqual([])
  })
  it('fails closed on database errors without sending', async () => {
    state.error = true
    await expect(resolveSpaceEmailIdentity('s1', 'i1')).rejects.toThrow('settings are unavailable')
  })
})
