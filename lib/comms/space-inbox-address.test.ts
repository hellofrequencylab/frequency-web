import { beforeEach, describe, expect, it, vi } from 'vitest'

// EMAIL-022: provisioning is idempotent and fail-safe; routing and recording open a NEW Space thread.
const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  space: { id: 's1', slug: 'labs', name: 'Labs', brand_name: 'Labs Collective', owner_profile_id: 'owner1' } as Record<string, unknown> | null,
  contacts: [] as Record<string, unknown>[],
  createCount: 0,
  listed: null as { id: string } | null,
  providerStatus: 'verified',
  providerThrows: false,
  dnsOk: true,
  dnsCalls: [] as unknown[],
  upsertFails: false,
  notifications: [] as Record<string, unknown>[],
  opened: [] as Record<string, unknown>[],
  appended: [] as Record<string, unknown>[],
  appendResult: { id: 'msg1' } as Record<string, unknown> | null,
}))
const RECORDS = [
  { record: 'Receiving', type: 'MX', name: '@', value: 'inbound-smtp.resend.com', priority: 10, ttl: 'Auto', status: 'pending' },
  { record: 'SPF', type: 'MX', name: 'send', value: 'feedback-smtp.resend.com', priority: 10, ttl: 'Auto', status: 'pending' },
  { record: 'SPF', type: 'TXT', name: 'send', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'pending' },
  { record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=key', ttl: 'Auto', status: 'pending' },
]
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (name: string) => {
  const filter: Record<string, unknown> = {}; let insert: Record<string, unknown> | null = null; let upsert: Record<string, unknown> | null = null
  const q = {
    select: () => q, eq: (k: string, v: unknown) => { filter[k] = v; return q }, ilike: (k: string, v: string) => { filter[k] = v; return q }, limit: () => q,
    insert: (v: Record<string, unknown>) => { insert = v; return q }, update: () => q, upsert: (v: Record<string, unknown>) => { upsert = v; return q },
    single: async () => {
      if (name === 'space_inbox_addresses') { if (state.upsertFails) return { data: null, error: { code: 'XX000' } }; state.row = { id: 'row1', local_part: 'hello', verified_at: null, dns_records: [], ...state.row, ...upsert }; return { data: state.row, error: null } }
      if (name === 'contacts' && insert) { const c = { id: `c${state.contacts.length + 1}`, profile_id: null, ...insert }; state.contacts.push(c); return { data: c, error: null } }
      if (name === 'notifications' && insert) { state.notifications.push(insert); return { data: { id: 'n1' }, error: null } }
      return { data: null, error: null }
    },
    maybeSingle: async () => {
      if (name === 'spaces') return { data: state.space && (!filter.id || state.space.id === filter.id) ? state.space : null, error: null }
      if (name === 'space_inbox_addresses') { const r = state.row; return { data: r && Object.entries(filter).every(([k, v]) => r[k] === v) ? r : null, error: null } }
      if (name === 'contacts') { const c = state.contacts.find(c => c.space_id === filter.space_id && c.email === filter.email); return { data: c ?? null, error: null } }
      return { data: null, error: null }
    },
  }
  return q
} }) }))
vi.mock('@/lib/sites/vercel-domains', () => ({ vercelDomainsConfigured: () => true, upsertZoneDnsRecords: async (zone: string, records: unknown[]) => { state.dnsCalls.push({ zone, records }); return state.dnsOk ? { ok: true } : { ok: false, error: 'vercel-500' } } }))
vi.mock('@/lib/spaces/email-domain-provider', () => ({
  createEmailProviderInboxDomain: async (domain: string) => { if (state.providerThrows) throw new Error('provider down'); state.createCount++; return { id: 'prov1', status: 'pending', capabilities: { sending: 'enabled', receiving: 'enabled' }, records: RECORDS, name: domain } },
  findEmailProviderDomainByName: async () => state.listed,
  inspectEmailProviderDomain: async () => { if (state.providerThrows) throw new Error('provider down'); return { status: state.providerStatus, capabilities: { sending: 'enabled', receiving: 'enabled' }, records: RECORDS } },
  requestEmailProviderVerification: async () => undefined,
}))
vi.mock('./conversations', () => ({
  openOrGetConversation: async (input: Record<string, unknown>) => { state.opened.push(input); return { id: 'conv1', ref: '77', created: true } },
  appendConversationMessage: async (input: Record<string, unknown>) => { state.appended.push(input); return state.appendResult },
}))
vi.mock('./tenant-reply-alias', () => ({ quarantineTenantReplyAlias: vi.fn(async () => undefined) }))

import { provisionSpaceInboxAddress, checkSpaceInboxAddress, resolveSpaceInboxFrom, resolveSpaceInboxRoute, recordSpaceInboxMessage } from './space-inbox-address'

beforeEach(() => {
  state.row = null; state.contacts = []; state.createCount = 0; state.listed = null; state.providerStatus = 'verified'; state.providerThrows = false
  state.dnsOk = true; state.dnsCalls = []; state.upsertFails = false; state.notifications = []; state.opened = []; state.appended = []; state.appendResult = { id: 'msg1' }
  state.space = { id: 's1', slug: 'labs', name: 'Labs', brand_name: 'Labs Collective', owner_profile_id: 'owner1' }
  vi.stubEnv('SPACE_INBOX_ADDRESSES_ENABLED', '1'); vi.stubEnv('SPACE_EMAIL_INBOX_ROOT', 'frequencylocal.com')
})

describe('provisionSpaceInboxAddress', () => {
  it('creates the receiving domain, writes its records into the root zone, stores the row and reports the state', async () => {
    const r = await provisionSpaceInboxAddress('s1')
    expect(r).toMatchObject({ ok: true, address: 'hello@labs.frequencylocal.com', state: 'verified' })
    expect(state.createCount).toBe(1)
    expect(state.row).toMatchObject({ space_id: 's1', domain: 'labs.frequencylocal.com', provider_domain_id: 'prov1', state: 'verified' })
    expect(state.dnsCalls).toHaveLength(1)
    const { zone, records } = state.dnsCalls[0] as { zone: string; records: { type: string; name: string; mxPriority?: number }[] }
    expect(zone).toBe('frequencylocal.com')
    expect(records.map(r => `${r.type} ${r.name}`)).toEqual(['MX labs', 'MX send.labs', 'TXT send.labs', 'TXT resend._domainkey.labs'])
    expect(records[0].mxPriority).toBe(10)
  })
  it('is idempotent: a verified address is reported, never re-created or re-written', async () => {
    await provisionSpaceInboxAddress('s1')
    const r = await provisionSpaceInboxAddress('s1')
    expect(r).toMatchObject({ ok: true, state: 'verified' })
    expect(state.createCount).toBe(1)
    expect(state.dnsCalls).toHaveLength(1)
  })
  it('resumes a pending setup with the provider domain it already has, and reuses one the provider already lists', async () => {
    state.providerStatus = 'pending'
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: true, state: 'pending' })
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: true, state: 'pending' })
    expect(state.createCount).toBe(1)
    expect(state.dnsCalls).toHaveLength(2)
    state.row = null; state.listed = { id: 'prov-old' }
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: true })
    expect(state.createCount).toBe(1)
    expect(state.row).toMatchObject({ provider_domain_id: 'prov-old' })
  })
  it('refuses with a member-safe sentence when the switch or the root is missing, touching nothing', async () => {
    vi.stubEnv('SPACE_INBOX_ADDRESSES_ENABLED', '')
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: false })
    vi.stubEnv('SPACE_INBOX_ADDRESSES_ENABLED', '1'); vi.stubEnv('SPACE_EMAIL_INBOX_ROOT', '')
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: false })
    expect(state.createCount).toBe(0); expect(state.row).toBeNull()
  })
  it('never throws: a provider fault, a DNS fault and a save fault each come back as a result', async () => {
    state.providerThrows = true
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: false, message: expect.stringContaining('Try again') })
    state.providerThrows = false; state.dnsOk = false
    const dns = await provisionSpaceInboxAddress('s1')
    expect(dns).toMatchObject({ ok: false })
    expect(state.row).toMatchObject({ provider_domain_id: 'prov1' })
    state.row = null; state.dnsOk = true; state.upsertFails = true
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: false })
    expect(state.dnsCalls).toHaveLength(1)
  })
  it('leaves a paused address alone', async () => {
    state.row = { space_id: 's1', domain: 'labs.frequencylocal.com', local_part: 'hello', provider_domain_id: 'prov1', state: 'paused', dns_records: [] }
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: false, message: expect.stringContaining('paused') })
    expect(state.createCount).toBe(0)
  })
})

describe('checkSpaceInboxAddress', () => {
  it('flips the state from what the provider says', async () => {
    state.providerStatus = 'pending'
    await provisionSpaceInboxAddress('s1')
    expect(state.row?.state).toBe('pending')
    state.providerStatus = 'verified'
    expect(await checkSpaceInboxAddress('s1')).toMatchObject({ ok: true, state: 'verified' })
    expect(state.row?.verified_at).toBeTruthy()
    state.providerStatus = 'failed'
    expect(await checkSpaceInboxAddress('s1')).toMatchObject({ ok: true, state: 'failed' })
  })
  it('reports rather than throws when there is nothing to check or the provider is down', async () => {
    expect(await checkSpaceInboxAddress('s1')).toMatchObject({ ok: false })
    await provisionSpaceInboxAddress('s1'); state.providerThrows = true
    expect(await checkSpaceInboxAddress('s1')).toMatchObject({ ok: false })
  })
})

describe('resolveSpaceInboxFrom', () => {
  it('is the brand name on the verified address, and null for a pending address or with the switch off', async () => {
    expect(await resolveSpaceInboxFrom('s1')).toBeNull()
    state.providerStatus = 'pending'; await provisionSpaceInboxAddress('s1')
    expect(await resolveSpaceInboxFrom('s1')).toBeNull()
    state.providerStatus = 'verified'; await checkSpaceInboxAddress('s1')
    expect(await resolveSpaceInboxFrom('s1')).toBe('Labs Collective <hello@labs.frequencylocal.com>')
    vi.stubEnv('SPACE_INBOX_ADDRESSES_ENABLED', 'off')
    expect(await resolveSpaceInboxFrom('s1')).toBeNull()
  })
})

describe('resolveSpaceInboxRoute + recordSpaceInboxMessage', () => {
  const parsed = { from: 'Someone <Person@Example.org>'.toLowerCase().replace(/^.*<([^<>]+)>$/, '$1'), subject: 'Hi there', text: 'Can I join?', messageId: '<m1@example.org>', inReplyTo: null, referencesIds: null }
  it('ignores mail that is not to a Space address, and quarantines unknown or unverified ones', async () => {
    expect(await resolveSpaceInboxRoute(['reply+1-abc@reply.frequencylocal.com'])).toEqual({ kind: 'none' })
    expect(await resolveSpaceInboxRoute(['hello@nobody.frequencylocal.com'])).toEqual({ kind: 'quarantine', reason: 'inbox_address_unknown' })
    state.providerStatus = 'pending'; await provisionSpaceInboxAddress('s1')
    expect(await resolveSpaceInboxRoute(['hello@labs.frequencylocal.com'])).toEqual({ kind: 'quarantine', reason: 'inbox_address_unverified' })
    state.row = { ...state.row, state: 'paused' }
    expect(await resolveSpaceInboxRoute(['Labs <hello@labs.frequencylocal.com>'])).toEqual({ kind: 'quarantine', reason: 'inbox_address_unverified' })
    expect(await resolveSpaceInboxRoute(['hello@labs.frequencylocal.com', 'hello@other.frequencylocal.com'])).toEqual({ kind: 'quarantine', reason: 'ambiguous_alias' })
  })
  it('routes on the root alone, so a verified address receives with the switch off', async () => {
    await provisionSpaceInboxAddress('s1')
    vi.stubEnv('SPACE_INBOX_ADDRESSES_ENABLED', '')
    expect(await resolveSpaceInboxRoute(['hello@labs.frequencylocal.com'])).toMatchObject({ kind: 'ready', spaceId: 's1', ownerProfileId: 'owner1' })
  })
  it('makes the sender a contact of the Space with consent unknown, opens a NEW thread and appends the message', async () => {
    await provisionSpaceInboxAddress('s1')
    const route = await resolveSpaceInboxRoute(['hello@labs.frequencylocal.com'])
    if (route.kind !== 'ready') throw new Error('expected ready')
    expect(await recordSpaceInboxMessage(route, parsed)).toEqual({ status: 'recorded', conversationId: 'conv1', ref: '77' })
    expect(state.contacts).toEqual([expect.objectContaining({ email: 'person@example.org', space_id: 's1', consent_state: 'unknown', source: 'space_inbox' })])
    expect(state.opened[0]).toMatchObject({ kind: 'crm', spaceId: 's1', ownerProfileId: 'owner1', contactId: 'c1', externalEmail: 'person@example.org', subject: 'Hi there', forceNew: true })
    expect(state.appended[0]).toMatchObject({ conversationId: 'conv1', direction: 'inbound', authorKind: 'contact', authorContactId: 'c1', body: 'Can I join?', externalMessageId: '<m1@example.org>' })
    expect(state.notifications[0]).toMatchObject({ recipient_id: 'owner1', reference_id: 'conv1' })
    // A second mail from the same person reuses the contact and does not create another.
    await recordSpaceInboxMessage(route, parsed)
    expect(state.contacts).toHaveLength(1)
  })
  it('asks for redelivery on an append fault, acks a duplicate, and refuses a Space with no owner', async () => {
    await provisionSpaceInboxAddress('s1')
    const route = await resolveSpaceInboxRoute(['hello@labs.frequencylocal.com'])
    if (route.kind !== 'ready') throw new Error('expected ready')
    state.appendResult = null
    expect(await recordSpaceInboxMessage(route, parsed)).toEqual({ status: 'error' })
    state.appendResult = { duplicate: true }
    expect(await recordSpaceInboxMessage(route, parsed)).toMatchObject({ status: 'duplicate' })
    expect(await recordSpaceInboxMessage({ ...route, ownerProfileId: null }, parsed)).toEqual({ status: 'no_owner' })
  })
})
