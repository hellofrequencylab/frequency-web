import { describe, it, expect } from 'vitest'
import { buildAuthUrl } from './oauth'
import { GOOGLE_CONTACTS_SCOPE } from './config'

describe('buildAuthUrl', () => {
  const base = {
    clientId: 'client-123.apps.googleusercontent.com',
    redirectUri: 'https://frequencylocal.com/api/integrations/google/callback',
    state: 'signed.state',
  }

  it('targets the Google consent endpoint with the required params', () => {
    const url = new URL(buildAuthUrl(base))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    const p = url.searchParams
    expect(p.get('client_id')).toBe(base.clientId)
    expect(p.get('redirect_uri')).toBe(base.redirectUri)
    expect(p.get('response_type')).toBe('code')
    expect(p.get('state')).toBe(base.state)
    expect(p.get('access_type')).toBe('online') // one-shot: no refresh token issued
    expect(p.get('prompt')).toBe('consent')
    expect(p.get('scope')).toBe(GOOGLE_CONTACTS_SCOPE)
  })

  it('honors a custom scope', () => {
    const url = new URL(buildAuthUrl({ ...base, scope: 'https://www.googleapis.com/auth/userinfo.email' }))
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/userinfo.email')
  })
})
