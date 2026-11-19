// Read an inbound request body with a hard byte cap (SEC-030). `req.text()` buffers whatever the caller
// sends, so a webhook that reads the body before it checks the signature lets an unauthenticated caller
// make the function hold an arbitrarily large body in memory. This refuses on a declared Content-Length
// over the cap, then counts the bytes actually streamed (a chunked or lying sender has no honest
// header) and stops reading the moment the cap is passed.

/** The body as UTF-8 text, or `null` when it is (or declares itself) larger than `maxBytes`. */
export async function readCappedText(req: Request, maxBytes: number): Promise<string | null> {
  const declared = req.headers.get('content-length')
  if (declared !== null && declared.trim() !== '') {
    const n = Number(declared)
    if (!Number.isFinite(n) || n < 0 || n > maxBytes) return null
  }
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const buf = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    buf.set(c, at)
    at += c.byteLength
  }
  return new TextDecoder().decode(buf)
}
