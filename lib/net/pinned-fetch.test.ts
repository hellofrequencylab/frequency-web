import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetchPinned, isBlockedAddress } from './pinned-fetch'

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    '198.18.0.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fd00::1', 'fe80::1', 'ff02::1',
    '64:ff9b::7f00:1', '::ffff:127.0.0.1', '::ffff:7f00:1', '[::1]', 'not-an-ip',
  ])('blocks %s', (ip) => expect(isBlockedAddress(ip)).toBe(true))

  it.each(['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111'])('allows %s', (ip) =>
    expect(isBlockedAddress(ip)).toBe(false))
})

describe('fetchPinned', () => {
  let server: http.Server
  let port = 0
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/hop') res.writeHead(302, { location: '/ok' }).end()
      else res.writeHead(200, { 'content-type': 'text/plain' }).end('hello')
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => server.close())

  it('refuses a loopback server, directly and by redirect', async () => {
    expect(await fetchPinned(`http://127.0.0.1:${port}/ok`, { maxBytes: 100, timeoutMs: 2000 })).toBeNull()
    expect(await fetchPinned(`http://localhost:${port}/hop`, { maxBytes: 100, timeoutMs: 2000 })).toBeNull()
  })

  it('refuses non-http schemes and embedded credentials', async () => {
    expect(await fetchPinned('file:///etc/passwd', { maxBytes: 100, timeoutMs: 1000 })).toBeNull()
    expect(await fetchPinned('https://user:pw@example.com/', { maxBytes: 100, timeoutMs: 1000 })).toBeNull()
  })
})
