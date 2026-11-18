import 'server-only'
import { envFlag, envStringOrNull } from '@/lib/env/string'
import { appOrigin } from '@/lib/sites/host'
import { calendarSealKey } from './seal'

// CALENDAR SYNC OAUTH (LIVE-1179, ADR-1976). Google first. Off unless CALENDAR_SYNC_ENABLED is on
// AND the Google OAuth client and the seal key are all set; any one missing and the settings show
// the rows with no Connect button. The Google client is the same one the Contacts import uses
// (GOOGLE_OAUTH_CLIENT_ID / _SECRET), with the Calendar API enabled and one more redirect URI.
// Fixed hosts, fixed scope, PKCE, and no caller-supplied redirect.

export type CalendarProvider = 'google'

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'

export interface CalendarTokens {
  accessToken: string
  refreshToken?: string
  expiresAt: string
}

export function calendarProvider(value: unknown): CalendarProvider | null {
  return value === 'google' ? 'google' : null
}

function googleClient(): { clientId: string; clientSecret: string } | null {
  const clientId = envStringOrNull('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = envStringOrNull('GOOGLE_OAUTH_CLIENT_SECRET')
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** True when a Space admin can press Connect for this provider. */
export function calendarSyncReady(provider: CalendarProvider): boolean {
  return envFlag('CALENDAR_SYNC_ENABLED') && provider === 'google' && !!googleClient() && !!calendarSealKey()
}

function calendarRedirectUri(provider: CalendarProvider): string {
  return `${appOrigin()}/api/integrations/calendar/${provider}/callback`
}

export function calendarAuthorizationUrl(provider: CalendarProvider, state: string, challenge: string): string | null {
  const client = googleClient()
  if (!calendarSyncReady(provider) || !client) return null
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  const query = {
    client_id: client.clientId,
    response_type: 'code',
    redirect_uri: calendarRedirectUri(provider),
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
  }
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  return url.href
}

const token = (v: unknown): v is string => typeof v === 'string' && /^[\x21-\x7e]{1,8192}$/.test(v)

async function tokenRequest(grant: Record<string, string>, previous?: CalendarTokens, request: typeof fetch = fetch): Promise<CalendarTokens | null> {
  const client = googleClient()
  if (!client) return null
  try {
    const response = await request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ ...grant, client_id: client.clientId, client_secret: client.clientSecret }),
      signal: AbortSignal.timeout(8000),
      redirect: 'error',
      cache: 'no-store',
    })
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }
    const data: unknown = await response.json()
    if (typeof data !== 'object' || data === null) return null
    const d = data as Record<string, unknown>
    const scopes = typeof d.scope === 'string' ? d.scope.split(/\s+/) : previous ? [GOOGLE_CALENDAR_SCOPE] : []
    if (!scopes.includes(GOOGLE_CALENDAR_SCOPE)) return null
    if (!token(d.access_token) || (d.refresh_token !== undefined && !token(d.refresh_token))) return null
    if (typeof d.expires_in !== 'number' || !Number.isInteger(d.expires_in) || d.expires_in < 10 || d.expires_in > 86_400) return null
    const refreshToken = (d.refresh_token as string | undefined) ?? previous?.refreshToken
    return {
      accessToken: d.access_token,
      ...(refreshToken ? { refreshToken } : {}),
      expiresAt: new Date(Date.now() + d.expires_in * 1000).toISOString(),
    }
  } catch {
    return null
  }
}

export async function exchangeCalendarCode(provider: CalendarProvider, code: string, verifier: string, request?: typeof fetch): Promise<CalendarTokens | null> {
  if (!token(code) || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier)) return null
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: calendarRedirectUri(provider), code_verifier: verifier }, undefined, request)
}

/** A fresh access token when the stored one is within a minute of expiring. Null when it cannot. */
export async function freshCalendarTokens(tokens: CalendarTokens, request?: typeof fetch): Promise<CalendarTokens | null> {
  if (Date.parse(tokens.expiresAt) - Date.now() > 60_000) return tokens
  if (!tokens.refreshToken) return null
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }, tokens, request)
}
