import 'server-only'
import { authorizeDiscoveryEditor } from '@/lib/spaces/discovery-access'
import { loadSpaceDiscoveryConsent, loadSpaceCoachProfile } from '@/lib/spaces/private-state'
import { discoveryConsentActive } from '@/lib/spaces/discovery-consent'
import { readWebsitePublished } from '@/lib/spaces/website'
import { liveSiteDomain } from '@/lib/sites/site-domain'
import { appOrigin } from '@/lib/sites/host'
import { rateLimitOk } from '@/lib/rate-limit'
import { loadSearchConnection, refreshSearchConnection } from './discovery-connection-store'
import type { SearchConnectionBinding } from './discovery-oauth-state'
import type { SearchTokens } from '@/lib/integrations/discovery/oauth'
import { refreshSearchTokens } from '@/lib/integrations/discovery/oauth'
import { observeGoogleSearchConsole, listGoogleSearchConsoleProperties } from './discovery-google'
import { observeBingDiscovery, verifyBingSearchProperty } from './discovery-bing'
import { coachDiscovery } from './discovery-coach'
import type { DiscoveryProviderDependencies, DiscoverySearchProvider } from './discovery-provider-access'

/** Only two independently owned doors: this profile and its currently served, published site root.
 * Provider account access alone never adds a page, another Space, or the shared app-host root. */
export async function resolveSearchAccess(spaceId: string) {
  const editor = await authorizeDiscoveryEditor(spaceId)
  if (!editor) return null
  const saved = await loadSpaceDiscoveryConsent(spaceId)
  if (!saved.available || !discoveryConsentActive(saved.consent)) return null
  const domain = await liveSiteDomain(editor.space)
  const pages = [`${appOrigin()}/spaces/${encodeURIComponent(editor.space.slug)}`, ...(domain ? [`https://${domain}/`] : [])]
  const fresh = await authorizeDiscoveryEditor(spaceId), current = await loadSpaceDiscoveryConsent(spaceId)
  if (!fresh || fresh.actor !== editor.actor || fresh.space.slug !== editor.space.slug || fresh.space.domain !== editor.space.domain || fresh.space.parentId !== editor.space.parentId || fresh.space.ownerProfileId !== editor.space.ownerProfileId || JSON.stringify(readWebsitePublished(fresh.space.preferences)) !== JSON.stringify(readWebsitePublished(editor.space.preferences)) || !current.available || !discoveryConsentActive(current.consent) || current.consent.id !== saved.consent.id) return null
  if (await liveSiteDomain(fresh.space) !== domain) return null
  const finalEditor = await authorizeDiscoveryEditor(spaceId), finalGrant = await loadSpaceDiscoveryConsent(spaceId)
  if (!finalEditor || finalEditor.actor !== editor.actor || finalEditor.space.slug !== fresh.space.slug || finalEditor.space.parentId !== fresh.space.parentId || finalEditor.space.ownerProfileId !== fresh.space.ownerProfileId || finalEditor.space.domain !== fresh.space.domain || JSON.stringify(readWebsitePublished(finalEditor.space.preferences)) !== JSON.stringify(readWebsitePublished(fresh.space.preferences)) || !finalGrant.available || !discoveryConsentActive(finalGrant.consent) || finalGrant.consent.id !== current.consent.id) return null
  return { spaceId, actorProfileId: editor.actor, canEditProfile: true, consent: current.consent, authorizedPageUrls: pages }
}
export function searchProviderDependencies(provider: DiscoverySearchProvider, pending?: { binding: SearchConnectionBinding; tokens: SearchTokens }): DiscoveryProviderDependencies {
  return {
    resolveAccess: resolveSearchAccess,
    resolveConnection: async (spaceId, actor, consent) => {
      const privateState = pending ?? await loadSearchConnection(spaceId, provider)
      if (!privateState || privateState.binding.spaceId !== spaceId || privateState.binding.provider !== provider || privateState.binding.actorProfileId !== actor || privateState.binding.consentId !== consent) return null
      return { ...privateState.binding, ...privateState.tokens, revokedAt: null }
    },
    refreshConnection: async connection => {
      if (pending) return null
      const stored = await loadSearchConnection(connection.spaceId, provider)
      if (!stored || stored.binding.connectionId !== connection.connectionId || stored.binding.propertyUrl !== connection.propertyUrl) return null
      const refreshed = await refreshSearchTokens(provider, stored.tokens)
      if (!refreshed || !(await refreshSearchConnection(stored.binding, refreshed))) return null
      // Reload the authoritative revision; concurrent disconnect or replacement cannot be undone.
      const current = await loadSearchConnection(connection.spaceId, provider)
      return current && current.binding.connectionId === connection.connectionId ? { ...current.binding, ...current.tokens, revokedAt: null } : null
    },
  }
}
export async function searchPropertyAllowed(spaceId: string, provider: DiscoverySearchProvider, property: string): Promise<'dedicated_property' | 'page_urls' | null> {
  const access = await resolveSearchAccess(spaceId)
  if (!access || typeof property !== 'string' || property.length > 2048) return null
  if (provider === 'bing_webmaster') return access.authorizedPageUrls.includes(property) && new URL(property).pathname === '/' ? 'dedicated_property' : null
  if (/^sc-domain:[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z0-9]+$/.test(property)) {
    const host = property.slice(10)
    return access.authorizedPageUrls.some(page => new URL(page).hostname === host || new URL(page).hostname.endsWith('.' + host)) ? 'page_urls' : null
  }
  try {
    const u = new URL(property)
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.href === property && access.authorizedPageUrls.some(page => new URL(page).origin === u.origin && page.startsWith(property)) ? 'page_urls' : null
  } catch { return null }
}
/** Provider property verification before credentials become connected. No property stats are persisted. */
export async function verifySearchConnection(binding: SearchConnectionBinding, tokens: SearchTokens): Promise<boolean> {
  const allowed = await searchPropertyAllowed(binding.spaceId, binding.provider, binding.propertyUrl)
  if (!allowed || allowed !== binding.propertyScope) return false
  const deps = searchProviderDependencies(binding.provider, { binding, tokens })
  if (binding.provider === 'google_search_console') {
    const result = await listGoogleSearchConsoleProperties(binding.spaceId, deps)
    return result.status === 'completed' && result.propertyUrls.includes(binding.propertyUrl)
  }
  const result = await verifyBingSearchProperty(binding.spaceId, deps)
  return result.status === 'completed'
}
/** On-demand only. There is no automatic publish, learned rewrite, scheduled polling or query storage. */
export async function reviewSearchSignals(spaceId: string, provider: DiscoverySearchProvider) {
  const access = await resolveSearchAccess(spaceId)
  if (!access) return { status: 'unavailable' as const, reason: 'consent_or_permission_required' }
  const observedConnection = await loadSearchConnection(spaceId, provider)
  if (!observedConnection) return { status: 'unavailable' as const, reason: 'not_connected' }
  if (!(await rateLimitOk('discovery-search', `${provider}:${spaceId}:${access.actorProfileId}`, 1, '60 s'))) return { status: 'unavailable' as const, reason: 'rate_limited' }
  const deps = searchProviderDependencies(provider)
  const now = new Date()
  // Google final web data uses Pacific calendar dates, leaving three days for provider lag.
  const pacific = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const result = provider === 'google_search_console'
    ? await observeGoogleSearchConsole(spaceId, { startDate: pacific(new Date(now.getTime() - 30 * 86_400_000)), endDate: pacific(new Date(now.getTime() - 3 * 86_400_000)) }, deps)
    : await observeBingDiscovery(spaceId, { from: new Date(now.getTime() - 30 * 86_400_000).toISOString(), to: now.toISOString() }, deps)
  if (result.status !== 'completed') return result
  const observations = 'imported' in result ? result.imported.observations : result.observations
  const context = await loadSpaceCoachProfile(spaceId)
  const fresh = await resolveSearchAccess(spaceId)
  if (!fresh || fresh.actorProfileId !== access.actorProfileId || fresh.consent.id !== access.consent.id || JSON.stringify(fresh.authorizedPageUrls) !== JSON.stringify(access.authorizedPageUrls)) return { status: 'unavailable' as const, reason: 'consent_or_permission_required' }
  const connectionNow = await loadSearchConnection(spaceId, provider)
  if (!connectionNow || connectionNow.binding.connectionId !== observedConnection.binding.connectionId || connectionNow.binding.actorProfileId !== observedConnection.binding.actorProfileId || connectionNow.binding.consentId !== observedConnection.binding.consentId || connectionNow.binding.propertyUrl !== observedConnection.binding.propertyUrl || connectionNow.binding.propertyScope !== observedConnection.binding.propertyScope) return { status: 'unavailable' as const, reason: 'not_connected' }
  return { status: 'completed' as const, propertyUrl: result.propertyUrl, limitations: result.limitations,
    coaching: coachDiscovery({ observations, access: { spaceId, authorized: true, consent: fresh.consent }, owner: { audience: context.available ? context.profile.audience : '', voice: context.available ? context.profile.voice : '', goal: 'enquiries' }, now: new Date() }) }
}
