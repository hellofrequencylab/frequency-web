import { beforeEach, describe, expect, it, vi } from 'vitest'
const lookup = vi.hoisted(() => vi.fn())
vi.mock('node:dns/promises', () => ({ lookup }))
import { styleWithInlinedLogo } from './raster'
import { DEFAULT_STYLE } from './style'
const fetchMock = vi.fn()
const style = { ...DEFAULT_STYLE, logo: 'https://logo.example/avatar.png' }
beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset(); lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) })
describe('remote QR logo isolation', () => {
  it('rejects redirects instead of following an unchecked destination', async () => {
    fetchMock.mockImplementation(async (_url, options) => {
      expect(options.redirect).toBe('error')
      throw new TypeError('redirect blocked')
    })
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('does not fetch any hostname with a private DNS answer', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34' }, { address: '127.0.0.1' }])
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('inlines a bounded image stream without calling arrayBuffer', async () => {
    const response = new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })
    const buffer = vi.spyOn(response, 'arrayBuffer')
    fetchMock.mockResolvedValue(response)
    expect((await styleWithInlinedLogo(style)).logo).toBe('data:image/png;base64,AQID')
    expect(buffer).not.toHaveBeenCalled()
  })
  it('cancels an oversized chunked response before buffering the remaining body', async () => {
    const cancel = vi.fn()
    let reads = 0
    const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(256 * 1024)) }, cancel }, { highWaterMark: 0 })
    fetchMock.mockResolvedValue(new Response(body, { headers: { 'content-type': 'image/png' } }))
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(reads).toBe(3)
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('rejects excessive declared length before reading', async () => {
    const pull = vi.fn()
    const cancel = vi.fn()
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }), { headers: { 'content-type': 'image/png', 'content-length': '524289' } }))
    expect((await styleWithInlinedLogo(style)).logo).toBeNull()
    expect(pull).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
})
