import 'server-only'
import { appOrigin } from '@/lib/sites/host'
import type { DiscoverySearchProvider } from '@/lib/ai/discovery-provider-access'

export const SEARCH_SCOPES = {
  google_search_console: 'https://www.googleapis.com/auth/webmasters.readonly',
  bing_webmaster: 'Webmaster.read',
} as const
export function searchProvider(value: unknown): DiscoverySearchProvider | null {
  return value === 'google' ? 'google_search_console' : value === 'bing' ? 'bing_webmaster' : null
}
const providerSegment = (provider: DiscoverySearchProvider) => provider === 'google_search_console' ? 'google' : 'bing'
function searchRedirectUri(provider: DiscoverySearchProvider) {
  return `${appOrigin()}/api/integrations/discovery/${providerSegment(provider)}/callback`
}
export function searchOAuthConfig(provider: DiscoverySearchProvider) {
  const google = provider === 'google_search_console'
  const clientId = (google ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.BING_WEBMASTER_CLIENT_ID)?.trim()
  const clientSecret = (google ? process.env.GOOGLE_OAUTH_CLIENT_SECRET : process.env.BING_WEBMASTER_CLIENT_SECRET)?.trim()
  return clientId && clientSecret && process.env.DISCOVERY_OAUTH_ENCRYPTION_KEY ? { clientId, clientSecret } : null
}
/** Fixed official hosts; no caller-supplied redirect, scope, token endpoint or incremental grant. */
export function searchAuthorizationUrl(provider: DiscoverySearchProvider, state: string, challenge: string) {
  const config = searchOAuthConfig(provider)
  if (!config) return null
  const url = new URL(provider === 'google_search_console' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://www.bing.com/webmasters/oauth/authorize')
  const query = { client_id: config.clientId, response_type: 'code', redirect_uri: searchRedirectUri(provider), scope: provider === 'bing_webmaster' ? 'webmaster.read' : SEARCH_SCOPES[provider], state, code_challenge: challenge, code_challenge_method: 'S256' }
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  if (provider === 'google_search_console') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); url.searchParams.set('include_granted_scopes', 'false') }
  return url.href
}
export interface SearchTokens { accessToken: string; refreshToken?: string; expiresAt: string; scopes: string[] }
const token = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,8192}$/.test(v)
/** Provider secrets remain in a bounded server POST and are never included in returned errors. */
async function tokenRequest(provider: DiscoverySearchProvider, grant: Record<string, string>, previous?: SearchTokens, request: typeof fetch = fetch): Promise<SearchTokens | null> {
  const config = searchOAuthConfig(provider)
  if (!config) return null
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await request(provider === 'google_search_console' ? 'https://oauth2.googleapis.com/token' : 'https://www.bing.com/webmasters/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ ...grant, client_id: config.clientId, client_secret: config.clientSecret }),
      signal: controller.signal, redirect: 'error', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    })
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body) { await response.body?.cancel(); return null }
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0
    while (true) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > 32_768) return null; chunks.push(chunk.value) }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (data.scope !== undefined && typeof data.scope !== 'string') return null
    const reportedScopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : previous?.scopes ?? [SEARCH_SCOPES[provider]]
    // Bing's wire example uses lowercase; keep the broker's established canonical read permission.
    // Only the three explicit read aliases normalize. Mixed, management and unknown scopes fail.
    const scopes = provider === 'bing_webmaster' && reportedScopes.length === 1 && ['Webmaster.read', 'webmaster.read', 'Read'].includes(reportedScopes[0])
      ? [SEARCH_SCOPES.bing_webmaster] : reportedScopes
    if (!token(data.access_token) || (data.refresh_token !== undefined && !token(data.refresh_token)) || !Number.isInteger(data.expires_in) || data.expires_in < 10 || data.expires_in > 86_400 || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' || scopes.length !== 1 || scopes[0] !== SEARCH_SCOPES[provider]) return null
    return { accessToken: data.access_token, ...(data.refresh_token || previous?.refreshToken ? { refreshToken: data.refresh_token ?? previous?.refreshToken } : {}), expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(), scopes }
  } catch { return null }
  finally { clearTimeout(timer); await reader?.cancel().catch(() => undefined) }
}
export async function exchangeSearchCode(provider: DiscoverySearchProvider, code: string, verifier: string, request?: typeof fetch) {
  if (!token(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null
  return tokenRequest(provider, { grant_type: 'authorization_code', code, redirect_uri: searchRedirectUri(provider), code_verifier: verifier }, undefined, request)
}
export async function refreshSearchTokens(provider: DiscoverySearchProvider, previous: SearchTokens, request?: typeof fetch) {
  return previous.refreshToken && token(previous.refreshToken) ? tokenRequest(provider, { grant_type: 'refresh_token', refresh_token: previous.refreshToken }, previous, request) : null
}
