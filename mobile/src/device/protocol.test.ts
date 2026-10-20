/// <reference types="node" />
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeRequest, LineSplitter, parseLine, timeoutFor, MAX_REQUEST_BYTES } from './protocol.ts'
import { base64ToBytes, bytesToBase64, utf8Encode, Utf8Stream } from './bytes.ts'

test('a request is one rpc line with args defaulting to {}', () => {
  assert.equal(encodeRequest(7, 'system.status'), 'rpc {"id":7,"cmd":"system.status","args":{}}\n')
  assert.equal(encodeRequest(8, 'screen.nav', { key: 'next' }), 'rpc {"id":8,"cmd":"screen.nav","args":{"key":"next"}}\n')
  assert.ok(utf8Encode(encodeRequest(1, 'frequency.write_tag', { url: 'https://frequencylocal.com/n/' + 'a'.repeat(36) + '?s=v1.abc.' + 'x'.repeat(22) })).length < MAX_REQUEST_BYTES)
})

test('replies, failures and events parse; everything else is other', () => {
  assert.deepEqual(parseLine('@rpc {"id":3,"ok":true,"data":{"os":"CyberUnicorn 5000"}}'), {
    kind: 'rpc',
    reply: { id: 3, ok: true, data: { os: 'CyberUnicorn 5000' } },
  })
  assert.deepEqual(parseLine('@rpc {"id":4,"ok":false,"error":"not_available","message":"led app not built"}'), {
    kind: 'rpc',
    reply: { id: 4, ok: false, error: 'not_available', message: 'led app not built' },
  })
  assert.deepEqual(parseLine('@rpc {"id":null,"ok":false,"error":"bad_json","message":"x"}'), {
    kind: 'rpc',
    reply: { id: null, ok: false, error: 'bad_json', message: 'x' },
  })
  assert.deepEqual(parseLine('@evt {"event":"lightshow.state","data":{"running":true}}'), {
    kind: 'evt',
    event: { event: 'lightshow.state', data: { running: true } },
  })
  // The full-width prefix the brief wrote is accepted too.
  assert.equal(parseLine('＠rpc {"id":1,"ok":true,"data":{}}').kind, 'rpc')
  // Bruce's logs, the prompt, and a protocol line with a log glued inside it.
  assert.equal(parseLine('COMMAND: rpc').kind, 'other')
  assert.equal(parseLine('# ').kind, 'other')
  assert.equal(parseLine('@evt {"event":"lightshow.st[CLI] hello').kind, 'other')
  assert.equal(parseLine('@rpc [1,2]').kind, 'other')
})

test('the splitter joins chunks, keeps the tail and drops blank lines', () => {
  const s = new LineSplitter()
  assert.deepEqual(s.push('\n@rpc {"id":1,'), [])
  assert.deepEqual(s.push('"ok":true}\r\n\n[CLI] log\n@ev'), ['@rpc {"id":1,"ok":true}', '[CLI] log'])
  assert.deepEqual(s.push('t {"event":"x"}\n'), ['@evt {"event":"x"}'])
})

test('slow commands get longer timeouts', () => {
  assert.equal(timeoutFor('system.status'), 5000)
  assert.ok(timeoutFor('hat.probe') > 5000)
  assert.ok(timeoutFor('frequency.write_tag') > timeoutFor('cli.run'))
})

test('base64 round-trips and a UTF-8 character split across chunks survives', () => {
  const text = 'Seed of Life ✦ 🦄 café'
  const bytes = utf8Encode(text)
  assert.deepEqual(base64ToBytes(bytesToBase64(bytes)), bytes)
  for (let cut = 0; cut <= bytes.length; cut++) {
    const d = new Utf8Stream()
    assert.equal(d.push(bytes.subarray(0, cut)) + d.push(bytes.subarray(cut)), text)
  }
  assert.equal(new Utf8Stream().push(Uint8Array.from([0x41, 0xff, 0x42])), 'A�B')
})
