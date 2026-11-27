import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { isPublicHost } = await import('./index')

describe('isPublicHost', () => {
  it('refuses private, loopback and link-local addresses before any fetch', () => {
    for (const h of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '169.254.169.254', '[::1]', 'localhost', 'printer.local', 'db.internal']) {
      expect(isPublicHost(h)).toBe(false)
    }
  })
  it('lets a public name or address through to the pinned fetch', () => {
    expect(isPublicHost('example.com')).toBe(true)
    expect(isPublicHost('93.184.216.34')).toBe(true)
  })
})
