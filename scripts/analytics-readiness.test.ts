import { describe, expect, it, vi } from 'vitest'
import { verifyAnalyticsReadiness } from './analytics-readiness.mjs'

const configured = { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-secret-value', SUPABASE_SERVICE_ROLE_KEY: 'server-secret-value' }
describe('analytics activation readiness', () => {
  it('reports missing configuration without attempting an authenticated database request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Frequency', { status: 200 }))
    const result = await verifyAnalyticsReadiness({ env: {}, fetchImpl })
    expect(result.ready).toBe(false)
    expect(result.checks.configuration.missing).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(result.checks.snapshot.state).toBe('blocked')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(result.checks.web.state).toBe('verified')
  })
  it('requires a valid snapshot contract and successful page, not merely configured values', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('Frequency', { status: 200 }))
    const result = await verifyAnalyticsReadiness({ env: configured, fetchImpl })
    expect(result.checks.configuration.state).toBe('configured')
    expect(result.checks.snapshot.state).toBe('blocked')
    expect(result.ready).toBe(false)
    expect(JSON.stringify(result)).not.toContain('server-secret-value')
    expect(JSON.stringify(result)).not.toContain('anon-secret-value')
  })
  it('keeps Google optional until selected, and makes explicit Google failure block readiness', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url: URL) => url.pathname.includes('/rest/') ? new Response('{}') : new Response('Frequency'))
    const optional = await verifyAnalyticsReadiness({ env: configured, fetchImpl, validateSnapshot: () => true })
    expect(optional.ready).toBe(true)
    expect(optional.googleRequired).toBe(false)
    const verifyGoogle = vi.fn().mockResolvedValue({ state: 'blocked', reason: 'No access', propertyConfigured: true, credentialConfigured: true })
    const required = await verifyAnalyticsReadiness({ env: { ...configured, GA4_REPORTING_PROPERTY_ID: '123' }, fetchImpl, validateSnapshot: () => true, verifyGoogle })
    expect(verifyGoogle).toHaveBeenCalledWith({ env: { ...configured, GA4_REPORTING_PROPERTY_ID: '123' }, request: fetchImpl })
    expect(required.ready).toBe(false)
  })
  it('does not expose credential-bearing transport errors or follow authenticated redirects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('server-secret-value at private-host'))
    const result = await verifyAnalyticsReadiness({ env: configured, fetchImpl })
    expect(JSON.stringify(result)).not.toContain('server-secret-value')
    expect(JSON.stringify(result)).not.toContain('private-host')
    expect(fetchImpl.mock.calls[0][1].redirect).toBe('error')
    expect(result.ready).toBe(false)
  })
  it('does not treat an HTTP 500 or a login redirect as a working page', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Frequency error', { status: 500 }))
    const result = await verifyAnalyticsReadiness({ env: {}, fetchImpl })
    expect(result.checks.web).toMatchObject({ state: 'blocked', httpStatus: 500 })
  })
  it('does not send database credentials to a non-local plaintext endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Frequency'))
    const result = await verifyAnalyticsReadiness({ env: { ...configured, NEXT_PUBLIC_SUPABASE_URL: 'http://insecure.example' }, fetchImpl })
    expect(result.checks.snapshot.state).toBe('blocked')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0][1].headers).toBeUndefined()
  })
})
