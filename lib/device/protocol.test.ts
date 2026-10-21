import { describe, expect, it } from 'vitest'
import { encodeRequest, LineSplitter, MAX_REQUEST_BYTES, parseLine, redactLine, timeoutFor } from './protocol'
import { RpcClient } from './client'
import { Emitter, type Transport } from './transport'

describe('CyberUnicorn protocol, host half', () => {
  it('a request is one rpc line with args defaulting to {}', () => {
    expect(encodeRequest(7, 'system.status')).toBe('rpc {"id":7,"cmd":"system.status","args":{}}\n')
    const card = encodeRequest(1, 'frequency.write_tag', {
      url: 'https://frequencylocal.com/c/' + 'x'.repeat(22),
      label: 'member:someone',
      timeout_ms: 30000,
    })
    expect(new TextEncoder().encode(card).length).toBeLessThan(MAX_REQUEST_BYTES)
  })

  it('parses replies and events and ignores Bruce logs', () => {
    expect(parseLine('@rpc {"id":3,"ok":true,"data":{"os":"CyberUnicorn 5000"}}')).toEqual({
      kind: 'rpc',
      reply: { id: 3, ok: true, data: { os: 'CyberUnicorn 5000' } },
    })
    expect(parseLine('@rpc {"id":4,"ok":false,"error":"timeout","message":"No card"}')).toEqual({
      kind: 'rpc',
      reply: { id: 4, ok: false, error: 'timeout', message: 'No card' },
    })
    expect(parseLine('@evt {"event":"frequency.waiting_for_tag","data":{}}').kind).toBe('evt')
    expect(parseLine('COMMAND: rpc').kind).toBe('other')
    expect(parseLine('@evt {"event":"x[CLI] glued').kind).toBe('other')
  })

  it('splits chunks into lines and drops blanks', () => {
    const s = new LineSplitter()
    expect(s.push('\n@rpc {"id":1,')).toEqual([])
    expect(s.push('"ok":true}\r\n\n[CLI] log\n')).toEqual(['@rpc {"id":1,"ok":true}', '[CLI] log'])
  })

  it('tag commands wait longer than status', () => {
    expect(timeoutFor('frequency.write_tag')).toBeGreaterThan(timeoutFor('system.status'))
  })
})

function fakeTransport() {
  const text = new Emitter<string>()
  const closed = new Emitter<string>()
  const written: string[] = []
  const t: Transport = {
    kind: 'usb',
    label: 'fake',
    async write(line) {
      written.push(line)
    },
    onText: (l) => text.on(l),
    onClose: (l) => closed.on(l),
    async close() {},
  }
  return { t, text, closed, written }
}

describe('RpcClient', () => {
  it('matches a reply to its request and passes events through', async () => {
    const { t, text, written } = fakeTransport()
    const client = new RpcClient(t)
    const events: string[] = []
    client.events.on((e) => events.push(e.event))
    const reply = client.call('frequency.write_tag', { url: 'u' })
    await Promise.resolve()
    expect(written[0]).toContain('"cmd":"frequency.write_tag"')
    text.emit('\n@evt {"event":"frequency.waiting_for_tag","data":{}}\n')
    text.emit('[CLI] noise\n@rpc {"id":1,"ok":true,"data":{"uid":"04AABB"}}\n')
    await expect(reply).resolves.toEqual({ uid: '04AABB' })
    expect(events).toEqual(['frequency.waiting_for_tag'])
  })

  it('a device failure rejects with its code, and a custom timeout fires', async () => {
    const { t, text } = fakeTransport()
    const client = new RpcClient(t)
    const failed = client.call('frequency.write_tag', {})
    await Promise.resolve()
    text.emit('@rpc {"id":1,"ok":false,"error":"write_failed","message":"Write failed - hold still"}\n')
    await expect(failed).rejects.toMatchObject({ code: 'write_failed', detail: 'Write failed - hold still' })
    await expect(client.call('system.status', {}, { timeoutMs: 5 })).rejects.toMatchObject({ code: 'timeout' })
  })
})

describe('redactLine', () => {
  it('masks the provision secret, a Wi-Fi password and a relayed card token', () => {
    const provision = encodeRequest(3, 'frequency.provision', { device_id: 'd-1', secret: 'S'.repeat(43) }).trimEnd()
    expect(redactLine(provision)).toBe('rpc {"id":3,"cmd":"frequency.provision","args":{"device_id":"d-1","secret":"***"}}')
    expect(redactLine(encodeRequest(4, 'wifi.join', { ssid: 'Cafe', password: 'hunter22' }))).not.toContain('hunter22')
    const relay = `@evt ${JSON.stringify({ event: 'frequency.scan_relay', data: { nonce: 'n1', body: JSON.stringify({ card_token: 'T'.repeat(22), nonce: 'n1' }), signature: 'v1=abc' } })}`
    const out = redactLine(relay)
    expect(out).not.toContain('T'.repeat(22))
    expect(out).not.toContain('v1=abc')
    expect(out).toContain('frequency.scan_relay')
    expect(redactLine('write https://frequencylocal.com/c/abcdefghijklmnopqrstuv ok')).toBe('write https://frequencylocal.com/c/... ok')
  })
})

describe('RpcClient screen backlog', () => {
  it('a canvas that subscribes after display start still gets the frame since the last clear', () => {
    const { t } = fakeTransport()
    const screen = new Emitter<Uint8Array>()
    const client = new RpcClient({ ...t, onScreen: (l) => screen.on(l), setScreenStream() {} })
    client.setScreenStream(true)
    screen.emit(Uint8Array.of(0xaa, 5, 2, 0, 1)) // painted over by the clear below
    screen.emit(Uint8Array.of(0xaa, 5, 0, 0, 0)) // fillScreen
    screen.emit(Uint8Array.of(0xaa, 5, 2, 0, 2))
    const seen: number[] = []
    client.watchScreen((p) => seen.push(p[2]))
    screen.emit(Uint8Array.of(0xaa, 5, 14, 0, 3))
    expect(seen).toEqual([0, 2, 14])
    client.setScreenStream(false)
    const later: number[] = []
    client.watchScreen((p) => later.push(p[2]))
    expect(later).toEqual([])
  })
})
