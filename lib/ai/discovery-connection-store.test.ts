import { beforeEach, describe, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ actor: 'owner', permitted: true, consentId: 'grant', revoked: false, rows: [] as Record<string, unknown>[], reads: 0, failure: false }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth', () => ({ getMyProfileId: async () => m.actor }))
vi.mock('@/lib/spaces/discovery-access', () => ({ authorizeDiscoveryEditor: async () => m.permitted ? { actor: m.actor, space: { id: 'space' } } : null }))
vi.mock('@/lib/spaces/private-state', () => ({ loadSpaceDiscoveryConsent: async () => ({ available: true, consent: { version: 1, id: m.consentId, purpose: 'discovery_coaching', grantedBy: m.actor, grantedAt: '2026-10-01T00:00:00.000Z', expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: m.revoked ? new Date().toISOString() : null } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (name: string) => {
  expect(name).toBe('space_discovery_connections'); m.reads++
  const filters: ((row: Record<string, unknown>) => boolean)[] = []
  let update: Record<string, unknown> | undefined, insert: Record<string, unknown> | undefined
  const execute = () => {
    if (m.failure) return { data: null, error: { message: 'unavailable' } }
    if (insert) { const index = m.rows.findIndex(row => row.space_id === insert!.space_id && row.provider === insert!.provider); const row = structuredClone(insert); if (index < 0) m.rows.push(row); else m.rows[index] = row; return { data: row, error: null } }
    const row = m.rows.find(row => filters.every(f => f(row)))
    if (row && update) Object.assign(row, update)
    return { data: row ? structuredClone(row) : null, error: null }
  }
  const query = { select: () => query, eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query }, gt: (key: string, value: string) => { filters.push(row => String(row[key]) > value); return query }, update: (value: Record<string, unknown>) => { update = value; return query }, upsert: (value: Record<string, unknown>) => { insert = value; return query }, maybeSingle: async () => execute(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve) }
  return { select: query.select, update: query.update, upsert: query.upsert }
} }) }))
import { beginSearchConnection, consumeSearchConnection, saveSearchConnection, loadSearchConnection, refreshSearchConnection, disconnectSearchConnection, invalidateSearchConnection, readSearchConnectionStatus } from './discovery-connection-store'
const provider = 'google_search_console'
const begin = () => beginSearchConnection('space', provider, 'sc-domain:example.com', 'page_urls')
const tokens = () => ({ accessToken: 'secret-access', refreshToken: 'secret-refresh', expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] })
async function connected() {
  const started = await begin(); if (!started) throw new Error('start failed')
  const consumed = await consumeSearchConnection(provider, started.state); if (!consumed) throw new Error('consume failed')
  expect(await saveSearchConnection(consumed.binding, tokens())).toBe(true)
  return (await loadSearchConnection('space', provider))!
}
beforeEach(() => { vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64')); m.actor = 'owner'; m.permitted = true; m.consentId = 'grant'; m.revoked = false; m.rows = []; m.reads = 0; m.failure = false })
describe('private connection store', () => {
  it('persists only ciphertext and nonce hash, consumes once and returns a safe status', async () => {
    const started = (await begin())!
    expect(JSON.stringify(m.rows)).not.toContain(started.state.split('.')[1])
    const result = await consumeSearchConnection(provider, started.state)
    expect(result?.verifier).toHaveLength(64)
    expect(await consumeSearchConnection(provider, started.state)).toBeNull()
    expect(await saveSearchConnection(result!.binding, tokens())).toBe(true)
    expect(JSON.stringify(m.rows)).not.toContain('secret-access')
    expect(JSON.stringify(m.rows)).not.toContain('secret-refresh')
    const status = await readSearchConnectionStatus('space', provider)
    expect(status).toMatchObject({ state: 'connected', propertyUrl: 'sc-domain:example.com' })
    expect(Object.keys(status!).sort()).toEqual(['expiresAt', 'propertyUrl', 'state'])
    expect((await loadSearchConnection('space', provider))?.tokens.accessToken).toBe('secret-access')
  })
  it('only one concurrent consumer can exchange a state', async () => {
    const started = (await begin())!
    const both = await Promise.all([consumeSearchConnection(provider, started.state), consumeSearchConnection(provider, started.state)])
    expect(both.filter(Boolean)).toHaveLength(1)
  })
  it('denies outsiders before any private table access', async () => {
    m.permitted = false
    expect(await begin()).toBeNull()
    expect(await loadSearchConnection('space', provider)).toBeNull()
    expect(await disconnectSearchConnection('space', provider)).toBe(false)
    expect(m.reads).toBe(0)
  })
  it('binds callback to actor, provider, grant, generation and expiry', async () => {
    const started = (await begin())!
    m.actor = 'other'; expect(await consumeSearchConnection(provider, started.state)).toBeNull()
    m.actor = 'owner'; expect(await consumeSearchConnection('bing_webmaster', started.state)).toBeNull()
    m.consentId = 'new-grant'; expect(await consumeSearchConnection(provider, started.state)).toBeNull()
    m.consentId = 'grant'; m.rows[0].nonce_expires_at = new Date(Date.now() - 1).toISOString()
    expect(await consumeSearchConnection(provider, started.state)).toBeNull()
    const replacement = (await begin())!
    expect(await consumeSearchConnection(provider, started.state)).toBeNull()
    expect(await consumeSearchConnection(provider, replacement.state)).not.toBeNull()
  })
  it('blocks saved/exchanged tokens immediately when consent is revoked or replaced', async () => {
    const existing = await connected()
    m.revoked = true
    expect(await loadSearchConnection('space', provider)).toBeNull()
    expect(await refreshSearchConnection(existing.binding, tokens())).toBe(false)
    m.revoked = false; m.consentId = 'new-grant'
    expect(await loadSearchConnection('space', provider)).toBeNull()
    expect(await refreshSearchConnection(existing.binding, tokens())).toBe(false)
  })
  it('can forget credentials after consent revocation without decrypting them', async () => {
    await connected(); m.revoked = true
    vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', '')
    expect(await readSearchConnectionStatus('space', provider)).toMatchObject({ state: 'connected' })
    expect(await disconnectSearchConnection('space', provider)).toBe(true)
    expect(m.rows[0]).toMatchObject({ state: 'revoked', tokens_ciphertext: null, pending_ciphertext: null })
  })
  it('never returns another editor’s stored credentials or status', async () => {
    await connected(); m.actor = 'other'
    expect(await loadSearchConnection('space', provider)).toBeNull()
    expect(await readSearchConnectionStatus('space', provider)).toBeNull()
    expect(await disconnectSearchConnection('space', provider)).toBe(true)
    expect(m.rows[0].state).toBe('connected')
  })
  it('uses revisions so stale refreshes cannot overwrite a rotated token or resurrect disconnect', async () => {
    const previous = await connected()
    expect(await refreshSearchConnection(previous.binding, { ...tokens(), refreshToken: 'rotated' })).toBe(true)
    expect(await refreshSearchConnection(previous.binding, tokens())).toBe(false)
    const current = (await loadSearchConnection('space', provider))!
    expect(current.tokens.refreshToken).toBe('rotated')
    expect(await disconnectSearchConnection('space', provider)).toBe(true)
    expect(await refreshSearchConnection(current.binding, tokens())).toBe(false)
  })
  it('refuses callback save after the consumed OAuth state expires', async () => {
    const initial = (await begin())!, consumed = (await consumeSearchConnection(provider, initial.state))!
    m.rows[0].nonce_expires_at = new Date(Date.now() - 1).toISOString()
    expect(await saveSearchConnection(consumed.binding, tokens())).toBe(false)
  })

  it('stale callback invalidation cannot cancel a newer flow', async () => {
    const initial = (await begin())!, old = (await consumeSearchConnection(provider, initial.state))!
    const next = (await begin())!
    expect(await invalidateSearchConnection(old.binding)).toBe(false)
    expect(await consumeSearchConnection(provider, next.state)).not.toBeNull()
  })
  it('refuses missing or write-capable provider scope instead of storing an unusable grant', async () => {
    const started = (await begin())!, consumed = (await consumeSearchConnection(provider, started.state))!
    expect(await saveSearchConnection(consumed.binding, { ...tokens(), scopes: [] })).toBe(false)
    expect(await saveSearchConnection(consumed.binding, { ...tokens(), scopes: [...tokens().scopes, 'https://www.googleapis.com/auth/webmasters'] })).toBe(false)
    expect(m.rows[0].state).toBe('exchanging')
  })
  it.each(['google_search_console', 'bing_webmaster'] as const)('persists only an exact single canonical read permission for %s', async selected => {
    const read = selected === 'google_search_console' ? 'https://www.googleapis.com/auth/webmasters.readonly' : 'Webmaster.read'
    const write = selected === 'google_search_console' ? 'https://www.googleapis.com/auth/webmasters' : 'Webmaster.manage'
    const started = (await beginSearchConnection('space', selected, selected === 'google_search_console' ? 'sc-domain:example.com' : 'https://example.com/', selected === 'google_search_console' ? 'page_urls' : 'dedicated_property'))!
    const consumed = (await consumeSearchConnection(selected, started.state))!
    for (const scopes of [[`prefix:${read}`], [`${read}.suffix`], [read.slice(0, -1)], [read, write], [read, 'unknown'], [read, read]]) {
      expect(await saveSearchConnection(consumed.binding, { ...tokens(), scopes })).toBe(false)
      expect(m.rows[0].tokens_ciphertext).toBeNull()
    }
    expect(await saveSearchConnection(consumed.binding, { ...tokens(), scopes: [read] })).toBe(true)
    expect((await loadSearchConnection('space', selected))?.tokens.scopes).toEqual([read])
  })
  it('does not persist callback tokens when actor permission disappears during provider IO', async () => {
    const started = (await begin())!, consumed = (await consumeSearchConnection(provider, started.state))!
    m.permitted = false
    expect(await saveSearchConnection(consumed.binding, tokens())).toBe(false)
    expect(m.rows[0].tokens_ciphertext).toBeNull()
  })

  it('fails closed without encryption key or available storage', async () => {
    vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', '')
    expect(await begin()).toBeNull(); expect(m.reads).toBe(0)
    vi.stubEnv('DISCOVERY_OAUTH_ENCRYPTION_KEY', Buffer.alloc(32, 3).toString('base64')); m.failure = true
    expect(await begin()).toBeNull()
  })
})
