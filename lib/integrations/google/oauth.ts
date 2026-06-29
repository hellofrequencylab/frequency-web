// Google OAuth 2.0 — the auth-URL builder + the one-shot code→token exchange (ADR-374). Plain `fetch`
// against Google's documented endpoints (no googleapis/google-auth-library dependency, keeping the
// install footprint and supply-chain surface at zero). We request `access_type=online`, so Google
// issues only a short-lived access token and NO refresh token — the import pulls contacts once and
// nothing long-lived is ever stored. Server-only (the secret is used in the exchange).

import { GOOGLE_CONTACTS_SCOPE } from './config'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

/** Build the Google consent URL the member is redirected to. PURE. `access_type=online` + `prompt=
 *  consent` means: no refresh token, and the consent UI shows each time (correct for a one-shot pull). */
export function buildAuthUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
  scope?: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: opts.scope ?? GOOGLE_CONTACTS_SCOPE,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: opts.state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export interface GoogleTokens {
  accessToken: string
  expiresIn: number
  scope: string
  tokenType: string
}

/** Exchange an authorization code for an access token. Returns null on any failure (FAIL-SAFE — the
 *  caller redirects back with ?import=error). The `redirect_uri` MUST match the one used at /start. */
export async function exchangeCodeForTokens(opts: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<GoogleTokens | null> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: opts.code,
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        redirect_uri: opts.redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      access_token?: string
      expires_in?: number
      scope?: string
      token_type?: string
    }
    if (!json.access_token) return null
    return {
      accessToken: json.access_token,
      expiresIn: json.expires_in ?? 3600,
      scope: json.scope ?? '',
      tokenType: json.token_type ?? 'Bearer',
    }
  } catch {
    return null
  }
}
