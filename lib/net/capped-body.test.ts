import { describe, it, expect } from 'vitest'
import { readCappedText } from './capped-body'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s))
      c.close()
    },
  })
}

const post = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request('https://example.test/hook', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)

describe('readCappedText (SEC-030)', () => {
  it('returns the body when it fits', async () => {
    expect(await readCappedText(post('{"a":"é"}'), 64)).toBe('{"a":"é"}')
  })

  it('returns an empty string for an empty body', async () => {
    expect(await readCappedText(post(null), 64)).toBe('')
  })

  it('refuses a declared Content-Length over the cap without reading', async () => {
    const req = post('small', { 'content-length': '999999' })
    expect(await readCappedText(req, 64)).toBeNull()
  })

  it('refuses a streamed body that passes the cap with no Content-Length', async () => {
    const req = post(streamOf(['x'.repeat(40), 'x'.repeat(40)]))
    expect(req.headers.get('content-length')).toBeNull()
    expect(await readCappedText(req, 64)).toBeNull()
  })

  it('keeps a multibyte character split across chunks intact', async () => {
    const bytes = new TextEncoder().encode('ü')
    const req = post(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, 1))
          c.enqueue(bytes.slice(1))
          c.close()
        },
      }),
    )
    expect(await readCappedText(req, 64)).toBe('ü')
  })
})
