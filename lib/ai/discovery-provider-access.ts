import 'server-only'
import { validateDiscoveryObservation, type DiscoveryAccessScope } from './discovery-evidence'

export type DiscoverySearchProvider = 'google_search_console' | 'bing_webmaster'
/** All fields come from fresh server readers, never request bodies or public Space preferences. */
export interface DiscoveryProviderAccess {
  spaceId: string
  actorProfileId: string
  canEditProfile: boolean
  consent: DiscoveryAccessScope['consent']
  authorizedPageUrls: readonly string[]
}
/** Opaque broker output. No refresh token is accepted or returned by observation services. */
export interface DiscoveryProviderConnection {
  provider: DiscoverySearchProvider
  connectionId: string
  spaceId: string
  actorProfileId: string
  consentId: string
  propertyUrl: string
  /** Dedicated property ownership must be verified by the server, never inferred from provider access. */
  propertyScope: 'dedicated_property' | 'page_urls'
  accessToken: string
  expiresAt: string
  revokedAt: string | null
  scopes: readonly string[]
}
export interface DiscoveryProviderDependencies {
  resolveAccess: (spaceId: string) => Promise<DiscoveryProviderAccess | null>
  resolveConnection: (spaceId: string, actorProfileId: string, consentId: string) => Promise<DiscoveryProviderConnection | null>
  /** A private credential broker may refresh once; it must retain the same connection binding. */
  refreshConnection?: (connection: DiscoveryProviderConnection) => Promise<DiscoveryProviderConnection | null>
  now?: () => Date
}
export type DiscoveryProviderSession = { access: DiscoveryProviderAccess; connection: DiscoveryProviderConnection; requiredScope: string }
type DiscoveryProviderOpen = { status: 'ready'; session: DiscoveryProviderSession } | { status: 'unavailable'; reason: 'permission_denied' | 'consent_required' | 'invalid_context' | 'not_connected' | 'connection_expired' }
const token = (value: string) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value)
function pagesValid(pages: readonly string[]) {
  return Array.isArray(pages) && pages.length > 0 && pages.length <= 200 && new Set(pages).size === pages.length && pages.every(raw => {
    try { const url = new URL(raw); return raw.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.href === raw } catch { return false }
  })
}
function accessReason(access: DiscoveryProviderAccess | null, spaceId: string, now: Date): Extract<DiscoveryProviderOpen, { status: 'unavailable' }>['reason'] | null {
  if (!access || access.spaceId !== spaceId || !token(access.actorProfileId) || access.canEditProfile !== true) return 'permission_denied'
  const gate = validateDiscoveryObservation({ status: 'unavailable', provider: 'first_party_aggregate', metric: 'provider_setup', reason: 'no_data', scope: { spaceId, consentId: access.consent?.id }, retrievedAt: now.toISOString() }, { spaceId, authorized: true, consent: access.consent }, now)
  if (gate.status !== 'unavailable' || gate.reason !== 'no_data') return 'consent_required'
  return pagesValid(access.authorizedPageUrls) ? null : 'invalid_context'
}
function bound(connection: DiscoveryProviderConnection, access: DiscoveryProviderAccess, provider: DiscoverySearchProvider, requiredScope: string) {
  return ['dedicated_property', 'page_urls'].includes(connection.propertyScope) && connection.provider === provider && token(connection.connectionId) && connection.spaceId === access.spaceId && connection.actorProfileId === access.actorProfileId && connection.consentId === access.consent.id && connection.revokedAt === null && typeof connection.propertyUrl === 'string' && connection.propertyUrl.length <= 2048 && typeof connection.accessToken === 'string' && /^[\x21-\x7e]{1,8192}$/.test(connection.accessToken) && Array.isArray(connection.scopes) && connection.scopes.length === 1 && connection.scopes[0] === requiredScope
}
function sameAccess(a: DiscoveryProviderAccess, b: DiscoveryProviderAccess) {
  return a.actorProfileId === b.actorProfileId && a.consent.id === b.consent.id && a.authorizedPageUrls.length === b.authorizedPageUrls.length && a.authorizedPageUrls.every(page => b.authorizedPageUrls.includes(page))
}
/** Re-read permission, consent and private connection after IO. A stale/refreshed token is not authority. */
async function sessionCurrent(session: DiscoveryProviderSession, deps: DiscoveryProviderDependencies, requireUsable: boolean): Promise<boolean> {
  try {
    const now = deps.now?.() ?? new Date()
    if (!Number.isFinite(now.getTime())) return false
    const fresh = await deps.resolveAccess(session.access.spaceId)
    if (accessReason(fresh, session.access.spaceId, now) || !fresh || !sameAccess(session.access, fresh)) return false
    const connection = await deps.resolveConnection(fresh.spaceId, fresh.actorProfileId, fresh.consent.id)
    return !!connection && bound(connection, fresh, session.connection.provider, session.requiredScope) && (!requireUsable || (Number.isFinite(Date.parse(connection.expiresAt)) && Date.parse(connection.expiresAt) > (deps.now?.() ?? new Date()).getTime() + 5000)) && connection.provider === session.connection.provider && connection.connectionId === session.connection.connectionId && connection.propertyUrl === session.connection.propertyUrl && connection.propertyScope === session.connection.propertyScope && connection.spaceId === fresh.spaceId && connection.actorProfileId === fresh.actorProfileId && connection.consentId === fresh.consent.id
  } catch { return false }
}
export async function discoveryProviderSessionCurrent(session: DiscoveryProviderSession, deps: DiscoveryProviderDependencies): Promise<boolean> {
  return sessionCurrent(session, deps, true)
}
export async function openDiscoveryProvider(spaceId: string, provider: DiscoverySearchProvider, requiredScope: string, deps: DiscoveryProviderDependencies): Promise<DiscoveryProviderOpen> {
  try {
    const now = deps.now?.() ?? new Date()
    if (!token(spaceId) || !Number.isFinite(now.getTime())) return { status: 'unavailable', reason: 'invalid_context' }
    const access = await deps.resolveAccess(spaceId)
    const reason = accessReason(access, spaceId, now)
    if (reason || !access) return { status: 'unavailable', reason: reason ?? 'permission_denied' }
    let connection = await deps.resolveConnection(spaceId, access.actorProfileId, access.consent.id)
    if (!connection || !bound(connection, access, provider, requiredScope)) return { status: 'unavailable', reason: 'not_connected' }
    const session = { access, connection, requiredScope }
    if (!(await sessionCurrent(session, deps, false))) return { status: 'unavailable', reason: 'not_connected' }
    if (!Number.isFinite(Date.parse(connection.expiresAt)) || Date.parse(connection.expiresAt) <= now.getTime() + 5000) {
      if (!deps.refreshConnection) return { status: 'unavailable', reason: 'connection_expired' }
      const refreshed = await deps.refreshConnection(connection)
      const refreshedNow = deps.now?.() ?? new Date()
      if (!refreshed || !bound(refreshed, access, provider, requiredScope) || refreshed.connectionId !== connection.connectionId || refreshed.propertyUrl !== connection.propertyUrl || refreshed.propertyScope !== connection.propertyScope || !Number.isFinite(Date.parse(refreshed.expiresAt)) || Date.parse(refreshed.expiresAt) <= refreshedNow.getTime() + 5000 || !(await sessionCurrent(session, deps, false))) return { status: 'unavailable', reason: 'connection_expired' }
      connection = refreshed
    }
    return { status: 'ready', session: { access, connection, requiredScope } }
  } catch { return { status: 'unavailable', reason: 'not_connected' } }
}
