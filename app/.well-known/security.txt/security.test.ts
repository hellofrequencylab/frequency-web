import { describe, expect, it } from 'vitest'
import { GET } from './route'

// SCAN-1278: a published security contact, valid under RFC 9116.
describe('security.txt', () => {
  it('names a contact and an Expires under a year out', async () => {
    const res = GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/plain')
    const body = await res.text()
    expect(body).toMatch(/^Contact: mailto:\S+@\S+$/m)
    const expires = body.match(/^Expires: (\S+)$/m)?.[1]
    expect(expires).toBeTruthy()
    const days = (Date.parse(expires!) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(200)
    expect(days).toBeLessThan(366)
  })
})
