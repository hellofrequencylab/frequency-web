import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { checkSecurityHeaders, REQUIRED_HEADERS } from './check-security-headers.mjs'

// SCAN-1144: next.config.ts is the only place the security headers are set, and nothing used to
// notice one going missing. Each case below removes or weakens one and expects it to be named.

const real = readFileSync('next.config.ts', 'utf8')

describe('check-security-headers', () => {
  it('passes on the real next.config.ts', () => {
    expect(checkSecurityHeaders(real)).toEqual([])
  })

  it.each(REQUIRED_HEADERS)('names %s when it is dropped', (key) => {
    const without = real.replace(new RegExp(`\\s*\\{ key: '${key}',[^\\n]*\\},?\\n`), '\n')
    expect(without).not.toBe(real)
    expect(checkSecurityHeaders(without).join(' ')).toContain(key)
  })

  it('rejects a short HSTS max-age and a lost includeSubDomains', () => {
    const weak = real.replace('max-age=63072000; includeSubDomains; preload', 'max-age=300')
    const out = checkSecurityHeaders(weak).join(' ')
    expect(out).toContain('max-age is 300')
    expect(out).toContain('includeSubDomains')
  })

  it('rejects a CSP that lost object-src', () => {
    const weak = real.replace(`"object-src 'none'",`, '')
    expect(checkSecurityHeaders(weak).join(' ')).toContain("object-src 'none'")
  })

  it('rejects a Permissions-Policy that opens the camera to everyone', () => {
    const weak = real.replace("'camera=(), microphone=(), geolocation=(self)'", "'camera=*, microphone=(), geolocation=(self)'")
    expect(checkSecurityHeaders(weak).length).toBeGreaterThan(0)
  })

  it('rejects headers() that stops applying the baseline', () => {
    const weak = real.replace("{ source: '/:path*', headers: securityHeaders }", "{ source: '/none', headers: securityHeaders }")
    expect(checkSecurityHeaders(weak).join(' ')).toContain('/:path*')
  })

  it('says so when the array is gone entirely', () => {
    expect(checkSecurityHeaders('export default {}')[0]).toContain('securityHeaders')
  })
})
