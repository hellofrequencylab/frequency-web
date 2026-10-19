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
  seenMessages: {} as Record<string, Record<string, unknown>>,
  appended: [] as Record<string, unknown>[],
  appendResult: { id: 'msg1' } as Record<string, unknown> | null,
  records: null as Record<string, unknown>[] | null,
  listRows: [] as Record<string, unknown>[],
  listCalls: [] as Record<string, unknown>[],
  listFails: false,
}))
const RECORDS = [
  { record: 'Receiving', type: 'MX', name: '@', value: 'inbound-smtp.resend.com', priority: 10, ttl: 'Auto', status: 'pending' },
  { record: 'SPF', type: 'MX', name: 'send', value: 'feedback-smtp.resend.com', priority: 10, ttl: 'Auto', status: 'pending' },
  { record: 'SPF', type: 'TXT', name: 'send', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'pending' },
  { record: 'DKIM', type: 'TXT', name: 'resend._domainkey', value: 'p=key', ttl: 'Auto', status: 'pending' },
]
/** What Resend really returned for labs.space.frequencylocal.com on 2026-10-12: names relative to the
 *  registrable domain, not to the verified one. */
const APEX_RELATIVE_RECORDS = [
  { record: 'Receiving', type: 'MX', name: 'labs.space', value: 'inbound-smtp.us-east-1.amazonaws.com', priority: 10, ttl: 'Auto', status: 'pending' },
  { record: 'SPF', type: 'MX', name: 'send.labs.space', value: 'feedback-smtp.us-east-1.amazonses.com', priority: 10, ttl: 'Auto', status: 'pending' },
  { record: 'SPF', type: 'TXT', name: 'send.labs.space', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'pending' },
  { record: 'DKIM', type: 'TXT', name: 'resend._domainkey.labs.space', value: 'p=key', ttl: 'Auto', status: 'pending' },
]
const providerRecords = () => state.records ?? RECORDS
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (name: string) => {
  const filter: Record<string, unknown> = {}; let insert: Record<string, unknown> | null = null; let upsert: Record<string, unknown> | null = null; let update: Record<string, unknown> | null = null
  const q = {
    select: () => q, eq: (k: string, v: unknown) => { filter[k] = v; return q }, ilike: (k: string, v: string) => { filter[k] = v; return q }, limit: (n: number) => { state.listCalls.push({ limit: n }); return q },
    or: (f: string) => { state.listCalls.push({ or: f }); return q }, order: (k: string, o: Record<string, unknown>) => { state.listCalls.push({ order: `${k} ${JSON.stringify(o)}` }); return q },
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => Promise.resolve(resolve(state.listFails ? { data: null, error: { message: 'list down' } } : { data: state.listRows, error: null })),
    insert: (v: Record<string, unknown>) => { insert = v; return q }, update: (v: Record<string, unknown>) => { update = v; return q }, upsert: (v: Record<string, unknown>) => { upsert = v; return q },
    single: async () => {
      if (name === 'space_inbox_addresses') {
        if (state.upsertFails) return { data: null, error: { code: 'XX000' } }
        // Postgres: an upsert is an INSERT first, so a proposed row without `domain` (NOT NULL, no default)
        // is refused before the conflict branch (the 2026-10-13 02:00 cron run).
        if (upsert && !('domain' in upsert)) return { data: null, error: { code: '23502', message: 'null value in column "domain" of relation "space_inbox_addresses" violates not-null constraint' } }
        if (update && !upsert) {
          if (!state.row || state.row.space_id !== filter.space_id) return { data: null, error: { code: 'PGRST116', message: 'no row' } }
          state.row = { ...state.row, ...update }
          return { data: state.row, error: null }
        }
        state.row = { id: 'row1', local_part: 'hello', verified_at: null, dns_records: [], ...state.row, ...upsert }
        return { data: state.row, error: null }
      }
      if (name === 'contacts' && insert) { const c = { id: `c${state.contacts.length + 1}`, profile_id: null, ...insert }; state.contacts.push(c); return { data: c, error: null } }
      if (name === 'notifications' && insert) { state.notifications.push(insert); return { data: { id: 'n1' }, error: null } }
      return { data: null, error: null }
    },
    maybeSingle: async () => {
      if (name === 'spaces') return { data: state.space && (!filter.id || state.space.id === filter.id) ? state.space : null, error: null }
      if (name === 'space_inbox_addresses') { const r = state.row; return { data: r && Object.entries(filter).every(([k, v]) => r[k] === v) ? r : null, error: null } }
      if (name === 'contacts') { const c = state.contacts.find(c => c.space_id === filter.space_id && c.email === filter.email); return { data: c ?? null, error: null } }
      if (name === 'comms_messages') return { data: state.seenMessages[String(filter.external_message_id)] ?? null, error: null }
      return { data: null, error: null }
    },
  }
  return q
} }) }))
vi.mock('@/lib/sites/vercel-domains', () => ({ vercelDomainsConfigured: () => true, upsertZoneDnsRecords: async (zone: string, records: unknown[]) => { state.dnsCalls.push({ zone, records }); return state.dnsOk ? { ok: true } : { ok: false, error: 'vercel-500' } } }))
vi.mock('@/lib/spaces/email-domain-provider', () => ({
  createEmailProviderInboxDomain: async (domain: string) => { if (state.providerThrows) throw new Error('provider down'); state.createCount++; return { id: 'prov1', status: 'pending', capabilities: { sending: 'enabled', receiving: 'enabled' }, records: providerRecords(), name: domain } },
  findEmailProviderDomainByName: async () => state.listed,
  inspectEmailProviderDomain: async () => { if (state.providerThrows) throw new Error('provider down'); return { status: state.providerStatus, capabilities: { sending: 'enabled', receiving: 'enabled' }, records: providerRecords() } },
  requestEmailProviderVerification: async () => undefined,
}))
vi.mock('./conversations', () => ({
  openOrGetConversation: async (input: Record<string, unknown>) => { state.opened.push(input); return { id: 'conv1', ref: '77', created: true } },
  appendConversationMessage: async (input: Record<string, unknown>) => { state.appended.push(input); return state.appendResult },
}))
vi.mock('./tenant-reply-alias', () => ({ quarantineTenantReplyAlias: vi.fn(async () => undefined) }))

import { provisionSpaceInboxAddress, checkSpaceInboxAddress, resolveSpaceInboxFrom, resolveSpaceInboxRoute, recordSpaceInboxMessage, listSpaceInboxAddressesToFinish } from './space-inbox-address'
import { providerRecordHost, providerRecordsToZoneRecords, spaceInboxZone } from './space-inbox-address-core'

beforeEach(() => {
  state.row = null; state.contacts = []; state.createCount = 0; state.listed = null; state.providerStatus = 'verified'; state.providerThrows = false
  state.dnsOk = true; state.dnsCalls = []; state.upsertFails = false; state.notifications = []; state.opened = []; state.seenMessages = {}; state.appended = []; state.appendResult = { id: 'msg1' }; state.records = null
  state.listRows = []; state.listCalls = []; state.listFails = false
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
  it('under a delegated root, writes apex-relative names into the apex zone (the 2026-10-12 pilot failure)', async () => {
    vi.stubEnv('SPACE_EMAIL_INBOX_ROOT', 'space.frequencylocal.com')
    state.records = APEX_RELATIVE_RECORDS
    const r = await provisionSpaceInboxAddress('s1')
    expect(r).toMatchObject({ ok: true, address: 'hello@labs.space.frequencylocal.com' })
    const { zone, records } = state.dnsCalls[0] as { zone: string; records: { type: string; name: string }[] }
    expect(zone).toBe('frequencylocal.com')
    expect(records.map(r => `${r.type} ${r.name}`)).toEqual(['MX labs.space', 'MX send.labs.space', 'TXT send.labs.space', 'TXT resend._domainkey.labs.space'])
    expect(state.row).toMatchObject({ domain: 'labs.space.frequencylocal.com', dns_records: expect.arrayContaining([expect.objectContaining({ name: 'labs.space' })]) })
  })
  it('re-reads the records from the provider on a retry instead of trusting a stale saved row', async () => {
    vi.stubEnv('SPACE_EMAIL_INBOX_ROOT', 'space.frequencylocal.com')
    state.records = APEX_RELATIVE_RECORDS
    state.providerStatus = 'pending'
    state.row = { space_id: 's1', domain: 'labs.space.frequencylocal.com', local_part: 'hello', provider_domain_id: 'prov1', state: 'pending', dns_records: [{ type: 'MX', name: 'labs.space.labs', value: 'wrong', mxPriority: 10 }] }
    await provisionSpaceInboxAddress('s1')
    expect(state.createCount).toBe(0)
    const { records } = state.dnsCalls[0] as { records: { name: string }[] }
    expect(records.map(r => r.name)).toEqual(['labs.space', 'send.labs.space', 'send.labs.space', 'resend._domainkey.labs.space'])
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
  it('stamps dns_written_at when the zone write succeeds, and clears it when the write fails (the cron reads it)', async () => {
    state.providerStatus = 'pending'
    await provisionSpaceInboxAddress('s1')
    const written = state.row?.dns_written_at as string
    expect(written).toBeTruthy()
    expect(Number.isNaN(Date.parse(written))).toBe(false)
    state.dnsOk = false
    expect(await provisionSpaceInboxAddress('s1')).toMatchObject({ ok: false, message: expect.stringContaining('tried again on its own') })
    expect(state.row?.dns_written_at).toBeNull()
    expect(state.row?.provider_domain_id).toBe('prov1')
    state.dnsOk = true
    await provisionSpaceInboxAddress('s1')
    expect(state.row?.dns_written_at).toBeTruthy()
  })
  it('a check leaves dns_written_at as it was', async () => {
    state.providerStatus = 'pending'
    await provisionSpaceInboxAddress('s1')
    const written = state.row?.dns_written_at
    state.providerStatus = 'verified'
    await checkSpaceInboxAddress('s1')
    expect(state.row).toMatchObject({ state: 'verified', dns_written_at: written })
  })
  it('patches an existing row with an update, never an upsert of a partial row (the 2026-10-13 02:00 cron run)', async () => {
    // The mock refuses a partial upsert the way Postgres does (domain is NOT NULL with no default), so
    // the dns_written_at stamp and the state flip only land when they are updates.
    state.providerStatus = 'pending'
    await provisionSpaceInboxAddress('s1')
    expect(state.row?.dns_written_at).toBeTruthy()
    state.providerStatus = 'verified'
    expect(await checkSpaceInboxAddress('s1')).toMatchObject({ ok: true, state: 'verified' })
    expect(state.row).toMatchObject({ state: 'verified', domain: 'labs.frequencylocal.com' })
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

describe('listSpaceInboxAddressesToFinish', () => {
  it('asks for pending rows and recent failures, oldest first, within the limit, and throws on a read fault', async () => {
    state.listRows = [{ id: 'r1', space_id: 's1', state: 'pending', dns_written_at: null }]
    const rows = await listSpaceInboxAddressesToFinish({ limit: 25, failedSince: '2026-10-12T12:00:00.000Z' })
    expect(rows).toEqual([expect.objectContaining({ space_id: 's1' })])
    expect(state.listCalls).toEqual([
      { or: 'state.eq.pending,and(state.eq.failed,updated_at.gte.2026-10-12T12:00:00.000Z)' },
      { order: 'updated_at {"ascending":true}' },
      { limit: 25 },
    ])
    state.listFails = true
    await expect(listSpaceInboxAddressesToFinish({ limit: 25, failedSince: '2026-10-12T12:00:00.000Z' })).rejects.toThrow('list down')
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
  it('acks a redelivered message before opening a thread, so a retry leaves no empty conversation (SCAN-1001)', async () => {
    await provisionSpaceInboxAddress('s1')
    const route = await resolveSpaceInboxRoute(['hello@labs.frequencylocal.com'])
    if (route.kind !== 'ready') throw new Error('expected ready')
    state.seenMessages['<m1@example.org>'] = { conversation_id: 'conv0' }
    expect(await recordSpaceInboxMessage(route, parsed)).toEqual({ status: 'duplicate', conversationId: 'conv0' })
    expect(state.opened).toEqual([])
    expect(state.appended).toEqual([])
    expect(state.contacts).toEqual([])
  })
})

describe('provider record names (pure)', () => {
  it('spaceInboxZone is the registrable apex of a multi-label root, else the root', () => {
    expect(spaceInboxZone('frequencylocal.com')).toBe('frequencylocal.com')
    expect(spaceInboxZone('space.frequencylocal.com')).toBe('frequencylocal.com')
    expect(spaceInboxZone('mail.space.frequencylocal.com')).toBe('frequencylocal.com')
  })
  it('providerRecordHost resolves domain-relative, apex-relative and absolute names', () => {
    const d = 'labs.space.frequencylocal.com'
    expect(providerRecordHost(d, '@')).toBe(d)
    expect(providerRecordHost(d, '')).toBe(d)
    expect(providerRecordHost(d, 'send')).toBe(`send.${d}`)
    expect(providerRecordHost(d, 'resend._domainkey')).toBe(`resend._domainkey.${d}`)
    expect(providerRecordHost(d, 'labs.space')).toBe(d)
    expect(providerRecordHost(d, 'send.labs.space')).toBe(`send.${d}`)
    expect(providerRecordHost(d, 'resend._domainkey.labs.space')).toBe(`resend._domainkey.${d}`)
    expect(providerRecordHost(d, d)).toBe(d)
    expect(providerRecordHost(d, `send.${d}`)).toBe(`send.${d}`)
    expect(providerRecordHost('labs.frequencylocal.com', 'send.labs')).toBe('send.labs.frequencylocal.com')
  })
  it('providerRecordsToZoneRecords names records relative to the zone, @ for the zone itself', () => {
    const out = providerRecordsToZoneRecords('labs.space.frequencylocal.com', 'frequencylocal.com', [
      { record: 'Receiving', type: 'MX', name: 'labs.space', value: 'inbound.example.', priority: 10 },
      { record: 'DKIM', type: 'TXT', name: 'resend._domainkey.labs.space', value: 'p=key' },
      { record: 'x', type: 'A', name: 'labs.space', value: '1.2.3.4' },
    ])
    expect(out).toEqual([
      { type: 'MX', name: 'labs.space', value: 'inbound.example', mxPriority: 10, record: 'Receiving' },
      { type: 'TXT', name: 'resend._domainkey.labs.space', value: 'p=key', record: 'DKIM' },
    ])
    expect(providerRecordsToZoneRecords('frequencylocal.com', 'frequencylocal.com', [{ record: 'r', type: 'MX', name: '@', value: 'm', priority: 5 }])[0].name).toBe('@')
  })
})
