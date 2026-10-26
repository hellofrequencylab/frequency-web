import { EventEmitter } from 'node:events'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))
vi.mock('@/lib/site', () => ({ SITE_URL: 'https://app.example' }))
import { styleWithInlinedLogo } from './raster'
import { fetchPinnedLogo } from './remote-logo'
import { DEFAULT_STYLE, isPrivateIp } from './style'
const style = { ...DEFAULT_STYLE, logo: 'https://logo.example/avatar.png' }
let response: EventEmitter & { statusCode: number; headers: Record<string, string>; destroy: ReturnType<typeof vi.fn> }
let req: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }
let chunks: Buffer[]
beforeEach(() => {
  chunks = [Buffer.from([1, 2, 3])]
  response = Object.assign(new EventEmitter(), { statusCode: 200, headers: { 'content-type': 'image/png' }, destroy: vi.fn() })
  req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() })
  mocks.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  mocks.request.mockReset().mockImplementation((_url, _options, callback) => {
    req.end.mockImplementation(() => queueMicrotask(() => {
      callback(response)
      if (response.destroy.mock.calls.length) return
      for (const chunk of chunks) {
        response.emit('data', chunk)
        if (response.destroy.mock.calls.length) return
      }
      response.emit('end')
    }))
    return req
  })
})
afterEach(() => vi.useRealTimers())
describe('pinned remote QR logo connection', () => {
  it('uses the validated address even if later DNS would change, retaining the TLS hostname', async () => {
    mocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    expect((await styleWithInlinedLogo(style)).logo).toBe('data:image/png;base64,AQID')
    const [url, options] = mocks.request.mock.calls[0]
    expect(url.hostname).toBe('logo.example')
    expect(options.agent).toBe(false)
    expect(options.autoSelectFamily).toBe(false)
    const one = vi.fn()
    options.lookup('logo.example', {}, one)
    expect(one).toHaveBeenCalledWith(null, '93.184.216.34', 4)
    const all = vi.fn()
    options.lookup('logo.example', { all: true }, all)
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }])
    expect(mocks.lookup).toHaveBeenCalledOnce()
  })
  it('rejects redirects without requesting their destination', async () => {
    response.statusCode = 302
    response.headers.location = 'https://127.0.0.1/private'
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(response.destroy).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledOnce()
  })
  it.each(['127.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:a9fe:a9fe', '::ffff:192.168.1.1', '::ffff:ac10:1', '::ffff:6440:1'])('blocks private DNS answer %s before any connection', async address => {
    expect(isPrivateIp(address)).toBe(true)
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }])
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('validates public IPv6 literals without DNS and blocks mapped-private literal URLs', async () => {
    expect(await fetchPinnedLogo(new URL('https://[2606:4700:4700::1111]/logo'))).toBe('data:image/png;base64,AQID')
    expect(mocks.lookup).not.toHaveBeenCalled()
    mocks.request.mockClear()
    expect(await fetchPinnedLogo(new URL('https://[::ffff:127.0.0.1]/logo'))).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('cancels the connection as soon as chunked bytes exceed the cap', async () => {
    chunks = [Buffer.alloc(256 * 1024), Buffer.alloc(256 * 1024), Buffer.alloc(1), Buffer.alloc(1)]
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(response.destroy).toHaveBeenCalledOnce()
    expect(req.destroy).toHaveBeenCalledOnce()
  })
  it('rejects excessive declared size before reading body chunks', async () => {
    response.headers['content-length'] = '524289'
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(response.listenerCount('data')).toBe(0)
  })
  it('accepts exactly the byte cap', async () => {
    chunks = [Buffer.alloc(512 * 1024)]
    expect((await styleWithInlinedLogo(style)).logo?.length).toBeGreaterThan(512 * 1024)
  })
  it('applies a four-second deadline to unresolved DNS without opening a late connection', async () => {
    vi.useFakeTimers()
    let finishDns!: (value: { address: string; family: number }[]) => void
    mocks.lookup.mockImplementation(() => new Promise(resolve => { finishDns = resolve }))
    const result = styleWithInlinedLogo(style)
    await vi.advanceTimersByTimeAsync(4000)
    expect((await result).logo).toBeNull()
    finishDns([{ address: '93.184.216.34', family: 4 }])
    await Promise.resolve()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('applies the same deadline to a stalled response', async () => {
    vi.useFakeTimers()
    mocks.request.mockImplementation(() => req)
    const result = styleWithInlinedLogo(style)
    await vi.advanceTimersByTimeAsync(4000)
    expect((await result).logo).toBeNull()
    expect(req.destroy).toHaveBeenCalledOnce()
  })
  it('resolves same-origin paths over HTTPS and rejects HTTP/private origins', async () => {
    expect((await styleWithInlinedLogo({ ...style, logo: '/icons/icon.png' })).logo).toBe('data:image/png;base64,AQID')
    expect(mocks.request.mock.calls[0][0].hostname).toBe('app.example')
    mocks.request.mockClear()
    expect(await fetchPinnedLogo(new URL('http://localhost:3000/icon.png'))).toBeNull()
    expect(await fetchPinnedLogo(new URL('https://localhost/icon.png'))).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
