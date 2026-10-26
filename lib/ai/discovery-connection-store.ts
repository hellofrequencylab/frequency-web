import 'server-only'
import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { loadSpaceDiscoveryConsent } from '@/lib/spaces/private-state'
import { discoveryConsentActive } from '@/lib/spaces/discovery-consent'
import { newSearchOAuthState, parseSearchOAuthState, sealSearchSecret, openSearchSecret, type SearchConnectionBinding } from './discovery-oauth-state'

interface SearchConnectionTokens { accessToken: string; refreshToken?: string; expiresAt: string; scopes: string[] }
type Provider = SearchConnectionBinding['provider']
type Row = { space_id: string; provider: Provider; id: string; revision: number; actor_profile_id: string; consent_id: string; property_url: string; property_scope: SearchConnectionBinding['propertyScope']; state: string; nonce_hash: string | null; nonce_expires_at: string | null; pending_ciphertext: string | null; tokens_ciphertext: string | null; expires_at: string | null; scopes: string[]; updated_at: string }
type Result = { data: Row | null; error: unknown }
interface Query extends PromiseLike<Result> { select(columns: string): Query; eq(column: string, value: unknown): Query; gt(column: string, value: string): Query; update(value: Partial<Row>): Query; upsert(value: Partial<Row>, options: { onConflict: string }): Query; maybeSingle(): Promise<Result> }
// This privileged reader is deliberately local: every public entry re-resolves fresh editor and
// purpose consent; no caller-provided actor/role can authorize the service-role table.
const table = () => (createAdminClient() as unknown as { from(name: string): Query }).from('space_discovery_connections')
const COLS = 'space_id,provider,id,revision,actor_profile_id,consent_id,property_url,property_scope,state,nonce_hash,nonce_expires_at,pending_ciphertext,tokens_ciphertext,expires_at,scopes,updated_at'
const providerValid = (v: string): v is Provider => v === 'google_search_console' || v === 'bing_webmaster'
function binding(row: Row): SearchConnectionBinding { return { spaceId: row.space_id, provider: row.provider, connectionId: row.id, revision: row.revision, actorProfileId: row.actor_profile_id, consentId: row.consent_id, propertyUrl: row.property_url, propertyScope: row.property_scope } }
async function authority(spaceId: string, expected?: SearchConnectionBinding) {
  const editor = await authorizeDiscoveryEditor(spaceId)
  if (!editor || (expected && editor.actor !== expected.actorProfileId)) return null
  const stored = await loadSpaceDiscoveryConsent(spaceId)
  if (!stored.available || !discoveryConsentActive(stored.consent) || (expected && stored.consent.id !== expected.consentId)) return null
  return { actor: editor.actor, consentId: stored.consent.id }
}
function tokenValue(raw: unknown): SearchConnectionTokens | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = raw as Record<string, unknown>
  if (Object.keys(v).some(k => !['accessToken', 'refreshToken', 'expiresAt', 'scopes'].includes(k)) || typeof v.accessToken !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(v.accessToken) || (v.refreshToken !== undefined && (typeof v.refreshToken !== 'string' || !/^[\x21-\x7e]{1,8192}$/.test(v.refreshToken))) || typeof v.expiresAt !== 'string' || !Number.isFinite(Date.parse(v.expiresAt)) || !Array.isArray(v.scopes) || v.scopes.length > 16 || v.scopes.some(s => typeof s !== 'string' || !/^[\x21-\x7e]{1,512}$/.test(s))) return null
  return v as unknown as SearchConnectionTokens
}
function propertyValid(property: string, scope: SearchConnectionBinding['propertyScope'], provider: Provider) {
  if (typeof property !== 'string' || !property || property.length > 2048 || !['dedicated_property', 'page_urls'].includes(scope) || (provider === 'bing_webmaster' && scope !== 'dedicated_property')) return false
  if (provider === 'google_search_console' && /^sc-domain:[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+$/.test(property)) return true
  try { const u = new URL(property); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.href === property } catch { return false }
}
/** Server-only start; a new generation replaces any previous pending/connected credential. */
export async function beginSearchConnection(spaceId: string, provider: Provider, propertyUrl: string, propertyScope: SearchConnectionBinding['propertyScope']): Promise<{ state: string; challenge: string; connectionId: string } | null> {
  try {
    if (!providerValid(provider) || !propertyValid(propertyUrl, propertyScope, provider)) return null
    const gate = await authority(spaceId)
    if (!gate) return null
    const id = randomUUID(), oauth = newSearchOAuthState(id)
    const bound: SearchConnectionBinding = { spaceId, provider, connectionId: id, revision: 1, actorProfileId: gate.actor, consentId: gate.consentId, propertyUrl, propertyScope }
    const ciphertext = sealSearchSecret(bound, 'pending', { verifier: oauth.verifier })
    if (!ciphertext || !(await authority(spaceId, bound))) return null
    const { error } = await table().upsert({ space_id: spaceId, provider, id, revision: 1, actor_profile_id: gate.actor, consent_id: gate.consentId, property_url: propertyUrl, property_scope: propertyScope, state: 'pending', nonce_hash: oauth.nonceHash, nonce_expires_at: new Date(Date.now() + 600_000).toISOString(), pending_ciphertext: ciphertext, tokens_ciphertext: null, expires_at: null, scopes: [], updated_at: new Date().toISOString() }, { onConflict: 'space_id,provider' })
    return !error && await authority(spaceId, bound) ? { state: oauth.state, challenge: oauth.challenge, connectionId: id } : null
  } catch { return null }
}
/** One-use state. Lookup is additionally restricted to the freshly authenticated actor before the
 * Space id is known; full current Space/consent authority is then required before atomic consume. */
export async function consumeSearchConnection(provider: Provider, state: string): Promise<{ binding: SearchConnectionBinding; verifier: string } | null> {
  try {
    const parsed = parseSearchOAuthState(state), actor = await getMyProfileId()
    if (!parsed || !actor || !providerValid(provider)) return null
    const query = (base: Query) => base.eq('id', parsed.connectionId).eq('provider', provider).eq('actor_profile_id', actor).eq('nonce_hash', parsed.nonceHash).eq('state', 'pending').gt('nonce_expires_at', new Date().toISOString())
    const read = await query(table().select(COLS)).maybeSingle()
    if (read.error || !read.data) return null
    const bound = binding(read.data)
    if (!(await authority(bound.spaceId, bound))) return null
    const consumed = await query(table().update({ state: 'exchanging', revision: bound.revision + 1, nonce_hash: null, updated_at: new Date().toISOString() })).eq('space_id', bound.spaceId).eq('consent_id', bound.consentId).eq('revision', bound.revision).select(COLS).maybeSingle()
    if (consumed.error || !consumed.data || !(await authority(bound.spaceId, bound))) return null
    const secret = openSearchSecret(bound, 'pending', consumed.data.pending_ciphertext ?? '') as { verifier?: unknown } | null
    return secret && typeof secret.verifier === 'string' && /^[A-Za-z0-9_-]{64}$/.test(secret.verifier) ? { binding: binding(consumed.data), verifier: secret.verifier } : null
  } catch { return null }
}
async function persist(bound: SearchConnectionBinding, raw: SearchConnectionTokens, expectedState: 'exchanging' | 'connected'): Promise<boolean> {
  try {
    const tokens = tokenValue(raw)
    const required = bound.provider === 'google_search_console' ? 'https://www.googleapis.com/auth/webmasters.readonly' : 'Webmaster.read'
    const forbidden = bound.provider === 'google_search_console' ? 'https://www.googleapis.com/auth/webmasters' : 'Webmaster.manage'
    if (!tokens?.scopes.includes(required) || tokens.scopes.includes(forbidden)) return false
    if (!tokens || !Number.isSafeInteger(bound.revision) || bound.revision < 1 || Date.parse(tokens.expiresAt) <= Date.now() || !providerValid(bound.provider) || !(await authority(bound.spaceId, bound))) return false
    const sealed = sealSearchSecret(bound, 'tokens', tokens)
    if (!sealed || !(await authority(bound.spaceId, bound))) return false
    const write = table().update({ state: 'connected', revision: bound.revision + 1, tokens_ciphertext: sealed, pending_ciphertext: null, nonce_hash: null, nonce_expires_at: null, expires_at: tokens.expiresAt, scopes: tokens.scopes, updated_at: new Date().toISOString() }).eq('space_id', bound.spaceId).eq('provider', bound.provider).eq('id', bound.connectionId).eq('actor_profile_id', bound.actorProfileId).eq('consent_id', bound.consentId).eq('property_url', bound.propertyUrl).eq('property_scope', bound.propertyScope).eq('state', expectedState).eq('revision', bound.revision)
    const { data, error } = await (expectedState === 'exchanging' ? write.gt('nonce_expires_at', new Date().toISOString()) : write).select(COLS).maybeSingle()
    return !error && !!data && !!(await authority(bound.spaceId, bound))
  } catch { return false }
}
export async function saveSearchConnection(bound: SearchConnectionBinding, tokens: SearchConnectionTokens): Promise<boolean> { return persist(bound, tokens, 'exchanging') }
export async function refreshSearchConnection(bound: SearchConnectionBinding, tokens: SearchConnectionTokens): Promise<boolean> { return persist(bound, tokens, 'connected') }
/** Private broker only. Never return this result through an action/route response or cache. */
export async function loadSearchConnection(spaceId: string, provider: Provider): Promise<{ binding: SearchConnectionBinding; tokens: SearchConnectionTokens } | null> {
  try {
    const gate = await authority(spaceId)
    if (!gate || !providerValid(provider)) return null
    const { data, error } = await table().select(COLS).eq('space_id', spaceId).eq('provider', provider).eq('actor_profile_id', gate.actor).eq('consent_id', gate.consentId).eq('state', 'connected').maybeSingle()
    if (error || !data || !(await authority(spaceId, binding(data)))) return null
    const tokens = tokenValue(openSearchSecret(binding(data), 'tokens', data.tokens_ciphertext ?? ''))
    return tokens ? { binding: binding(data), tokens } : null
  } catch { return null }
}
/** Safe account setup status; permits forgetting expired/revoked-consent credentials without use. */
export async function readSearchConnectionStatus(spaceId: string, provider: Provider): Promise<{ state: string; propertyUrl: string; expiresAt: string | null } | null> {
  try {
    const editor = await authorizeDiscoveryEditor(spaceId)
    if (!editor || !providerValid(provider)) return null
    const result = await table().select('space_id,provider,id,actor_profile_id,state,property_url,expires_at').eq('space_id', spaceId).eq('provider', provider).eq('actor_profile_id', editor.actor).maybeSingle()
    const fresh = await authorizeDiscoveryEditor(spaceId)
    return !result.error && result.data && fresh?.actor === editor.actor ? { state: result.data.state, propertyUrl: result.data.property_url, expiresAt: result.data.expires_at } : null
  } catch { return null }
}
/** Specific generation/revision invalidation. An old callback cannot cancel a newer connection. */
export async function invalidateSearchConnection(bound: SearchConnectionBinding): Promise<boolean> {
  try {
    const editor = await authorizeDiscoveryEditor(bound.spaceId)
    if (!editor || editor.actor !== bound.actorProfileId || !providerValid(bound.provider) || !Number.isSafeInteger(bound.revision)) return false
    const result = await table().update({ state: 'revoked', revision: bound.revision + 1, tokens_ciphertext: null, pending_ciphertext: null, nonce_hash: null, nonce_expires_at: null, expires_at: null, scopes: [], updated_at: new Date().toISOString() }).eq('space_id', bound.spaceId).eq('provider', bound.provider).eq('id', bound.connectionId).eq('revision', bound.revision).eq('actor_profile_id', bound.actorProfileId).eq('consent_id', bound.consentId).select('space_id,id').maybeSingle()
    return !result.error && !!result.data
  } catch { return false }
}
export async function disconnectSearchConnection(spaceId: string, provider: Provider): Promise<boolean> {
  try {
    const editor = await authorizeDiscoveryEditor(spaceId)
    if (!editor || !providerValid(provider)) return false
    const { data, error } = await table().select(COLS).eq('space_id', spaceId).eq('provider', provider).eq('actor_profile_id', editor.actor).maybeSingle()
    if (error) return false
    return data ? invalidateSearchConnection(binding(data)) : true
  } catch { return false }
}
