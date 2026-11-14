import { generateKeyPairSync, verify } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { getGoogleReportingAccessToken, GOOGLE_ANALYTICS_READ_SCOPE } from './google-auth'

describe('Google readonly credential boundary', () => {
  it('reuses an explicitly supplied short-lived access binding without inspecting ADC files', async () => {
    const readCredentialFile = vi.fn()
    const request = vi.fn()
    const token = await getGoogleReportingAccessToken({ env: { GA4_REPORTING_ACCESS_TOKEN: 'injected-access', GOOGLE_APPLICATION_CREDENTIALS: '/private/file' }, readCredentialFile, request })
    expect(token).toBe('injected-access')
    expect(readCredentialFile).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  })
  it('does not treat unrelated platform/authorized-user ADC as Analytics access', async () => {
    const request = vi.fn()
    const token = await getGoogleReportingAccessToken({ env: { GOOGLE_APPLICATION_CREDENTIALS: '/private/file' }, readCredentialFile: async () => JSON.stringify({ type: 'external_account', token_url: 'https://elsewhere.test' }), request })
    expect(token).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })
  it('signs only a readonly-scope JWT for the fixed Google token endpoint and caches the issued token', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const env = { GA4_REPORTING_CREDENTIALS_JSON: JSON.stringify({ type: 'service_account', client_email: 'reporter@example.iam.gserviceaccount.com', private_key: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), token_uri: 'https://oauth2.googleapis.com/token' }) }
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'issued-token', expires_in: 3600, token_type: 'Bearer' })))
    expect(await getGoogleReportingAccessToken({ env, request, now: () => 100_000 })).toBe('issued-token')
    const [url, options] = request.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    const assertion = new URLSearchParams(options.body).get('assertion')!
    const [header, payload, signature] = assertion.split('.')
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    expect(claims.scope).toBe(GOOGLE_ANALYTICS_READ_SCOPE)
    expect(claims.aud).toBe(url)
    expect(verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), keys.publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
    expect(await getGoogleReportingAccessToken({ env, request, now: () => 120_000 })).toBe('issued-token')
    expect(request).toHaveBeenCalledTimes(1)
  })
  it('rejects token endpoint replacement and malformed response tokens', async () => {
    const request = vi.fn()
    const env = { GA4_REPORTING_CREDENTIALS_JSON: JSON.stringify({ type: 'service_account', client_email: 'x@example.com', private_key: 'not-used', token_uri: 'https://attacker.test/token' }) }
    expect(await getGoogleReportingAccessToken({ env, request })).toBeNull()
    expect(request).not.toHaveBeenCalled()
    expect(await getGoogleReportingAccessToken({ env: { GA4_REPORTING_ACCESS_TOKEN: 'bad\r\nheader' } })).toBeNull()
  })
})
